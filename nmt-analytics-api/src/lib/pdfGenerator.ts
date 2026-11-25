import PDFDocument from 'pdfkit';
import { registerUnicodeFonts } from './pdfFonts';
import { renderTemplatedPDF } from './pdfTemplateRenderer';
import type { TemplateConfig } from './pdfTemplateConfig';

/**
 * All four PDF generators are now thin wrappers over the single renderer in
 * `pdfTemplateRenderer.ts`. Existing call sites keep their signatures so
 * route handlers and tests do not need to change. When a stored template
 * config is passed, blocks are read from it; otherwise the renderer falls
 * back to the default block layout defined in `pdfTemplateConfig.ts`.
 *
 * Style overrides come from `getOrgBranding()` (org_branding row) and are
 * applied on top of the renderer's DEFAULT_STYLE.
 */

type BrandingLike = Partial<{
  primaryColor: string;
  secondaryColor: string;
  footerText: string;
  showQr: boolean;
  logoUrl: string | null;
}>;

function brandingOverrides(branding?: BrandingLike) {
  if (!branding) return undefined;
  const out: Record<string, any> = {};
  if (branding.primaryColor) out.primaryColor = branding.primaryColor;
  if (branding.secondaryColor) out.secondaryColor = branding.secondaryColor;
  if (branding.footerText) out.footerText = branding.footerText;
  if (branding.showQr !== undefined) out.showQr = branding.showQr;
  if (branding.logoUrl !== undefined) out.logoUrl = branding.logoUrl;
  return Object.keys(out).length ? out : undefined;
}

type BrandingWithConfig = BrandingLike & { pdfTemplateConfig?: TemplateConfig };

export async function generateVoucherPDF(reservation: any, branding?: BrandingWithConfig): Promise<Buffer> {
  return renderTemplatedPDF('voucher', reservation, branding?.pdfTemplateConfig, brandingOverrides(branding));
}

export async function generateInvoicePDF(reservation: any, branding?: BrandingWithConfig): Promise<Buffer> {
  return renderTemplatedPDF('invoice', reservation, branding?.pdfTemplateConfig, brandingOverrides(branding));
}

export async function generateOfferPDF(payload: any, branding?: BrandingWithConfig): Promise<Buffer> {
  const q = payload?.quotation || payload || {};
  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const primary = branding?.primaryColor || '#1D4ED8';
  const secondary = branding?.secondaryColor || '#111827';
  const footerText = branding?.footerText || 'Hvala na povjerenju — Travline.';
  const currency = q.currency || 'BAM';
  const sellTotal = Number(q.sellTotal ?? q.sell_total ?? 0);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    registerUnicodeFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header banner
    doc.rect(0, 0, 595.28, 105).fill(primary);
    doc.fillColor('#FFFFFF').font('DejaVu-Bold').fontSize(22).text('PONUDA / QUOTATION', 45, 32);
    doc.font('DejaVu').fontSize(10).text(
      `Ref: ${q.reference || q.id || '—'}   |   Status: ${String(q.status || 'draft').toUpperCase()}`,
      45,
      64
    );
    if (q.validUntil || q.valid_until) {
      const validStr = new Date(q.validUntil || q.valid_until).toLocaleDateString('bs-BA');
      doc.text(`Vrijedi do / Valid until: ${validStr}`, 45, 79);
    }

    doc.fillColor(secondary);
    doc.y = 125;

    // Title & Booking context
    if (q.title) {
      doc.font('DejaVu-Bold').fontSize(15).text(String(q.title), 45, doc.y);
      doc.moveDown(0.5);
    }

    const ctx = q.bookingContext;
    if (ctx) {
      doc.font('DejaVu').fontSize(9.5).fillColor('#374151');
      if (ctx.contactName) doc.text(`Klijent / Contact: ${ctx.contactName}`, 45);
      if (ctx.destination) doc.text(`Destinacija / Destination: ${ctx.destination}`, 45);
      if (ctx.travelStart || ctx.travelEnd) {
        doc.text(`Termin / Dates: ${ctx.travelStart || '—'} – ${ctx.travelEnd || '—'}`, 45);
      }
      if (ctx.travelers) doc.text(`Putnici / Travelers: ${ctx.travelers}`, 45);
      doc.moveDown(0.8);
    }

    // Items table
    doc.fillColor(secondary).font('DejaVu-Bold').fontSize(11).text('Stavke ponude / Offer Items', 45);
    doc.moveDown(0.4);

    if (items.length === 0) {
      doc.font('DejaVu').fontSize(9.5).fillColor('#6B7280').text('Nema unesenih stavki.', 45);
    } else {
      for (const item of items) {
        if (doc.y > 720) doc.addPage();
        const qty = Number(item.quantity || 1);
        const netUnit = Number(item.netUnitPrice ?? item.net_unit_price ?? 0);
        const markup = Number(item.markupPercent ?? item.markup_percent ?? 0);
        const sellUnit = netUnit * (1 + markup / 100);
        const lineSell = item.included === false ? 0 : sellUnit * qty;
        const dayPrefix = item.dayNumber ? `Dan ${item.dayNumber} · ` : '';
        const incTag = item.included === false ? ' (opciono)' : '';

        doc.font('DejaVu-Bold').fontSize(9.5).fillColor(secondary).text(
          `${dayPrefix}${item.title || 'Stavka'}${incTag}`,
          45,
          doc.y,
          { width: 370, continued: true }
        );
        doc.font('DejaVu-Bold').text(
          `${lineSell.toFixed(2)} ${item.currency || currency}`,
          { align: 'right' }
        );

        if (item.description) {
          doc.font('DejaVu').fontSize(8.5).fillColor('#4B5563').text(String(item.description), 55, doc.y, { width: 470 });
        }
        doc.font('DejaVu').fontSize(8).fillColor('#6B7280').text(
          `Količina: ${qty} ${item.unit || ''} × ${sellUnit.toFixed(2)} ${item.currency || currency}`,
          55
        );
        doc.moveDown(0.35);
      }
    }

    doc.moveDown(0.6);
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Total
    doc.font('DejaVu-Bold').fontSize(13).fillColor(primary).text(
      `UKUPNA CIJENA / TOTAL: ${sellTotal.toFixed(2)} ${currency}`,
      45,
      doc.y,
      { align: 'right' }
    );

    if (q.clientNotes || q.client_notes) {
      doc.moveDown(1);
      doc.font('DejaVu-Bold').fontSize(10).fillColor(secondary).text('Napomene / Notes', 45);
      doc.font('DejaVu').fontSize(9).fillColor('#374151').text(String(q.clientNotes || q.client_notes), 45, doc.y, { width: 505 });
    }

    // Footer
    doc.font('DejaVu').fontSize(8.5).fillColor('#6B7280').text(footerText, 45, 775, { align: 'center', width: 505 });
    doc.end();
  });
}
