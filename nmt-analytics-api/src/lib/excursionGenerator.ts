import PDFDocument from 'pdfkit';
import { registerUnicodeFonts } from './pdfFonts';

interface ContractStyle {
  primaryColor: string;
  secondaryColor: string;
  footerText?: string;
}

const defaultStyle: ContractStyle = {
  primaryColor: '#1D4ED8',
  secondaryColor: '#111827',
  footerText: 'Ovaj paket dokumenata generisan je automatski kroz Travline sub-agent sistem.',
};

function fmtDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('bs-BA');
}

function fmtMoney(amount: number, currency = 'BAM'): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString('bs-BA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** Generate Sub-Agent Sale PDF bundle (contract + receipt summary) */
export async function generateSubAgentSalePDF(
  data: { agent: any; contract: any; receipt: any; reservation: any },
  orgSettings?: Partial<ContractStyle>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      registerUnicodeFonts(doc);
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { agent, contract, receipt, reservation } = data;
      const currency = contract.currency || 'BAM';
      const style = { ...defaultStyle, ...orgSettings };

      // Page 1: Contract summary
      doc.rect(0, 0, 595.28, 130).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(28).font('DejaVu-Bold')
        .text('Sub-Agent Paket', 50, 45);
      doc.fontSize(11).font('DejaVu').fillColor('#E0E7FF')
        .text(`Datum: ${fmtDate(new Date())}`, 50, 85);

      doc.moveDown(3);
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor).text('1. Sub-Agent Informacije', 50, doc.y);
      doc.moveDown(1.5);
      doc.fontSize(10).font('DejaVu-Bold').fillColor(style.secondaryColor).text('Naziv:', 70, doc.y, { width: 100 });
      doc.font('DejaVu').text(agent.name, 180, doc.y, { width: 350 });
      doc.moveDown();
      if (agent.phone) {
        doc.fontSize(10).font('DejaVu-Bold').text('Telefon:', 70, doc.y, { width: 100 });
        doc.font('DejaVu').text(agent.phone, 180, doc.y, { width: 350 });
        doc.moveDown();
      }
      if (agent.email) {
        doc.fontSize(10).font('DejaVu-Bold').text('Email:', 70, doc.y, { width: 100 });
        doc.font('DejaVu').text(agent.email, 180, doc.y, { width: 350 });
        doc.moveDown();
      }
      doc.fontSize(10).font('DejaVu-Bold').text('Provizija:', 70, doc.y, { width: 100 });
      doc.font('DejaVu').text(`${agent.commission_rate || 0}%`, 180, doc.y, { width: 350 });

      doc.moveDown(3);
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor).text('2. Ugovor Sažetak', 50, doc.y);
      doc.moveDown(1.5);
      const summaryLines: [string, string][] = [
        ['Broj ugovora', contract.contract_number || '—'],
        ['Putnik', contract.traveler_name || '—'],
        ['Aranžman', contract.package_description || '—'],
        ['Polazak', fmtDate(contract.departure_date)],
        ['Povratak', fmtDate(contract.return_date)],
        ['Putnika', String(contract.party_size || 1)],
        ['Ukupan iznos', fmtMoney(contract.total_amount || 0, currency)],
      ];
      for (const [label, value] of summaryLines) {
        doc.fontSize(10).font('DejaVu-Bold').text(`${label}:`, 70, doc.y, { width: 140 });
        doc.font('DejaVu').text(value, 220, doc.y, { width: 320 });
        doc.moveDown(0.6);
      }

      doc.moveDown(3);
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor).text('3. Račun', 50, doc.y);
      doc.moveDown(1.5);
      doc.fontSize(10).font('DejaVu-Bold').text('Broj računa:', 70, doc.y, { width: 140 });
      doc.font('DejaVu').text(receipt.receipt_number || '—', 220, doc.y, { width: 320 });
      doc.moveDown();
      doc.fontSize(10).font('DejaVu-Bold').text('Tip:', 70, doc.y, { width: 140 });
      doc.font('DejaVu').text((receipt.receipt_type || '').toUpperCase(), 220, doc.y, { width: 320 });
      doc.moveDown();
      doc.fontSize(10).font('DejaVu-Bold').text('Iznos:', 70, doc.y, { width: 140 });
      doc.font('DejaVu').text(fmtMoney(receipt.amount || 0, currency), 220, doc.y, { width: 320 });

      doc.moveDown(3);
      doc.rect(50, 760, 495.28, 0.5).fill(style.primaryColor);
      doc.fontSize(9).fillColor('#6B7280')
        .text(style.footerText || defaultStyle.footerText!, 50, 770, { align: 'center', width: 495.28 });

      doc.end();
    } catch (err) { reject(err); }
  });
}

/** Generate Bus List PDF */
export async function generateBusListPDF(
  passengers: any[],
  orgSettings?: Partial<ContractStyle>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      registerUnicodeFonts(doc);
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const style = { ...defaultStyle, ...orgSettings };

      doc.rect(0, 0, 595.28, 70).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(22).font('DejaVu-Bold')
        .text('Lista Putnika / Bus List', 50, 28);

      doc.moveDown(3);
      doc.fontSize(11).font('DejaVu-Bold').fillColor(style.primaryColor).text('Br.', 55, doc.y);
      doc.text('Ime i Prezime', 80, doc.y, { width: 170 });
      doc.text('Telefon', 260, doc.y, { width: 120 });
      doc.text('Sjedalo', 400, doc.y, { width: 60 });
      doc.text('Dok.', 470, doc.y, { width: 80 });

      doc.rect(50, doc.y + 1, 495, 0.5).fill('#D1D5DB');
      doc.moveDown(1);

      passengers.forEach((p, i) => {
        if (i % 2 === 0) {
          doc.fillColor('#F9FAFB').rect(50, doc.y - 6, 495, 14).fill();
        }
        doc.fillColor(style.secondaryColor);
        doc.fontSize(10).font('DejaVu');
        doc.text(String(i + 1), 55, doc.y, { width: 20 });
        doc.text(p.full_name || '—', 80, doc.y, { width: 170 });
        doc.text(p.phone || '—', 260, doc.y, { width: 120 });
        doc.text(String(p.seat_number || '—'), 400, doc.y, { width: 60 });
        doc.text(p.id_document || '—', 470, doc.y, { width: 80 });
        doc.moveDown(1);
      });

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#6B7280')
        .text(`Ukupno putnika: ${passengers.length}`, 50, doc.y);
      doc.text(`Generisano: ${fmtDate(new Date())}`, 450, doc.y, { align: 'right' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

/** Generate Ruming List PDF */
export async function generateRumingListPDF(
  allocations: any[],
  orgSettings?: Partial<ContractStyle>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      registerUnicodeFonts(doc);
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const style = { ...defaultStyle, ...orgSettings };

      doc.rect(0, 0, 595.28, 70).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(22).font('DejaVu-Bold')
        .text('Ruming Lista / Rooming List', 50, 28);

      doc.moveDown(3);
      doc.fontSize(11).font('DejaVu-Bold').fillColor(style.primaryColor).text('Br.', 55, doc.y);
      doc.text('Hotel', 80, doc.y, { width: 130 });
      doc.text('Tip Sobe', 220, doc.y, { width: 80 });
      doc.text('Check-In', 310, doc.y, { width: 70 });
      doc.text('Check-Out', 390, doc.y, { width: 70 });
      doc.text('Rezerv.', 470, doc.y, { width: 75 });

      doc.rect(50, doc.y + 1, 495, 0.5).fill('#D1D5DB');
      doc.moveDown(1);

      allocations.forEach((a, i) => {
        if (i % 2 === 0) {
          doc.fillColor('#F9FAFB').rect(50, doc.y - 6, 495, 14).fill();
        }
        doc.fillColor(style.secondaryColor);
        doc.fontSize(10).font('DejaVu');
        doc.text(String(i + 1), 55, doc.y, { width: 20 });
        doc.text(a.hotel_name || a.hotel?.name || '—', 80, doc.y, { width: 130 });
        doc.text(a.room_type || '—', 220, doc.y, { width: 80 });
        doc.text(a.check_in ? new Date(a.check_in).toLocaleDateString('bs-BA') : '—', 310, doc.y, { width: 70 });
        doc.text(a.check_out ? new Date(a.check_out).toLocaleDateString('bs-BA') : '—', 390, doc.y, { width: 70 });
        doc.text(String(a.rooms_reserved || a.rooms || 0), 470, doc.y, { width: 75 });
        doc.moveDown(1);
      });

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#6B7280')
        .text(`Ukupno rezervacija: ${allocations.length}`, 50, doc.y);
      doc.text(`Generisano: ${fmtDate(new Date())}`, 450, doc.y, { align: 'right' });

      doc.end();
    } catch (err) { reject(err); }
  });
}
