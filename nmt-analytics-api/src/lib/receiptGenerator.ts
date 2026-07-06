import PDFDocument from 'pdfkit';
import { registerUnicodeFonts } from './pdfFonts';

interface ReceiptStyle {
  primaryColor: string;
  secondaryColor: string;
  footerText: string;
}

const defaultStyle: ReceiptStyle = {
  primaryColor: '#1D4ED8',
  secondaryColor: '#111827',
  footerText: 'Hvala na povjerenju — Travline.',
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

const typeLabels: Record<string, string> = {
  advance: 'Avansni račun',
  final: 'Fiskalni račun',
  refund: 'Povrat sredstava',
};

/**
 * Generate a fiscal receipt PDF.
 * Expects a receipt record joined with: reservation + contract + organization.
 */
export async function generateReceiptPDF(receipt: any, orgSettings?: Partial<ReceiptStyle>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      registerUnicodeFonts(doc);

      const org = receipt.organizations || {};
      const reservation = receipt.reservations || {};
      const customer = reservation.customers || {};
      const contract = receipt.contracts || {};
      const travelerName = customer.full_name || reservation.customer_name || receipt.traveler_name || receipt.travelerName || '—';
      const travelerPhone = customer.phone || reservation.customer_phone || receipt.travelerPhone || '—';
      const travelerEmail = customer.email || reservation.customer_email || receipt.travelerEmail || '—';
      const contractNumber = contract.contract_number || receipt.contract_number || receipt.contractNumber || '—';
      const paymentMethod = receipt.payment_method || receipt.paymentMethod || '—';
      const currency = receipt.currency || 'BAM';
      const style = { ...defaultStyle, ...orgSettings };
      const typeLabel = typeLabels[receipt.receipt_type] || 'Račun';

      // === HEADER BANNER ===
      doc.rect(0, 0, 595.28, 130).fill(style.primaryColor);
      doc.fillColor('#FFFFFF').fontSize(26).font('DejaVu-Bold')
        .text('RAČUN', 50, 30, { align: 'left' });
      doc.fontSize(11).font('DejaVu')
        .text(`Broj: ${receipt.receipt_number}`, 50, 70);
      doc.text(`Datum: ${fmtDate(receipt.issued_at)}`, 50, 88);
      doc.text(`Tip: ${typeLabel}`, 50, 106);

      doc.fillColor('#FFFFFF').fontSize(18).font('DejaVu-Bold')
        .text(org.name || 'Travel Agency', 395, 35, { width: 150, align: 'right' });
      doc.fontSize(9).font('DejaVu').fillColor('#E0E7FF');
      if (org.address) doc.text(org.address, 395, 65, { width: 150, align: 'right' });
      if (org.email) doc.text(org.email, 395, 78, { width: 150, align: 'right' });
      if (org.phone) doc.text(org.phone, 395, 91, { width: 150, align: 'right' });

      // === PARTIES ===
      doc.fillColor(style.secondaryColor);
      let y = doc.y;
      doc.moveDown(0.5);
      const lines: [string, string][] = [
        ['Klijent', travelerName],
        ['Telefon', travelerPhone],
        ['Email', travelerEmail],
        ['Rezervacija', reservation.id ? String(reservation.id).substring(0, 8).toUpperCase() : (receipt.reservation_id ? String(receipt.reservation_id).substring(0, 8).toUpperCase() : '—')],
        ['Ugovor', contractNumber],
        ['Način plaćanja', paymentMethod],
      ];
      for (const [label, value] of lines) {
        doc.font('DejaVu-Bold').text(`${label}:`, 50, y, { width: 160 });
        doc.font('DejaVu').text(value || '—', 220, y, { width: 320 });
        y += 16;
      }
      y += 8;

      // === AMOUNT ===
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Iznos', 50, y);
      y += 22;

      const amount = Number(receipt.amount ?? 0);
      doc.font('DejaVu-Bold').fontSize(11).text('Ukupno:', 50, y, { width: 160 });
      doc.font('DejaVu').text(fmtMoney(amount, currency), 220, y, { width: 320 });
      y += 22;

      if (receipt.linked_receipt_id) {
        doc.font('DejaVu-Bold').text('Povezani račun:', 50, y, { width: 160 });
        doc.font('DejaVu').text(String(receipt.linked_receipt_id).substring(0, 8).toUpperCase(), 220, y, { width: 320 });
        y += 22;
      }

      // === FISCAL DATA (if present) ===
      const fiscal = receipt.fiscal_data || {};
      if (fiscal.cin || fiscal.zki || fiscal.verificationUrl) {
        y += 6;
        doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
          .text('Fiskalni podaci', 50, y);
        y += 22;
        doc.fontSize(9).font('DejaVu').fillColor(style.secondaryColor);
        if (fiscal.cin) { doc.text(`CIN: ${fiscal.cin}`, 50, y, { width: 460 }); y += 14; }
        if (fiscal.zki) { doc.text(`ZKI: ${fiscal.zki}`, 50, y, { width: 460 }); y += 14; }
        if (fiscal.verificationUrl) { doc.text(`Provjera: ${fiscal.verificationUrl}`, 50, y, { width: 460 }); y += 14; }
        y += 6;
      }

      // === SIGNATURES ===
      y = Math.max(y + 12, 580);
      doc.fontSize(13).font('DejaVu-Bold').fillColor(style.primaryColor)
        .text('Potpis', 50, y);
      y += 28;
      doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
      doc.text('Izdavac: ____________________', 50, y, { width: 240 });
      doc.text('Printik: ____________________', 320, y, { width: 220 });

      // === FOOTER ===
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
