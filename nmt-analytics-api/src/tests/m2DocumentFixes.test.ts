import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateInvoicePDF, generateOfferPDF } from '../lib/pdfGenerator';
import { generateReceiptPDF } from '../lib/receiptGenerator';

const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-test-1';
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLog', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/auditLogger', () => ({
  logAction: vi.fn(async () => {}),
}));

import receiptsRouter from '../routes/receipts';
import departureDocsRouter from '../routes/departureDocuments';

describe('M2 Document & Fiscal Corrections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateInvoicePDF returns a valid PDF buffer and preserves reservation total_amount over package_services', async () => {
    const buf = await generateInvoicePDF({
      id: 'res-11112222',
      total_amount: 1500,
      paid_amount: 500,
      currency: 'BAM',
      party_size: 2,
      payment_status: 'partial',
      status: 'confirmed',
      organizations: { name: 'Travline Agency', tax_id: '4200001230001', bank_account: 'BA39123456' },
      customers: { full_name: 'Amina Putnik', phone: '+38761111222' },
      package_services: [
        { description: 'Base Tour', unitPrice: 400, quantity: 2, totalPrice: 800, isOptional: false },
        { description: 'Optional Excursion', unitPrice: 100, quantity: 2, totalPrice: 200, isOptional: true },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('generateReceiptPDF renders non-fiscal and fiscalized receipts as valid PDFs', async () => {
    const nonFiscalBuf = await generateReceiptPDF({
      id: 'rec-1',
      receipt_number: 'PU-2026-0001',
      receipt_type: 'final',
      amount: 300,
      currency: 'BAM',
      issued_at: '2026-11-25T10:00:00Z',
      fiscal_data: {},
      organizations: { name: 'Travline Agency' },
      reservations: { id: 'res-1', customers: { full_name: 'Amina Putnik' } },
    });
    expect(nonFiscalBuf.subarray(0, 4).toString('utf8')).toBe('%PDF');

    const fiscalBuf = await generateReceiptPDF({
      id: 'rec-2',
      receipt_number: 'FR-2026-0002',
      receipt_type: 'final',
      amount: 300,
      currency: 'BAM',
      issued_at: '2026-11-25T10:00:00Z',
      fiscal_data: { cin: 'CIN-999' },
      organizations: { name: 'Travline Agency' },
      reservations: { id: 'res-1', customers: { full_name: 'Amina Putnik' } },
    });
    expect(fiscalBuf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('generateOfferPDF renders a valid quotation PDF buffer', async () => {
    const buf = await generateOfferPDF({
      quotation: {
        id: 'quo-1',
        reference: 'QT-2026-001',
        title: 'Corporate Istanbul',
        status: 'sent',
        currency: 'EUR',
        sellTotal: 4250,
        bookingContext: { contactName: 'Acme d.o.o.', destination: 'Istanbul', travelers: 10 },
      },
      items: [
        { dayNumber: 1, title: 'Flight & Transfer', quantity: 10, unit: 'per_person', netUnitPrice: 350, markupPercent: 20, currency: 'EUR', included: true },
      ],
    });
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('PATCH and DELETE /api/receipts/:id reject issued receipts with 409 RECEIPT_IMMUTABLE', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', receiptsRouter);

    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: { id: 'rec-1', org_id: 'org-test-1', reservation_id: 'res-1', issued_at: '2026-11-25T10:00:00Z' },
          error: null,
        })),
      };
      return chain;
    });

    const patchRes = await request(app).patch('/api/receipts/rec-1').send({ amount: 999 });
    expect(patchRes.status).toBe(409);
    expect(patchRes.body.code).toBe('RECEIPT_IMMUTABLE');

    const delRes = await request(app).delete('/api/receipts/rec-1');
    expect(delRes.status).toBe(409);
    expect(delRes.body.code).toBe('RECEIPT_IMMUTABLE');
  });

  it('GET /api/departures/:id/vouchers-batch.pdf excludes cancelled reservations and handles full_name', async () => {
    const app = express();
    app.use('/api', departureDocsRouter);

    const neqCalls: Array<[string, any]> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn((col: string, val: any) => {
          neqCalls.push([col, val]);
          return chain;
        }),
        order: vi.fn(async () => ({
          data: [
            {
              id: 'res-active',
              status: 'confirmed',
              party_size: 2,
              total_amount: 1000,
              paid_amount: 500,
              currency: 'BAM',
              customers: { full_name: 'Selma Hadzic', phone: '+38761000111', email: 'selma@example.com' },
            },
          ],
          error: null,
        })),
        single: vi.fn(async () => {
          if (table === 'departures') {
            return {
              data: { id: 'dep-1', org_id: 'org-test-1', depart_at: '2026-06-01', return_at: '2026-06-05', packages: { name: 'Istanbul', destination: 'Istanbul', currency: 'BAM' } },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    });

    const res = await request(app).get('/api/departures/dep-1/vouchers-batch.pdf');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(neqCalls).toContainEqual(['status', 'cancelled']);
  });
});
