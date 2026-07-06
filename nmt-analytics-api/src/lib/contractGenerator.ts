import PDFDocument from 'pdfkit';
import { registerUnicodeFonts } from './pdfFonts';

interface ContractStyle {
  primaryColor: string;
  secondaryColor: string;
  footerText: string;
}

const defaultStyle: ContractStyle = {
  primaryColor: '#1D4ED8',
  secondaryColor: '#111827',
  footerText: 'This contract is issued by Travline and is subject to the terms and conditions of the agency.',
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

/**
 * Generate a travel contract PDF.
 * Expects a contract record joined with: reservation + departure + customer + organization.
 */
export async function generateContractPDF(contract: any, orgSettings?: Partial<ContractStyle>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      registerUnicodeFonts(doc);
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const org = contract.organizations || {};
      const reservation = contract.reservations || {};
      const customer = contract.travelers || reservation.customers || {};
      const departure = reservation.departures || {};
      const pkg = departure.packages || {};
      const currency = contract.currency || 'BAM';
      const style = { ...defaultStyle, ...orgSettings };

      // === HEADER BANNER ===
      doc.rect(0, 0, 595.28, 130).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(28).font('DejaVu-Bold')
        .text('UGOVOR', 50, 30, { align: 'left' });
      doc.fontSize(11).font('DejaVu')
        .text(`Broj: ${contract.contract_number}`, 50, 70);
      doc.text(`Datum: ${fmtDate(contract.contract_date)}`, 50, 88);
      doc.text(`Status: ${(contract.status || 'draft').toUpperCase()}`, 50, 106);

      doc.fillColor('#FFFFFF').fontSize(18).font('DejaVu-Bold')
        .text(org.name || 'Travel Agency', 395, 35, { width: 150, align: 'right' });
      doc.fontSize(9).font('DejaVu').fillColor('#E0E7FF');
      if (org.address) doc.text(org.address, 395, 65, { width: 150, align: 'right' });
      if (org.email) doc.text(org.email, 395, 78, { width: 150, align: 'right' });
      if (org.phone) doc.text(org.phone, 395, 91, { width: 150, align: 'right' });
      if (org.tax_id) doc.text(`ID: ${org.tax_id}`, 395, 104, { width: 150, align: 'right' });
      if (org.bank_account) doc.text(`IBAN: ${org.bank_account}`, 395, 117, { width: 150, align: 'right' });

      // === PARTIES ===
      doc.fillColor(style.secondaryColor);
      let y = 160;

      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Ugovorne strane', 50, y);
      y += 22;

      doc.fontSize(10).font('DejaVu-Bold').fillColor(style.secondaryColor)
        .text('Organizator (I):', 50, y);
      y += 14;
      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      doc.text(org.name || '—', 70, y, { width: 460 });
      y += 14;
      if (org.address) { doc.text(org.address, 70, y, { width: 460 }); y += 14; }
      if (org.tax_id) { doc.text(`Porezni ID: ${org.tax_id}`, 70, y, { width: 460 }); y += 14; }
      if (org.bank_account) { doc.text(`IBAN: ${org.bank_account}`, 70, y, { width: 460 }); y += 14; }
      y += 8;

      doc.fontSize(10).font('DejaVu-Bold').fillColor(style.secondaryColor)
        .text('Putnik (II):', 50, y);
      y += 14;
      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      doc.text(contract.traveler_name || customer.full_name || reservation.customer_name || '—', 70, y, { width: 460 });
      y += 14;
      if (contract.traveler_phone || customer.phone || reservation.customer_phone) {
        doc.text(`Telefon: ${contract.traveler_phone || customer.phone || reservation.customer_phone}`, 70, y, { width: 460 });
        y += 14;
      }
      if (contract.traveler_email || customer.email) {
        doc.text(`Email: ${contract.traveler_email || customer.email}`, 70, y, { width: 460 });
        y += 14;
      }
      y += 12;

      // === ARRANGEMENT / PACKAGE ===
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Predmet ugovora', 50, y);
      y += 22;

      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      const lines: [string, string | undefined][] = [
        ['Aranžman', pkg.name || contract.package_description || '—'],
        ['Destinacija', pkg.destination || '—'],
        ['Datum polaska', fmtDate(contract.departure_date || departure.depart_at)],
        ['Datum povratka', fmtDate(contract.return_date || departure.return_at)],
        ['Broj putnika', String(contract.party_size ?? reservation.party_size ?? 1)],
      ];
      for (const [label, value] of lines) {
        doc.font('DejaVu-Bold').text(`${label}:`, 50, y, { width: 160 });
        doc.font('DejaVu').text(value || '—', 220, y, { width: 320 });
        y += 16;
      }
      y += 8;

      // === PRICE / PAYMENT ===
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Cijena i uslovi plaćanja', 50, y);
      y += 22;

      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      doc.font('DejaVu-Bold').text('Ukupan iznos:', 50, y, { width: 160 });
      doc.font('DejaVu').text(fmtMoney(Number(contract.total_amount ?? reservation.total_amount ?? 0), currency), 220, y, { width: 320 });
      y += 16;
      if (contract.payment_terms) {
        doc.font('DejaVu-Bold').text('Uslovi plaćanja:', 50, y, { width: 160 });
        doc.font('DejaVu').text(contract.payment_terms, 220, y, { width: 320 });
        y += 16;
      }
      if (contract.cancellation_policy) {
        doc.font('DejaVu-Bold').text('Otkazni uslovi:', 50, y, { width: 160 });
        doc.font('DejaVu').text(contract.cancellation_policy, 220, y, { width: 320 });
        y += 16;
      }
      y += 14;

      // === SIGNATURES ===
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Potpisi', 50, y);
      y += 28;

      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      doc.text('Organizator: ____________________', 50, y, { width: 240 });
      doc.text('Putnik: ____________________', 320, y, { width: 220 });
      y += 28;
      doc.text(org.name || '', 50, y, { width: 240 });
      doc.text(contract.traveler_name || '', 320, y, { width: 220 });
      y += 28;
      if (contract.signed_at) {
        doc.fontSize(9).fillColor('#6B7280')
          .text(`Potpisano: ${fmtDate(contract.signed_at)}`, 50, y, { width: 460 });
        y += 14;
      }

      // === FOOTER ===
      doc.moveDown(2);
      doc.rect(50, 760, 495.28, 0.5).fill(style.primaryColor);
      doc.fontSize(9).fillColor('#6B7280')
        .text(style.footerText, 50, 770, { align: 'center', width: 495.28 });
      doc.fontSize(7).fillColor('#9CA3AF')
        .text('Generisano od Travline', 50, 790, { align: 'center', width: 495.28 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
