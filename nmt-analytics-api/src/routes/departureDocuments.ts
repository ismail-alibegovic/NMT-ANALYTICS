import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { registerUnicodeFonts } from '../lib/pdfFonts';
import PDFDocument from 'pdfkit';

const router = Router();

type CustBase = { first_name: string; last_name: string };
type CustFull = CustBase & { phone?: string; email?: string };

interface ManifestRow {
  rbr: number;
  passengerId: string | null;
  reservationId: string;
  fullName: string;
  docNumber: string;
  docType: string;
  docExpiry: string;
  dob: string;
  nationality: string;
  seat: string;
  hotel: string;
  room: string;
  phone: string;
  email: string;
  paid: number;
  total: number;
  debt: number;
  currency: string;
  notes: string;
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function formatDateBs(dateVal?: string | Date | null): string {
  if (!dateVal) return '—';
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('bs-BA');
}

/**
 * Loads and composes authoritative departure data, individual passengers,
 * room allocations, vehicle assignments, and financial balances.
 */
async function loadDepartureDocumentData(departureId: string, orgId: string) {
  const { data: departure } = await supabaseAdmin
    .from('departures')
    .select('*, packages:package_id(id, name, destination, currency, duration_days)')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .single();

  if (!departure) return null;

  // 1. Reservations
  const { data: resRows } = await supabaseAdmin
    .from('reservations')
    .select('id, party_size, customer_id, customers:customer_id(first_name, last_name, phone, email), hotel_name, room_type, check_in, check_out, total_amount, paid_amount, payment_status, currency, status, notes, tour_guide')
    .eq('departure_id', departure.id)
    .eq('org_id', orgId)
    .order('created_at');

  const reservations = (resRows || []) as any[];

  // 2. Departure Passengers
  const { data: passRows } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, reservation_id, full_name, phone, email, seat_number, notes, id_document_type, id_document_number, id_document_expiry, nationality, date_of_birth, reservation_accommodation_requirement_id')
    .eq('departure_id', departure.id)
    .eq('org_id', orgId)
    .order('seat_number', { ascending: true, nullsFirst: false });

  const passengers = (passRows || []) as any[];

  // 3. Room Slots & Assignments
  const { data: roomSlotsData } = await supabaseAdmin
    .from('departure_room_slots')
    .select('id, room_number, room_type, capacity, hotel_id, hotels:hotel_id(id, name, destination, stars), assignments:departure_room_slot_assignments(passenger_id)')
    .eq('departure_id', departure.id)
    .eq('org_id', orgId)
    .order('room_number', { ascending: true });

  const roomSlots = (roomSlotsData || []) as any[];

  // 4. Vehicle assignment
  const { data: vehicleData } = await supabaseAdmin
    .from('departure_vehicle_assignments')
    .select('id, vehicle_label, registration_number, capacity, layout_type')
    .eq('departure_id', departure.id)
    .eq('org_id', orgId)
    .maybeSingle();

  const vehicle = vehicleData || null;

  // Build lookup for passenger -> room
  const passengerRoomMap: Record<string, { roomNumber?: string; roomType?: string; hotelName?: string }> = {};
  for (const slot of roomSlots) {
    const hotelName = slot.hotels?.name || 'Hotel';
    for (const assign of (slot.assignments || [])) {
      if (assign.passenger_id) {
        passengerRoomMap[assign.passenger_id] = {
          roomNumber: slot.room_number ? String(slot.room_number) : undefined,
          roomType: slot.room_type,
          hotelName,
        };
      }
    }
  }

  // Compose manifest rows
  const manifestRows: ManifestRow[] = [];
  const passengersByRes: Record<string, any[]> = {};
  for (const p of passengers) {
    if (p.reservation_id) {
      (passengersByRes[p.reservation_id] ||= []).push(p);
    }
  }

  let rbr = 0;
  for (const r of reservations) {
    const c = r.customers as CustFull | null;
    const custFullName = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'Gost';
    const resPass = passengersByRes[r.id] || [];
    const paid = Number(r.paid_amount || 0);
    const total = Number(r.total_amount || 0);
    const debt = Math.max(0, total - paid);
    const currency = r.currency || (departure as any).packages?.currency || 'BAM';

    if (resPass.length > 0) {
      for (const p of resPass) {
        rbr++;
        const pRoom = passengerRoomMap[p.id];
        manifestRows.push({
          rbr,
          passengerId: p.id,
          reservationId: r.id,
          fullName: p.full_name || custFullName,
          docNumber: p.id_document_number || '—',
          docType: p.id_document_type || 'Pasoš',
          docExpiry: formatDateBs(p.id_document_expiry),
          dob: formatDateBs(p.date_of_birth),
          nationality: p.nationality || '—',
          seat: p.seat_number ? String(p.seat_number) : '—',
          hotel: pRoom?.hotelName || r.hotel_name || '—',
          room: pRoom?.roomNumber ? `Soba ${pRoom.roomNumber}` : (pRoom?.roomType || r.room_type || '—'),
          phone: p.phone || c?.phone || '—',
          email: p.email || c?.email || '—',
          paid,
          total,
          debt,
          currency,
          notes: p.notes || r.notes || '—',
        });
      }
    } else {
      // Reservation fallback
      rbr++;
      manifestRows.push({
        rbr,
        passengerId: null,
        reservationId: r.id,
        fullName: custFullName + (r.party_size > 1 ? ` (+${r.party_size - 1})` : ''),
        docNumber: '—',
        docType: 'Pasoš',
        docExpiry: '—',
        dob: '—',
        nationality: '—',
        seat: '—',
        hotel: r.hotel_name || '—',
        room: r.room_type || '—',
        phone: c?.phone || '—',
        email: c?.email || '—',
        paid,
        total,
        debt,
        currency,
        notes: r.notes || '—',
      });
    }
  }

  return {
    departure,
    package: (departure as any).packages,
    reservations,
    passengers,
    roomSlots,
    vehicle,
    manifestRows,
  };
}

// ---------------------------------------------------------------------------
// 1. PASSENGER MANIFEST (PDF)
// ---------------------------------------------------------------------------
router.get('/departures/:id/manifest.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { departure, package: pkg, reservations, vehicle, manifestRows } = data;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  registerUnicodeFonts(doc);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="manifest-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  // Document Title & Metadata
  doc.fontSize(16).font('DejaVu-Bold').fillColor('#111827').text(`PUTNIČKI MANIFEST — ${pkg?.name || departure.id}`);
  doc.fontSize(9).font('DejaVu').fillColor('#4B5563').text(
    `${pkg?.destination || ''} · ${formatDateBs(departure.depart_at)} — ${formatDateBs(departure.return_at)}` +
    (vehicle ? ` · Vozilo: ${vehicle.vehicle_label}${vehicle.registration_number ? ` (${vehicle.registration_number})` : ''}` : '')
  );
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor('#6B7280').text(
    `Ukupno: ${manifestRows.length} putnika · ${reservations.length} rezervacija · Generisano: ${new Date().toLocaleDateString('bs-BA')} ${new Date().toLocaleTimeString('bs-BA')}`
  );
  doc.moveDown(0.6);

  if (!manifestRows.length) {
    doc.fontSize(10).font('DejaVu').fillColor('#374151').text('Nema evidentiranih putnika za ovaj polazak.');
    doc.end();
    return;
  }

  let y = doc.y + 5;
  const rowH = 17;
  const cols = {
    rbr: 25,
    name: 140,
    doc: 95,
    dob: 65,
    nat: 40,
    seat: 35,
    hotel: 115,
    phone: 85,
    res: 85,
    notes: 95,
  };

  const drawHeader = () => {
    let x = 30;
    doc.rect(30, y - 3, 780, rowH).fill('#F3F4F6');
    doc.fontSize(8).font('DejaVu-Bold').fillColor('#1F2937');
    doc.text('#', x, y); x += cols.rbr;
    doc.text('Ime i prezime', x, y); x += cols.name;
    doc.text('Dokument / Pasoš', x, y); x += cols.doc;
    doc.text('Rođenje', x, y); x += cols.dob;
    doc.text('Drž.', x, y); x += cols.nat;
    doc.text('Sjed.', x, y); x += cols.seat;
    doc.text('Smještaj / Soba', x, y); x += cols.hotel;
    doc.text('Telefon', x, y); x += cols.phone;
    doc.text('Rezervacija / Dug', x, y); x += cols.res;
    doc.text('Napomena', x, y);
    y += rowH;
  };

  drawHeader();
  doc.font('DejaVu');

  for (const m of manifestRows) {
    if (y > 540) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
      y = 30;
      drawHeader();
      doc.font('DejaVu');
    }

    let x = 30;
    doc.fontSize(7.5).fillColor('#111827');
    doc.text(String(m.rbr), x, y); x += cols.rbr;
    doc.font('DejaVu-Bold').text(m.fullName, x, y, { width: cols.name - 5, lineBreak: false }); x += cols.name;
    doc.font('DejaVu').text(m.docNumber !== '—' ? `${m.docNumber}` : '—', x, y, { width: cols.doc - 5, lineBreak: false }); x += cols.doc;
    doc.text(m.dob, x, y, { width: cols.dob - 5, lineBreak: false }); x += cols.dob;
    doc.text(m.nationality, x, y, { width: cols.nat - 5, lineBreak: false }); x += cols.nat;
    doc.font('DejaVu-Bold').text(m.seat, x, y); doc.font('DejaVu'); x += cols.seat;
    doc.text(`${m.hotel}${m.room !== '—' ? ` (${m.room})` : ''}`, x, y, { width: cols.hotel - 5, lineBreak: false }); x += cols.hotel;
    doc.text(m.phone, x, y, { width: cols.phone - 5, lineBreak: false }); x += cols.phone;
    doc.text(m.debt > 0 ? `${m.reservationId} (dug: ${m.debt})` : `${m.reservationId} (plaćeno)`, x, y, { width: cols.res - 5, lineBreak: false }); x += cols.res;
    doc.text(m.notes, x, y, { width: cols.notes - 5, lineBreak: false });

    // Underline
    doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(30, y + rowH - 4).lineTo(810, y + rowH - 4).stroke();
    y += rowH;
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// 2. PASSENGER MANIFEST (CSV)
// ---------------------------------------------------------------------------
router.get('/departures/:id/manifest.csv', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const headers = [
    'Rbr',
    'Ime i prezime',
    'Broj dokumenta',
    'Tip dokumenta',
    'Vazenje dokumenta',
    'Datum rodjenja',
    'Drzavljanstvo',
    'Sjediste',
    'Hotel',
    'Soba',
    'Telefon',
    'Email',
    'Rezervacija ID',
    'Placeno',
    'Ukupno',
    'Dug',
    'Valuta',
    'Napomena',
  ];

  const rows = data.manifestRows.map((m) => [
    escapeCsv(m.rbr),
    escapeCsv(m.fullName),
    escapeCsv(m.docNumber),
    escapeCsv(m.docType),
    escapeCsv(m.docExpiry),
    escapeCsv(m.dob),
    escapeCsv(m.nationality),
    escapeCsv(m.seat),
    escapeCsv(m.hotel),
    escapeCsv(m.room),
    escapeCsv(m.phone),
    escapeCsv(m.email),
    escapeCsv(m.reservationId),
    escapeCsv(m.paid),
    escapeCsv(m.total),
    escapeCsv(m.debt),
    escapeCsv(m.currency),
    escapeCsv(m.notes),
  ]);

  const csvOutput = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="manifest-${data.departure.id.slice(0, 8)}.csv"`);
  res.send(csvOutput);
});

// ---------------------------------------------------------------------------
// 3. ROOMING LIST (PDF)
// ---------------------------------------------------------------------------
router.get('/departures/:id/rooming-list.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { departure, package: pkg, reservations, roomSlots, passengers } = data;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  registerUnicodeFonts(doc);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="rooming-list-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('DejaVu-Bold').fillColor('#111827').text(`HOTELSKA ROOMING LISTA — ${pkg?.name || departure.id}`);
  doc.fontSize(9).font('DejaVu').fillColor('#4B5563').text(
    `${pkg?.destination || ''} · ${formatDateBs(departure.depart_at)} — ${formatDateBs(departure.return_at)}`
  );
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor('#6B7280').text(
    `Generisano: ${new Date().toLocaleDateString('bs-BA')} ${new Date().toLocaleTimeString('bs-BA')} · Ukupno rezervacija: ${reservations.length}`
  );
  doc.moveDown(0.8);

  const passengerById = new Map<string, any>(passengers.map((p) => [p.id, p]));

  // If canonical room slots exist, render by slots
  if (roomSlots.length > 0) {
    const slotsByHotel: Record<string, any[]> = {};
    for (const slot of roomSlots) {
      const hName = slot.hotels?.name || 'Hotel';
      (slotsByHotel[hName] ||= []).push(slot);
    }

    let grandTotal = 0;
    for (const [hotelName, slots] of Object.entries(slotsByHotel)) {
      if (doc.y > 700) doc.addPage();
      const hotelTotal = slots.reduce((s, slot) => s + (slot.assignments?.length || 0), 0);
      grandTotal += hotelTotal;

      doc.fontSize(12).font('DejaVu-Bold').fillColor('#1D4ED8').text(`${hotelName} (${hotelTotal} gostiju)`);
      doc.moveDown(0.3);

      for (const slot of slots) {
        if (doc.y > 740) doc.addPage();
        const occupantNames = (slot.assignments || [])
          .map((a: any) => {
            const pax = passengerById.get(a.passenger_id);
            return pax ? `${pax.full_name || 'Putnik'}${pax.id_document_number ? ` (${pax.id_document_number})` : ''}` : 'Zauzeto';
          })
          .join(', ') || 'Nema raspoređenih gostiju';

        doc.fontSize(9).font('DejaVu-Bold').fillColor('#111827')
          .text(`  Soba ${slot.room_number || '—'} · ${slot.room_type || 'Standard'} (kapacitet: ${slot.capacity}): `, { continued: true })
          .font('DejaVu').fillColor('#374151')
          .text(occupantNames);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.6);
    }

    doc.moveDown().fontSize(9).font('DejaVu-Bold').fillColor('#6B7280').text(`Ukupno raspoređeno: ${grandTotal} putnika.`);
  } else {
    // Fallback: group reservations by hotel
    const hotels: Record<string, { roomType: string; guests: string; total: number }[]> = {};
    for (const r of reservations) {
      const hotel = r.hotel_name || 'Bez navedenog hotela';
      const c = r.customers as CustBase | null;
      (hotels[hotel] ||= []).push({
        roomType: r.room_type || 'Standard',
        guests: c ? `${c.first_name || ''} ${c.last_name || ''}${r.party_size > 1 ? ` (+${r.party_size - 1})` : ''}` : `${r.party_size} putnika`,
        total: r.party_size,
      });
    }

    let grandTotal = 0;
    for (const [hotel, rooms] of Object.entries(hotels)) {
      if (doc.y > 700) doc.addPage();
      const hotelTotal = rooms.reduce((s, r) => s + r.total, 0);
      grandTotal += hotelTotal;
      doc.fontSize(12).font('DejaVu-Bold').fillColor('#1D4ED8').text(`${hotel} (${hotelTotal} putnika)`).font('DejaVu');
      doc.moveDown(0.2);
      for (const room of rooms) {
        if (doc.y > 740) doc.addPage();
        doc.fontSize(9).text(`  ${room.roomType} × ${room.total}: ${room.guests}`);
      }
      doc.moveDown(0.5);
    }
    doc.moveDown().fontSize(9).font('DejaVu-Bold').fillColor('#6B7280').text(`Ukupno: ${grandTotal} putnika.`);
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// 4. ROOMING LIST (CSV)
// ---------------------------------------------------------------------------
router.get('/departures/:id/rooming-list.csv', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { departure, roomSlots, passengers, reservations } = data;
  const passengerById = new Map<string, any>(passengers.map((p) => [p.id, p]));

  const headers = ['Hotel', 'Broj sobe', 'Tip sobe', 'Kapacitet', 'Ime i prezime gosta', 'Dokument / Pasoš', 'Drzavljanstvo', 'Rezervacija ID'];
  const rows: string[][] = [];

  if (roomSlots.length > 0) {
    for (const slot of roomSlots) {
      const hName = slot.hotels?.name || 'Hotel';
      const assignments = slot.assignments || [];
      if (assignments.length > 0) {
        for (const assign of assignments) {
          const pax = passengerById.get(assign.passenger_id);
          rows.push([
            escapeCsv(hName),
            escapeCsv(slot.room_number || '—'),
            escapeCsv(slot.room_type || '—'),
            escapeCsv(slot.capacity || 1),
            escapeCsv(pax ? pax.full_name : 'Gost'),
            escapeCsv(pax?.id_document_number || '—'),
            escapeCsv(pax?.nationality || '—'),
            escapeCsv(pax?.reservation_id?.slice(0, 8) || '—'),
          ]);
        }
      } else {
        rows.push([
          escapeCsv(hName),
          escapeCsv(slot.room_number || '—'),
          escapeCsv(slot.room_type || '—'),
          escapeCsv(slot.capacity || 1),
          escapeCsv('Prazna soba'),
          escapeCsv('—'),
          escapeCsv('—'),
          escapeCsv('—'),
        ]);
      }
    }
  } else {
    for (const r of reservations) {
      const c = r.customers as CustFull | null;
      rows.push([
        escapeCsv(r.hotel_name || 'Bez hotela'),
        escapeCsv('—'),
        escapeCsv(r.room_type || 'Standard'),
        escapeCsv(r.party_size || 1),
        escapeCsv(c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'Gost'),
        escapeCsv('—'),
        escapeCsv('—'),
        escapeCsv(r.id?.slice(0, 8) || '—'),
      ]);
    }
  }

  const csvOutput = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rooming-list-${departure.id.slice(0, 8)}.csv"`);
  res.send(csvOutput);
});

// ---------------------------------------------------------------------------
// 5. BUS SEATING MANIFEST (PDF)
// ---------------------------------------------------------------------------
router.get('/departures/:id/bus-seating.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { departure, package: pkg, vehicle, passengers, reservations } = data;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  registerUnicodeFonts(doc);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="bus-seating-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('DejaVu-Bold').fillColor('#111827').text(`AUTOBUSKA LISTA SJEDIŠTA — ${pkg?.name || departure.id}`);
  doc.fontSize(9).font('DejaVu').fillColor('#4B5563').text(
    `${pkg?.destination || ''} · ${formatDateBs(departure.depart_at)} — ${formatDateBs(departure.return_at)}`
  );
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor('#6B7280').text(
    `Vozilo: ${vehicle?.vehicle_label || 'Autobus'}${vehicle?.registration_number ? ` (${vehicle.registration_number})` : ''} · Kapacitet: ${vehicle?.capacity || departure.capacity} sjedišta · Generisano: ${new Date().toLocaleDateString('bs-BA')}`
  );
  doc.moveDown(0.6);

  const seatedPassengers = passengers
    .filter((p) => p.seat_number !== null && p.seat_number !== undefined)
    .sort((a, b) => Number(a.seat_number) - Number(b.seat_number));

  const unseatedPassengers = passengers.filter((p) => p.seat_number === null || p.seat_number === undefined);

  let y = doc.y + 5;
  const rowH = 18;
  const cols = { seat: 55, name: 190, phone: 110, notes: 160 };

  const drawHeader = () => {
    let x = 40;
    doc.rect(40, y - 3, 515, rowH).fill('#F3F4F6');
    doc.fontSize(8).font('DejaVu-Bold').fillColor('#1F2937');
    doc.text('Sjedište', x, y); x += cols.seat;
    doc.text('Ime i prezime putnika', x, y); x += cols.name;
    doc.text('Telefon', x, y); x += cols.phone;
    doc.text('Mjesto ukrcaja / Napomena', x, y);
    y += rowH;
  };

  drawHeader();
  doc.font('DejaVu');

  if (seatedPassengers.length === 0) {
    doc.fontSize(9).fillColor('#6B7280').text('Trenutno nema raspoređenih sjedišta za ovaj polazak.', 40, y + 10);
    y += 30;
  } else {
    for (const p of seatedPassengers) {
      if (y > 750) {
        doc.addPage();
        y = 40;
        drawHeader();
        doc.font('DejaVu');
      }

      let x = 40;
      doc.fontSize(8.5).font('DejaVu-Bold').fillColor('#1D4ED8').text(String(p.seat_number), x, y); x += cols.seat;
      doc.font('DejaVu-Bold').fillColor('#111827').text(p.full_name || 'Putnik', x, y, { width: cols.name - 5, lineBreak: false }); x += cols.name;
      doc.font('DejaVu').fillColor('#374151').text(p.phone || '—', x, y, { width: cols.phone - 5, lineBreak: false }); x += cols.phone;
      doc.text(p.notes || '—', x, y, { width: cols.notes - 5, lineBreak: false });

      doc.strokeColor('#E5E7EB').lineWidth(0.5).moveTo(40, y + rowH - 3).lineTo(555, y + rowH - 3).stroke();
      y += rowH;
    }
  }

  // Unseated section
  if (unseatedPassengers.length > 0) {
    y += 15;
    if (y > 700) { doc.addPage(); y = 40; }
    doc.fontSize(11).font('DejaVu-Bold').fillColor('#DC2626').text(`Neraspoređeni putnici (${unseatedPassengers.length})`, 40, y);
    y += 15;
    for (const u of unseatedPassengers) {
      if (y > 750) { doc.addPage(); y = 40; }
      doc.fontSize(8.5).font('DejaVu').fillColor('#374151').text(`• ${u.full_name || 'Putnik'} — Tel: ${u.phone || '—'} · Rez: ${u.reservation_id?.slice(0, 8)}`, 40, y);
      y += 14;
    }
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// 6. BUS SEATING MANIFEST (CSV)
// ---------------------------------------------------------------------------
router.get('/departures/:id/bus-seating.csv', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const data = await loadDepartureDocumentData(req.params.id, req.orgId!);
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { departure, passengers } = data;
  const sorted = [...passengers].sort((a, b) => (Number(a.seat_number) || 9999) - (Number(b.seat_number) || 9999));

  const headers = ['Sjediste', 'Ime i prezime', 'Telefon', 'Email', 'Mjesto ukrcaja / Napomena', 'Rezervacija ID'];
  const rows = sorted.map((p) => [
    escapeCsv(p.seat_number || 'Neraspoređen'),
    escapeCsv(p.full_name || 'Putnik'),
    escapeCsv(p.phone || '—'),
    escapeCsv(p.email || '—'),
    escapeCsv(p.notes || '—'),
    escapeCsv(p.reservation_id?.slice(0, 8) || '—'),
  ]);

  const csvOutput = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bus-seating-${departure.id.slice(0, 8)}.csv"`);
  res.send(csvOutput);
});

// ---------------------------------------------------------------------------
// 7. BATCH VOUCHERS (PDF)
// ---------------------------------------------------------------------------
router.get('/departures/:id/vouchers-batch.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const { data: departure } = await supabaseAdmin
    .from('departures')
    .select('*, packages:package_id(name, destination, currency)')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();

  if (!departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('id, customer_id, customers:customer_id(first_name, last_name, phone, email), party_size, total_amount, paid_amount, hotel_name, room_type, check_in, check_out, currency')
    .eq('departure_id', departure.id)
    .eq('org_id', req.orgId!)
    .order('created_at');

  const all = (reservations || []) as any[];
  if (!all.length) return apiError(res, 404, 'NOT_FOUND', 'No reservations for this departure');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  registerUnicodeFonts(doc);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="vouchers-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const pkg = (departure as any).packages;
  const currency = pkg?.currency || 'BAM';

  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    const c = r.customers as CustFull | null;
    const travelerName = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'Gost';

    if (i > 0) doc.addPage();

    // Header banner
    doc.rect(40, 40, 515, 60).fill('#1E40AF');
    doc.fontSize(18).font('DejaVu-Bold').fillColor('#FFFFFF').text('VAUČER ZA SMJEŠTAJ I PUTOVANJE', 55, 52);
    doc.fontSize(9).font('DejaVu').fillColor('#DBEAFE').text(`Vaučer br: VOUCH-${r.id.slice(0, 8).toUpperCase()}`, 55, 75);

    doc.fillColor('#000000');
    doc.y = 120;

    doc.fontSize(13).font('DejaVu-Bold').text(`Nosilac rezervacije: ${travelerName}`);
    if (c?.phone) doc.fontSize(9).font('DejaVu').text(`Kontakt telefon: ${c.phone}`);
    if (c?.email) doc.fontSize(9).font('DejaVu').text(`Email: ${c.email}`);
    doc.moveDown(0.8);

    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    doc.fontSize(10).font('DejaVu')
      .text(`Aranžman: ${pkg?.name || '—'}`)
      .text(`Destinacija: ${pkg?.destination || '—'}`)
      .text(`Period putovanja: ${formatDateBs(departure.depart_at)} — ${formatDateBs(departure.return_at)}`)
      .text(`Broj prijavljenih putnika: ${r.party_size}`)
      .text(`Hotel: ${r.hotel_name || '—'} · Tip sobe: ${r.room_type || '—'}`)
      .text(`Check-in: ${formatDateBs(r.check_in)} · Check-out: ${formatDateBs(r.check_out)}`);

    doc.moveDown(1);
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    const paid = Number(r.paid_amount || 0);
    const total = Number(r.total_amount || 0);
    const resCurrency = r.currency || currency;

    doc.fontSize(9).fillColor('#374151')
      .text(`Finansijski status rezervacije: Plaćeno ${paid.toLocaleString('bs-BA')} ${resCurrency} od ukupno ${total.toLocaleString('bs-BA')} ${resCurrency}`);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#6B7280')
      .text('Ovaj vaučer služi kao zvanična potvrda rezervacije smještaja i usluga za navedene putnike.', { align: 'center' })
      .text('Predočiti prilikom prijave u hotel / agenciju.', { align: 'center' });
  }

  doc.end();
});

export default router;
