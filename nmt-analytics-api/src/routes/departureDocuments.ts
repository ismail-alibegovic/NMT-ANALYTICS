import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import PDFDocument from 'pdfkit';

const router = Router();

type CustBase = { first_name: string; last_name: string };
type CustFull = CustBase & { phone?: string; email?: string };

router.get('/departures/:id/manifest.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const { data: departure } = await supabaseAdmin.from('departures').select('*, packages:package_id(name,destination)').eq('id', req.params.id).eq('org_id', req.orgId!).single();
  if (!departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: reservations } = await supabaseAdmin.from('reservations').select('id,party_size,customer_id,customers:customer_id(first_name,last_name,phone,email),hotel_name,room_type,check_in,check_out').eq('departure_id', departure.id).eq('org_id', req.orgId!).order('created_at');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="manifest-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text(`Putnička lista — ${(departure as any).packages?.name || departure.id}`);
  doc.fontSize(10).text(`${(departure as any).packages?.destination || ''} · ${new Date(departure.depart_at).toLocaleDateString('bs-BA')} — ${new Date(departure.return_at).toLocaleDateString('bs-BA')}`);
  doc.moveDown(0.5);
  const all = (reservations || []) as any[];
  doc.fontSize(8).text(`Ukupno: ${all.reduce((s: number, r: any) => s + r.party_size, 0)} putnika · ${all.length} rezervacija`);

  if (!all.length) { doc.moveDown(1).fontSize(10).text('Nema rezervacija za ovaj polazak.'); doc.end(); return; }

  let y = doc.y + 15;
  const rowH = 18;
  const cols = { rbr: 40, name: 150, phone: 100, email: 140, hotel: 105 };
  doc.fontSize(8).font('Helvetica-Bold');

  const drawHeader = () => {
    let x = 40;
    doc.text('#', x, y); x += cols.rbr;
    doc.text('Ime i prezime', x, y); x += cols.name;
    doc.text('Telefon', x, y); x += cols.phone;
    doc.text('Email', x, y); x += cols.email;
    doc.text('Hotel', x, y);
    y += rowH;
  };
  drawHeader();

  doc.font('Helvetica');
  let idx = 0;
  for (const r of all) {
    const c = r.customers as CustFull | null;
    if (!c) continue;
    idx++;
    if (y > 750) { doc.addPage(); y = 40; drawHeader(); doc.font('Helvetica'); }
    let x = 40;
    doc.text(String(idx), x, y); x += cols.rbr;
    doc.text(`${c.first_name} ${c.last_name}${r.party_size > 1 ? ` +${r.party_size - 1}` : ''}`, x, y, { width: cols.name }); x += cols.name;
    doc.text(c.phone || '—', x, y, { width: cols.phone }); x += cols.phone;
    doc.text(c.email || '—', x, y, { width: cols.email }); x += cols.email;
    doc.text(r.hotel_name || '—', x, y, { width: cols.hotel });
    y += rowH;
  }
  doc.end();
});

router.get('/departures/:id/vouchers-batch.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const { data: departure } = await supabaseAdmin.from('departures').select('*, packages:package_id(name,destination)').eq('id', req.params.id).eq('org_id', req.orgId!).single();
  if (!departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: reservations } = await supabaseAdmin.from('reservations').select('id,customer_id,customers:customer_id(first_name,last_name),party_size,total,hotel_name,room_type,check_in,check_out,paid_amount').eq('departure_id', departure.id).eq('org_id', req.orgId!).order('created_at');
  const all = (reservations || []) as any[];
  if (!all.length) return apiError(res, 404, 'NOT_FOUND', 'No reservations for this departure');

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="vouchers-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  const pkg = (departure as any).packages;
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    const c = r.customers as CustBase | null;
    if (i > 0) doc.addPage();
    doc.fontSize(14).text(`Vaučer — ${c?.first_name || ''} ${c?.last_name || ''}`);
    doc.moveDown(0.5);
    doc.fontSize(10)
      .text(`Aranžman: ${pkg?.name || '—'}`)
      .text(`Destinacija: ${pkg?.destination || '—'}`)
      .text(`Datum: ${new Date(departure.depart_at).toLocaleDateString('bs-BA')} — ${new Date(departure.return_at).toLocaleDateString('bs-BA')}`)
      .text(`Broj putnika: ${r.party_size}`)
      .text(`Hotel: ${r.hotel_name || '—'} · Soba: ${r.room_type || '—'}`)
      .text(`Check-in: ${r.check_in ? new Date(r.check_in).toLocaleDateString('bs-BA') : '—'} · Check-out: ${r.check_out ? new Date(r.check_out).toLocaleDateString('bs-BA') : '—'}`);
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#888').text(`Rezervacija: ${r.id} · Plaćeno: ${Number(r.paid_amount || 0).toLocaleString()} / ${Number(r.total).toLocaleString()} BAM`);
    doc.fillColor('#000');
  }
  doc.end();
});

router.get('/departures/:id/rooming-list.pdf', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  const { data: departure } = await supabaseAdmin.from('departures').select('*, packages:package_id(name,destination)').eq('id', req.params.id).eq('org_id', req.orgId!).single();
  if (!departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: reservations } = await supabaseAdmin.from('reservations').select('id,party_size,customer_id,customers:customer_id(first_name,last_name),hotel_name,room_type').eq('departure_id', departure.id).eq('org_id', req.orgId!).order('hotel_name').order('room_type');
  const all = (reservations || []) as any[];

  const hotels: Record<string, { roomType: string; guests: string; total: number }[]> = {};
  for (const r of all) {
    const hotel = r.hotel_name || 'Bez hotela';
    const c = r.customers as CustBase | null;
    if (!hotels[hotel]) hotels[hotel] = [];
    hotels[hotel].push({
      roomType: r.room_type || 'Standard',
      guests: c ? `${c.first_name} ${c.last_name}${r.party_size > 1 ? ` +${r.party_size - 1}` : ''}` : `${r.party_size} putnika`,
      total: r.party_size
    });
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="rooming-list-${departure.id.slice(0, 8)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text(`Raspored po sobama — ${(departure as any).packages?.name || departure.id}`);
  doc.fontSize(10).text(`${(departure as any).packages?.destination || ''} · ${new Date(departure.depart_at).toLocaleDateString('bs-BA')} — ${new Date(departure.return_at).toLocaleDateString('bs-BA')}`);
  doc.moveDown();

  let grandTotal = 0;
  for (const [hotel, rooms] of Object.entries(hotels)) {
    const hotelTotal = rooms.reduce((s: number, r: any) => s + r.total, 0);
    grandTotal += hotelTotal;
    doc.fontSize(12).font('Helvetica-Bold').text(`${hotel} (${hotelTotal})`).font('Helvetica');
    for (const room of rooms) {
      doc.fontSize(10).text(`  ${room.roomType} × ${room.total}: ${room.guests}`, { indent: 10 });
    }
    doc.moveDown(0.3);
  }
  doc.moveDown().fontSize(9).fillColor('#666').text(`Ukupno: ${grandTotal} putnika u ${Object.keys(hotels).length} hotela`).fillColor('#000');

  doc.end();
});

export default router;
