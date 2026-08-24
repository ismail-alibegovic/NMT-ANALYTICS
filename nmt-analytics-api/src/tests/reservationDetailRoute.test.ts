import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const reservationRow = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  customer_id: '22222222-2222-4222-8222-222222222222',
  departure_id: '33333333-3333-4333-8333-333333333333',
  customer_name: 'Test Customer',
  customer_phone: '+38761111222',
  party_size: 2,
  reservation_at: '2026-08-24T10:00:00.000Z',
  status: 'confirmed',
  total_amount: 1200,
  paid_amount: 300,
  balance_due: 900,
  payment_status: 'partially_paid',
  currency: 'BAM',
  source: 'agent',
  notes: 'Window seats preferred',
  options: {
    booking_snapshot: {
      booking_snapshot_version: 1,
    },
  },
  created_at: '2026-08-24T10:00:00.000Z',
  updated_at: '2026-08-24T11:00:00.000Z',
  assigned_to: '44444444-4444-4444-8444-444444444444',
  customers: {
    id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Test Customer',
    phone: '+38761111222',
    email: 'test@example.com',
  },
  departures: {
    id: '33333333-3333-4333-8333-333333333333',
    depart_at: '2026-09-01T06:00:00.000Z',
    return_at: '2026-09-05T18:00:00.000Z',
    packages: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Istanbul Tour',
      destination: 'Istanbul',
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
        single: vi.fn(async () => {
          const matchesId = filters.id === reservationRow.id;
          const matchesOrg = filters.org_id === reservationRow.org_id;

          if (matchesId && matchesOrg) {
            return { data: reservationRow, error: null };
          }

          return { data: null, error: { code: 'PGRST116', message: 'not found' } };
        }),
      };

      return builder;
    }),
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

describe('GET /api/reservations/:id', () => {
  it('returns 200 with transformed reservation for the same org', async () => {
    const res = await request(app).get(`/api/reservations/${reservationRow.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reservationRow.id);
    expect(res.body.customerName).toBe('Test Customer');
    expect(res.body.departureId).toBe(reservationRow.departure_id);
    expect(res.body.departureName).toBe(reservationRow.departures.depart_at);
    expect(res.body.packageName).toBe('Istanbul Tour');
    expect(res.body.options.booking_snapshot.booking_snapshot_version).toBe(1);
  });

  it('returns 404 when the reservation belongs to another org', async () => {
    currentOrgId = 'org-2';

    const res = await request(app).get(`/api/reservations/${reservationRow.id}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 when the reservation does not exist', async () => {
    const res = await request(app).get('/api/reservations/99999999-9999-4999-8999-999999999999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
