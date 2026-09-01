import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const futureReservation = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  customer_id: '22222222-2222-4222-8222-222222222222',
  departure_id: '33333333-3333-4333-8333-333333333333',
  customer_name: 'Future Customer',
  customer_phone: '+38761111222',
  party_size: 2,
  reservation_at: '2027-05-15T09:00:00.000Z',
  status: 'confirmed',
  total_amount: 1200,
  paid_amount: 0,
  balance_due: 1200,
  payment_status: 'unpaid',
  currency: 'BAM',
  source: 'agent',
  notes: null,
  options: {},
  created_at: '2026-08-31T17:54:55.394133+00:00',
  assigned_to: null,
  customers: null,
  departures: {
    id: '33333333-3333-4333-8333-333333333333',
    depart_at: '2027-05-20T08:00:00.000Z',
    return_at: '2027-05-27T18:00:00.000Z',
    packages: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Dubai Escape 2027',
      destination: 'Dubai',
    },
  },
};

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: any, _res: any, next: any) => next(),
  auditReservationUpdate: (_req: any, _res: any, next: any) => next(),
  auditReservationDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {
    sendBookingConfirmation: vi.fn(async () => undefined),
  },
}));

vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn(async () => ({})),
}));

vi.mock('../lib/pdfGenerator', () => ({
  generateVoucherPDF: vi.fn(async () => Buffer.from('pdf')),
  generateInvoicePDF: vi.fn(async () => Buffer.from('pdf')),
}));

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(async () => undefined),
}));

vi.mock('../lib/reservationAccommodation', () => ({
  getReservationAccommodation: vi.fn(async () => []),
  replaceReservationAccommodation: vi.fn(async () => []),
  deleteReservationAccommodation: vi.fn(async () => true),
  mapAccommodationError: vi.fn(() => null),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'reservations') {
        throw new Error(`Unhandled table: ${table}`);
      }

      const filters: Record<string, any> = {};
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        gte: vi.fn((column: string, value: any) => {
          filters[`${column}__gte`] = value;
          return builder;
        }),
        lte: vi.fn((column: string, value: any) => {
          filters[`${column}__lte`] = value;
          return builder;
        }),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        then: (resolve: any) => {
          const sameOrg = filters.org_id === futureReservation.org_id;
          if (!sameOrg) return Promise.resolve(resolve({ data: [], error: null, count: 0 }));

          const afterStart = !filters['reservation_at__gte'] || futureReservation.reservation_at >= filters['reservation_at__gte'];
          const beforeEnd = !filters['reservation_at__lte'] || futureReservation.reservation_at <= filters['reservation_at__lte'];
          const data = afterStart && beforeEnd ? [futureReservation] : [];
          return Promise.resolve(resolve({ data, error: null, count: data.length }));
        },
      };

      return builder;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/reservations');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
});

describe('GET /api/reservations', () => {
  it('returns future reservations when no explicit date filter is provided', async () => {
    const res = await request(app).get('/api/reservations');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(futureReservation.id);
    expect(res.body.data[0].customerName).toBe('Future Customer');
  });

  it('still respects explicit from/to filters', async () => {
    const included = await request(app).get('/api/reservations?from=2027-05-01&to=2027-05-31');
    expect(included.status).toBe(200);
    expect(included.body.data).toHaveLength(1);

    const excluded = await request(app).get('/api/reservations?from=2027-06-01&to=2027-06-30');
    expect(excluded.status).toBe(200);
    expect(excluded.body.data).toHaveLength(0);
  });
});
