/**
 * PDF Template Renderer
 *
 * Single renderer for every templated doc type (invoice, voucher, contract,
 * receipt). It walks the org's stored `pdf_template_config` for the requested
 * doc type and draws only the blocks the admin editor has enabled, in the
 * order the editor stored them.
 *
 * This is the piece that was missing: `getEnabledBlocks` had no caller, so the
 * editor was write-only and the generators drew a hardcoded section list. The
 * generators in `pdfGenerator.ts` / `contractGenerator.ts` /
 * `receiptGenerator.ts` are now thin wrappers over `renderTemplatedPDF`.
 *
 * Block semantics honoured here (keep in sync with the admin editor's
 * CONTENT_BLOCKS / STYLE_BLOCKS gating):
 *   - `enabled`     — false means the block is not drawn at all.
 *   - `customText`  — replaces the default body text for `terms`, `signature`
 *                     and `footer`.
 *   - `style`       — `fontSize` / `bold` / `align` overrides for the block's
 *                     body text.
 */

import PDFDocument from 'pdfkit';
import { registerUnicodeFonts } from './pdfFonts';
import {
  getEnabledBlocks,
  mergeWithDefaults,
  type BlockConfig,
  type BlockStyle,
  type DocType,
  type TemplateConfig,
} from './pdfTemplateConfig';

// ---------------------------------------------------------------------------
// Page geometry — matches the previous hand-drawn generators exactly.
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28;
const LEFT = 50;
const RIGHT = 545;
const CONTENT_WIDTH = 495.28;
const FOOTER_RULE_Y = 760;
const FOOTER_TEXT_Y = 770;
const FOOTER_CREDIT_Y = 790;
const PAGE_SAFE_BOTTOM = 740;

export interface RenderStyle {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  footerText: string;
  showQr: boolean;
}

const DEFAULT_STYLE: RenderStyle = {
  primaryColor: '#1D4ED8',
  secondaryColor: '#111827',
  logoUrl: null,
  footerText: 'Hvala na povjerenju — Travline.',
  showQr: false,
};

const MUTED = '#6B7280';
const CREDIT = '#9CA3AF';
const RULE = '#E5E7EB';
const STRIPE = '#F9FAFB';
const BANNER_SUB = '#E0E7FF';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

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

function shortId(value?: string | null): string {
  if (!value) return '—';
  return String(value).substring(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Normalized render context — every doc type is projected onto this shape so
// the block renderers stay doc-type agnostic.
// ---------------------------------------------------------------------------

interface LineItem {
  description: string;
  sub?: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface RenderContext {
  docType: DocType;
  org: any;
  banner: {
    height: number;
    title: string;
    titleAlign: 'left' | 'right';
    titleSize: number;
    metaLines: string[];
    orgAlign: 'left' | 'right';
  };
  customer: { name: string; phone: string; email: string };
  pkg: { name?: string; destination?: string; description?: string };
  travel: { departAt?: string | null; returnAt?: string | null };
  accommodation: {
    hotel?: string | null;
    roomType?: string | null;
    checkIn?: string | null;
    checkOut?: string | null;
  };
  tourGuide?: string | null;
  details: Array<[string, string]>;
  lineItems: LineItem[];
  totals: { total: number; paid: number; balance: number; currency: string; useTable: boolean };
  payment: { rows: Array<[string, string]>; heading: string };
  terms: { heading: string; rows: Array<[string, string]>; body?: string };
  signature: { heading: string; left: string; right: string; leftName: string; rightName: string; signedAt?: string | null };
  fiscal?: Record<string, any>;
}

function buildInvoiceContext(reservation: any): RenderContext {
  const org = reservation.organizations || {};
  const customer = reservation.customers || {};
  const departure = reservation.departures || {};
  const pkg = departure?.packages || {};
  const currency = reservation.currency || 'BAM';
  const total = Number(reservation.total_amount || 0);
  const paid = Number(reservation.paid_amount || 0);

  const hasServices = Array.isArray(reservation.package_services) && reservation.package_services.length > 0;
  const lineItems: LineItem[] = hasServices
    ? reservation.package_services.map((s: any) => {
        const label =
          s.description ||
          [s.serviceType, s.providerName]
            .filter(Boolean)
            .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' — ') ||
          'Service';
        const unitPrice = Number(s.unitPrice || 0);
        const qty = Number(s.quantity || 1);
        return {
          description: label,
          sub: s.isOptional ? '(optional)' : undefined,
          qty,
          unitPrice,
          amount: Number(s.totalPrice || unitPrice * qty),
        };
      })
    : [
        {
          description: pkg.name
            ? `${pkg.name}${pkg.destination ? ` — ${pkg.destination}` : ''}`
            : `Reservation ${shortId(reservation.id)}`,
          sub: departure?.depart_at ? `Departure: ${fmtDate(departure.depart_at)}` : undefined,
          qty: Number(reservation.party_size || 1),
          unitPrice: total,
          amount: total,
        },
      ];

  const servicesTotal = lineItems.reduce((sum, r) => sum + (r.amount || 0), 0);
  const effectiveTotal = hasServices ? servicesTotal : total;

  const paymentRows: Array<[string, string]> = [
    ['Status', (reservation.payment_status || 'unpaid').replace(/_/g, ' ').toUpperCase()],
    ['Payment Terms', 'Due within 15 days'],
  ];
  if (org.tax_id) paymentRows.push(['Porezni ID', String(org.tax_id)]);
  if (org.bank_account) paymentRows.push(['IBAN', String(org.bank_account)]);

  return {
    docType: 'invoice',
    org,
    banner: {
      height: 160,
      title: 'INVOICE',
      titleAlign: 'right',
      titleSize: 32,
      metaLines: [
        `Invoice No: INV-${shortId(reservation.id)}`,
        `Issue Date: ${fmtDate(new Date())}`,
        `Due Date: ${fmtDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000))}`,
      ],
      orgAlign: 'left',
    },
    customer: {
      name: customer.full_name || reservation.customer_name || 'Customer',
      phone: customer.phone || reservation.customer_phone || 'N/A',
      email: customer.email || '',
    },
    pkg: { name: pkg.name, destination: pkg.destination },
    travel: { departAt: departure?.depart_at, returnAt: departure?.return_at },
    accommodation: {
      hotel: reservation.hotel_name,
      roomType: reservation.room_type,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
    },
    tourGuide: reservation.tour_guide,
    details: [
      ['Party Size', String(reservation.party_size || 1)],
      ['Total Amount', fmtMoney(effectiveTotal, currency)],
      ['Status', String(reservation.status || '').toUpperCase()],
    ],
    lineItems,
    totals: {
      total: effectiveTotal,
      paid,
      balance: Math.max(effectiveTotal - paid, 0),
      currency,
      useTable: true,
    },
    payment: { heading: 'Payment Information', rows: paymentRows },
    terms: { heading: 'Terms & Conditions', rows: [] },
    signature: {
      heading: 'Signature',
      left: 'Organizator: ____________________',
      right: 'Klijent: ____________________',
      leftName: org.name || '',
      rightName: customer.full_name || reservation.customer_name || '',
    },
  };
}

function buildVoucherContext(reservation: any): RenderContext {
  const base = buildInvoiceContext(reservation);
  const org = base.org;
  return {
    ...base,
    docType: 'voucher',
    banner: {
      height: 120,
      title: 'VOUCHER',
      titleAlign: 'left',
      titleSize: 28,
      metaLines: [org.name || 'Travel Agency', `Voucher No: ${shortId(reservation.id)}`],
      orgAlign: 'left',
    },
    totals: { ...base.totals, useTable: false },
  };
}

function buildContractContext(contract: any): RenderContext {
  const org = contract.organizations || {};
  const reservation = contract.reservations || {};
  const customer = contract.travelers || reservation.customers || {};
  const departure = reservation.departures || {};
  const pkg = departure.packages || {};
  const currency = contract.currency || 'BAM';
  const total = Number(contract.total_amount ?? reservation.total_amount ?? 0);
  const paid = Number(reservation.paid_amount ?? 0);

  const termsRows: Array<[string, string]> = [];
  if (contract.payment_terms) termsRows.push(['Uslovi plaćanja', String(contract.payment_terms)]);
  if (contract.cancellation_policy) termsRows.push(['Otkazni uslovi', String(contract.cancellation_policy)]);

  return {
    docType: 'contract',
    org,
    banner: {
      height: 130,
      title: 'UGOVOR',
      titleAlign: 'left',
      titleSize: 28,
      metaLines: [
        `Broj: ${contract.contract_number || '—'}`,
        `Datum: ${fmtDate(contract.contract_date)}`,
        `Status: ${(contract.status || 'draft').toUpperCase()}`,
      ],
      orgAlign: 'right',
    },
    customer: {
      name: contract.traveler_name || customer.full_name || reservation.customer_name || '—',
      phone: contract.traveler_phone || customer.phone || reservation.customer_phone || '—',
      email: contract.traveler_email || customer.email || '—',
    },
    pkg: {
      name: pkg.name || contract.package_description,
      destination: pkg.destination,
      description: contract.package_description,
    },
    travel: {
      departAt: contract.departure_date || departure.depart_at,
      returnAt: contract.return_date || departure.return_at,
    },
    accommodation: {
      hotel: reservation.hotel_name,
      roomType: reservation.room_type,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
    },
    tourGuide: reservation.tour_guide,
    details: [
      ['Aranžman', pkg.name || contract.package_description || '—'],
      ['Destinacija', pkg.destination || '—'],
      ['Datum polaska', fmtDate(contract.departure_date || departure.depart_at)],
      ['Datum povratka', fmtDate(contract.return_date || departure.return_at)],
      ['Broj putnika', String(contract.party_size ?? reservation.party_size ?? 1)],
    ],
    lineItems: [],
    totals: { total, paid, balance: Math.max(total - paid, 0), currency, useTable: false },
    payment: {
      heading: 'Cijena i uslovi plaćanja',
      rows: [['Ukupan iznos', fmtMoney(total, currency)], ...termsRows],
    },
    terms: { heading: 'Uslovi ugovora', rows: termsRows },
    signature: {
      heading: 'Potpisi',
      left: 'Organizator: ____________________',
      right: 'Putnik: ____________________',
      leftName: org.name || '',
      rightName: contract.traveler_name || customer.full_name || '',
      signedAt: contract.signed_at,
    },
  };
}

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  advance: 'Avansni račun',
  final: 'Fiskalni račun',
  refund: 'Povrat sredstava',
};

function buildReceiptContext(receipt: any): RenderContext {
  const org = receipt.organizations || {};
  const reservation = receipt.reservations || {};
  const customer = reservation.customers || {};
  const contract = receipt.contracts || {};
  const currency = receipt.currency || 'BAM';
  const amount = Number(receipt.amount ?? 0);
  const typeLabel = RECEIPT_TYPE_LABELS[receipt.receipt_type] || 'Račun';

  const paymentRows: Array<[string, string]> = [
    ['Ukupno', fmtMoney(amount, currency)],
    ['Način plaćanja', receipt.payment_method || receipt.paymentMethod || '—'],
  ];
  if (receipt.linked_receipt_id) {
    paymentRows.push(['Povezani račun', shortId(receipt.linked_receipt_id)]);
  }

  return {
    docType: 'receipt',
    org,
    banner: {
      height: 130,
      title: 'RAČUN',
      titleAlign: 'left',
      titleSize: 26,
      metaLines: [
        `Broj: ${receipt.receipt_number || '—'}`,
        `Datum: ${fmtDate(receipt.issued_at)}`,
        `Tip: ${typeLabel}`,
      ],
      orgAlign: 'right',
    },
    customer: {
      name: customer.full_name || reservation.customer_name || receipt.traveler_name || receipt.travelerName || '—',
      phone: customer.phone || reservation.customer_phone || receipt.travelerPhone || '—',
      email: customer.email || reservation.customer_email || receipt.travelerEmail || '—',
    },
    pkg: {},
    travel: {},
    accommodation: {},
    details: [
      ['Rezervacija', shortId(reservation.id || receipt.reservation_id)],
      ['Ugovor', contract.contract_number || receipt.contract_number || receipt.contractNumber || '—'],
    ],
    lineItems: [],
    totals: { total: amount, paid: amount, balance: 0, currency, useTable: false },
    payment: { heading: 'Iznos', rows: paymentRows },
    terms: { heading: 'Uslovi', rows: [] },
    signature: {
      heading: 'Potpis',
      left: 'Izdavac: ____________________',
      right: 'Primatelj: ____________________',
      leftName: org.name || '',
      rightName: customer.full_name || reservation.customer_name || '',
    },
    fiscal: receipt.fiscal_data || {},
  };
}

function buildContext(docType: DocType, record: any): RenderContext {
  switch (docType) {
    case 'invoice':
      return buildInvoiceContext(record);
    case 'voucher':
      return buildVoucherContext(record);
    case 'contract':
      return buildContractContext(record);
    case 'receipt':
      return buildReceiptContext(record);
  }
}

// ---------------------------------------------------------------------------
// Block drawing
// ---------------------------------------------------------------------------

interface DrawState {
  y: number;
}

interface BlockArgs {
  doc: PDFKit.PDFDocument;
  ctx: RenderContext;
  block: BlockConfig;
  style: RenderStyle;
  state: DrawState;
}

function bodyFont(block: BlockConfig): 'DejaVu' | 'DejaVu-Bold' {
  return block.style?.bold ? 'DejaVu-Bold' : 'DejaVu';
}

function bodySize(block: BlockConfig, fallback: number): number {
  const s = block.style?.fontSize;
  return typeof s === 'number' && s >= 6 && s <= 32 ? s : fallback;
}

function bodyAlign(block: BlockConfig): BlockStyle['align'] {
  return block.style?.align;
}

function heading(args: BlockArgs, text: string, size = 13): void {
  const { doc, style, state } = args;
  doc.fontSize(size).font('DejaVu-Bold').fillColor(style.primaryColor).text(text, LEFT, state.y);
  state.y += size + 9;
}

function labelValueRows(args: BlockArgs, rows: Array<[string, string]>, size = 10): void {
  const { doc, style, state } = args;
  doc.fillColor(style.secondaryColor).fontSize(size);
  for (const [label, value] of rows) {
    doc.font('DejaVu-Bold').text(`${label}:`, LEFT, state.y, { width: 160 });
    doc.font('DejaVu').text(value || '—', 220, state.y, { width: 320 });
    state.y += size + 6;
  }
  state.y += 6;
}

function plainLines(args: BlockArgs, lines: string[], size = 11): void {
  const { doc, style, block, state } = args;
  const fs = bodySize(block, size);
  doc.fontSize(fs).font(bodyFont(block)).fillColor(style.secondaryColor);
  const align = bodyAlign(block);
  for (const line of lines) {
    doc.text(line, LEFT, state.y, { width: CONTENT_WIDTH, ...(align ? { align } : {}) });
    state.y += fs + 5;
  }
  state.y += 6;
}

function drawHeader(args: BlockArgs): void {
  const { doc, ctx, style, state } = args;
  const { banner, org } = ctx;

  doc.rect(0, 0, PAGE_WIDTH, banner.height).fill(style.primaryColor);

  doc
    .fillColor('#FFFFFF')
    .fontSize(banner.titleSize)
    .font('DejaVu-Bold')
    .text(banner.title, LEFT, 30, { align: banner.titleAlign, width: CONTENT_WIDTH });

  doc.fontSize(banner.title === 'INVOICE' ? 10 : 11).font('DejaVu');
  let metaY = banner.title === 'INVOICE' ? 80 : 70;
  for (const line of banner.metaLines) {
    doc.text(line, LEFT, metaY, {
      width: CONTENT_WIDTH,
      ...(banner.titleAlign === 'right' ? { align: 'right' as const } : {}),
    });
    metaY += 16;
  }

  const orgX = banner.orgAlign === 'right' ? 395 : LEFT;
  const orgWidth = banner.orgAlign === 'right' ? 150 : 300;
  const orgOpts = banner.orgAlign === 'right'
    ? { width: orgWidth, align: 'right' as const }
    : { width: orgWidth };

  if (banner.title !== 'VOUCHER') {
    doc.fillColor('#FFFFFF').fontSize(18).font('DejaVu-Bold')
      .text(org.name || 'Travel Agency', orgX, 35, orgOpts);
    doc.fontSize(9).font('DejaVu').fillColor(BANNER_SUB);
    let oy = 65;
    const orgLines = [
      org.address,
      org.email,
      org.phone,
      org.tax_id ? `ID: ${org.tax_id}` : null,
      org.bank_account ? `IBAN: ${org.bank_account}` : null,
    ].filter(Boolean) as string[];
    for (const line of orgLines) {
      doc.text(line, orgX, oy, orgOpts);
      oy += 13;
    }
  }

  doc.fillColor(style.secondaryColor);
  state.y = banner.height + 30;
}

function drawCustomerInfo(args: BlockArgs): void {
  const { ctx, block } = args;
  const label = ctx.docType === 'invoice' ? 'Bill To' : block.label || 'Customer Information';
  heading(args, label, ctx.docType === 'invoice' ? 12 : 13);
  const rows: Array<[string, string]> = [
    ['Klijent', ctx.customer.name],
    ['Telefon', ctx.customer.phone],
  ];
  if (ctx.customer.email && ctx.customer.email !== '—') rows.push(['Email', ctx.customer.email]);
  labelValueRows(args, rows, bodySize(block, 10));
}

function drawPackageDetails(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.pkg.name && !ctx.pkg.destination && !ctx.pkg.description) return;
  heading(args, block.label || 'Package Details');
  const rows: Array<[string, string]> = [];
  if (ctx.pkg.name) rows.push(['Aranžman', ctx.pkg.name]);
  if (ctx.pkg.destination) rows.push(['Destinacija', ctx.pkg.destination]);
  if (!ctx.pkg.name && ctx.pkg.description) rows.push(['Opis', ctx.pkg.description]);
  labelValueRows(args, rows, bodySize(block, 10));
}

function drawTravelDates(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.travel.departAt && !ctx.travel.returnAt) return;
  heading(args, block.label || 'Travel Dates');
  labelValueRows(
    args,
    [
      ['Datum polaska', fmtDate(ctx.travel.departAt)],
      ['Datum povratka', fmtDate(ctx.travel.returnAt)],
    ],
    bodySize(block, 10)
  );
}

function drawAccommodation(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.accommodation.hotel) return;
  heading(args, block.label || 'Accommodation');
  const rows: Array<[string, string]> = [['Hotel', ctx.accommodation.hotel]];
  if (ctx.accommodation.roomType) rows.push(['Tip sobe', ctx.accommodation.roomType]);
  if (ctx.accommodation.checkIn) rows.push(['Check-in', fmtDate(ctx.accommodation.checkIn)]);
  if (ctx.accommodation.checkOut) rows.push(['Check-out', fmtDate(ctx.accommodation.checkOut)]);
  labelValueRows(args, rows, bodySize(block, 10));
}

function drawTourGuide(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.tourGuide) return;
  heading(args, block.label || 'Tour Guide');
  labelValueRows(args, [['Vodič', ctx.tourGuide]], bodySize(block, 10));
}

function drawReservationDetails(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.details.length) return;
  heading(args, block.label || 'Reservation Details');
  labelValueRows(args, ctx.details, bodySize(block, 10));
}

function drawTable(args: BlockArgs): void {
  const { doc, ctx, style, state } = args;
  if (!ctx.lineItems.length) return;

  const col1 = LEFT;
  const col2 = 300;
  const col3 = 390;
  const col4 = 470;
  const tableY = state.y;
  const { currency } = ctx.totals;

  doc.rect(LEFT, tableY - 5, RIGHT - LEFT, 22).fill(style.primaryColor);
  doc.fillColor('#FFFFFF').fontSize(9).font('DejaVu-Bold');
  doc.text('Description', col1 + 5, tableY + 2);
  doc.text('Qty', col2, tableY + 2, { width: 40, align: 'right' });
  doc.text('Unit Price', col3, tableY + 2, { width: 60, align: 'right' });
  doc.text('Amount', col4, tableY + 2, { width: 70, align: 'right' });

  doc.fillColor(style.secondaryColor);

  let rowY = tableY + 25;
  const rowHeight = 24;

  ctx.lineItems.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.rect(LEFT, rowY - 12, RIGHT - LEFT, rowHeight).fill(STRIPE);
    }
    doc.fontSize(10).font('DejaVu').fillColor(style.secondaryColor);
    doc.text(row.description, col1, rowY, { width: 240 });
    if (row.sub) {
      doc.fontSize(8).fillColor(MUTED).text(row.sub, col1, rowY + 14, { width: 240 });
    }
    doc.fontSize(10).fillColor(style.secondaryColor);
    doc.text(String(row.qty), col2, rowY, { width: 40, align: 'right' });
    doc.text(row.unitPrice.toFixed(2), col3, rowY, { width: 60, align: 'right' });
    doc.text(`${row.amount.toFixed(2)} ${currency}`, col4, rowY, { width: 70, align: 'right' });

    rowY += rowHeight;
    doc.moveTo(LEFT, rowY - 6).lineTo(RIGHT, rowY - 6).strokeColor(RULE).stroke();
  });

  state.y = rowY + 12;
}

function drawTotals(args: BlockArgs): void {
  const { doc, ctx, style, block, state } = args;
  const { total, paid, balance, currency, useTable } = ctx.totals;

  if (useTable) {
    const totalsY = state.y + 6;
    doc.font('DejaVu').fontSize(10).fillColor(style.secondaryColor);
    doc.text('Subtotal', 380, totalsY, { width: 80, align: 'right' });
    doc.text(`${total.toFixed(2)} ${currency}`, 460, totalsY, { width: 80, align: 'right' });
    doc.text('Paid', 380, totalsY + 20, { width: 80, align: 'right' });
    doc.text(`${paid.toFixed(2)} ${currency}`, 460, totalsY + 20, { width: 80, align: 'right' });
    doc.font('DejaVu-Bold');
    doc.text('Balance Due', 380, totalsY + 44, { width: 80, align: 'right' });
    doc.fillColor(balance > 0 ? '#DC2626' : '#059669');
    doc.text(`${balance.toFixed(2)} ${currency}`, 460, totalsY + 44, { width: 80, align: 'right' });
    doc.fillColor(style.secondaryColor);
    state.y = totalsY + 78;
    return;
  }

  heading(args, block.label || 'Totals');
  const rows: Array<[string, string]> = [['Ukupan iznos', fmtMoney(total, currency)]];
  if (paid > 0 && paid !== total) rows.push(['Uplaćeno', fmtMoney(paid, currency)]);
  if (balance > 0) rows.push(['Za uplatu', fmtMoney(balance, currency)]);
  labelValueRows(args, rows, bodySize(block, 10));
}

function drawPaymentInfo(args: BlockArgs): void {
  const { ctx, block } = args;
  if (!ctx.payment.rows.length) return;
  heading(args, block.label || ctx.payment.heading, ctx.docType === 'invoice' ? 12 : 13);
  labelValueRows(args, ctx.payment.rows, bodySize(block, 10));

  if (ctx.fiscal && (ctx.fiscal.cin || ctx.fiscal.zki || ctx.fiscal.verificationUrl)) {
    heading(args, 'Fiskalni podaci');
    const rows: Array<[string, string]> = [];
    if (ctx.fiscal.cin) rows.push(['CIN', String(ctx.fiscal.cin)]);
    if (ctx.fiscal.zki) rows.push(['ZKI', String(ctx.fiscal.zki)]);
    if (ctx.fiscal.verificationUrl) rows.push(['Provjera', String(ctx.fiscal.verificationUrl)]);
    labelValueRows(args, rows, 9);
  }
}

function drawTerms(args: BlockArgs): void {
  const { ctx, block } = args;
  const custom = block.customText?.trim();
  if (!custom && !ctx.terms.rows.length) return;
  heading(args, block.label || ctx.terms.heading);
  if (custom) {
    plainLines(args, custom.split('\n'), 10);
  }
  if (ctx.terms.rows.length) {
    labelValueRows(args, ctx.terms.rows, bodySize(block, 10));
  }
}

function drawSignature(args: BlockArgs): void {
  const { doc, ctx, style, block, state } = args;
  const custom = block.customText?.trim();

  state.y = Math.max(state.y + 12, ctx.docType === 'receipt' ? 580 : state.y + 12);
  heading(args, block.label || ctx.signature.heading);

  if (custom) {
    plainLines(args, custom.split('\n'), 10);
  }

  doc.fontSize(bodySize(block, 10)).font('DejaVu').fillColor(style.secondaryColor);
  doc.text(ctx.signature.left, LEFT, state.y, { width: 240 });
  doc.text(ctx.signature.right, 320, state.y, { width: 220 });
  state.y += 28;
  doc.text(ctx.signature.leftName, LEFT, state.y, { width: 240 });
  doc.text(ctx.signature.rightName, 320, state.y, { width: 220 });
  state.y += 28;

  if (ctx.signature.signedAt) {
    doc.fontSize(9).fillColor(MUTED).text(`Potpisano: ${fmtDate(ctx.signature.signedAt)}`, LEFT, state.y, {
      width: CONTENT_WIDTH,
    });
    state.y += 16;
  }
}

function drawFooter(args: BlockArgs): void {
  const { doc, ctx, style, block } = args;
  const text = block.customText?.trim() || ctx.org.invoice_footer || style.footerText;

  doc.rect(LEFT, FOOTER_RULE_Y, CONTENT_WIDTH, 0.5).fill(style.primaryColor);
  doc
    .fontSize(bodySize(block, 9))
    .font(bodyFont(block))
    .fillColor(MUTED)
    .text(text, LEFT, FOOTER_TEXT_Y, { align: bodyAlign(block) || 'center', width: CONTENT_WIDTH });
  doc
    .fontSize(7)
    .font('DejaVu')
    .fillColor(CREDIT)
    .text('Generisano od Travline', LEFT, FOOTER_CREDIT_Y, { align: 'center', width: CONTENT_WIDTH });
}

const BLOCK_RENDERERS: Record<string, (args: BlockArgs) => void> = {
  header: drawHeader,
  customerInfo: drawCustomerInfo,
  packageDetails: drawPackageDetails,
  travelDates: drawTravelDates,
  accommodation: drawAccommodation,
  tourGuide: drawTourGuide,
  reservationDetails: drawReservationDetails,
  table: drawTable,
  totals: drawTotals,
  paymentInfo: drawPaymentInfo,
  terms: drawTerms,
  signature: drawSignature,
  footer: drawFooter,
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Render a templated PDF for `docType` using the org's stored template config.
 *
 * `config` may be a partial or null value straight out of
 * `org_branding.pdf_template_config` — it is merged with defaults, so a missing
 * or stale stored config degrades to the default block layout instead of
 * producing an empty document.
 */
export async function renderTemplatedPDF(
  docType: DocType,
  record: any,
  config?: Partial<TemplateConfig> | null,
  styleOverrides?: Partial<RenderStyle>
): Promise<Buffer> {
  const merged = mergeWithDefaults(config ?? null);
  const blocks = getEnabledBlocks(merged, docType);
  const docConfig = merged[docType];
  const style: RenderStyle = {
    ...DEFAULT_STYLE,
    ...styleOverrides,
    ...(docConfig.footerText ? { footerText: docConfig.footerText } : {}),
  };
  const ctx = buildContext(docType, record);

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      registerUnicodeFonts(doc);
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const state: DrawState = { y: 50 };
      const footerBlock = blocks.find(b => b.key === 'footer');

      for (const block of blocks) {
        if (block.key === 'footer') continue;
        const draw = BLOCK_RENDERERS[block.key];
        if (!draw) continue;
        if (state.y > PAGE_SAFE_BOTTOM) {
          doc.addPage();
          state.y = 50;
        }
        draw({ doc, ctx, block, style, state });
      }

      if (footerBlock) {
        drawFooter({ doc, ctx, block: footerBlock, style, state });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export { fmtDate, fmtMoney, shortId, DEFAULT_STYLE };
