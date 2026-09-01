import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EXISTING_CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';

let customers = [
  {
    id: EXISTING_CUSTOMER_ID,
    org_id: ORG_ID,
    full_name: 'Existing Customer',
    phone: '+38761111111',
    email: 'existing@example.com',
    status: 'active',
  },
];

let reservations: any[] = [];
const replaceReservationAccommodation = vi.fn(async () => []);
type LooseRow = Record<string, any>;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: USER_ID, email: 'agent@example.com', role: 'agent' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = ORG_ID;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationDelete: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {},
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
  replaceReservationAccommodation,
  deleteReservationAccommodation: vi.fn(async () => true),
  mapAccommodationError: vi.fn(() => null),
}));

vi.mock('../lib/supabase', () => {
  function buildCustomersQuery() {
    let rows = customers.slice();
    let insertedPayload: any = null;
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        rows = rows.filter((row: LooseRow) => row[column] === value);
        return builder;
      }),
      or: vi.fn((expression: string) => {
        const phoneMatch = expression.match(/phone\.eq\.(.+)$/);
        const phone = phoneMatch ? phoneMatch[1] : '';
        rows = rows.filter((row) => row.phone === phone);
        return builder;
      }),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (insertedPayload) {
          const newRow = { id: NEW_CUSTOMER_ID, ...insertedPayload };
          customers.push(newRow);
          insertedPayload = null;
          return { data: newRow, error: null };
        }
        return { data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' } };
      }),
      maybeSingle: vi.fn(async () => ({ data: rows[0] || null, error: null })),
      insert: vi.fn((payload: any) => {
        insertedPayload = payload;
        return builder;
      }),
      then: (resolve: any) => {
        if (insertedPayload) {
          const newRow = { id: NEW_CUSTOMER_ID, ...insertedPayload };
          customers.push(newRow);
          insertedPayload = null;
          return Promise.resolve(resolve({ data: [newRow], error: null, count: 1 }));
        }
        return Promise.resolve(resolve({ data: rows, error: null, count: rows.length }));
      },
    };
    return builder;
  }

  function buildReservationsQuery() {
    let insertPayload: any = null;
    const builder: any = {
      insert: vi.fn((payload: any) => {
        insertPayload = payload;
        return builder;
      }),
      select: vi.fn(() => builder),
      single: vi.fn(async () => {
        const row = {
          id: RESERVATION_ID,
          ...insertPayload,
          total_amount: insertPayload?.total_amount ?? 0,
          currency: insertPayload?.currency ?? 'BAM',
          customer_name: insertPayload?.customer_name,
          customer_phone: insertPayload?.customer_phone,
          party_size: insertPayload?.party_size,
          options: insertPayload?.options || {},
          notes: insertPayload?.notes || null,
        };
        reservations.push(row);
        return { data: row, error: null };
      }),
      delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      eq: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve(resolve({ data: [], error: null, count: 0 })),
    };
    return builder;
  }

  function buildDeparturesQuery() {
    let rows = [{ id: 'departure-1', org_id: ORG_ID, package_id: 'package-1', packages: { name: 'Test package' } }];
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        rows = rows.filter((row: LooseRow) => row[column] === value);
        return builder;
      }),
      single: vi.fn(async () => ({ data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' } })),
      then: (resolve: any) => Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
    };
    return builder;
  }

  function buildDeparturePassengersQuery() {
    return {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: 'passenger-1', full_name: 'Traveller One' }, error: null })),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };
  }

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === 'customers') return buildCustomersQuery();
        if (table === 'reservations') return buildReservationsQuery();
        if (table === 'departures') return buildDeparturesQuery();
        if (table === 'departure_passengers') return buildDeparturePassengersQuery();
        if (table === 'package_services' || table === 'package_hotels') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        throw new Error(`Unhandled table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
    handleSupabaseError: (res: Response, _error: unknown, message: string) => res.status(500).json({ code: 'DB_ERROR', message }),
  };
});

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/reservations');
  app.use('/api', mod.default);
});

beforeEach(() => {
  vi.clearAllMocks();
  customers = [
    {
      id: EXISTING_CUSTOMER_ID,
      org_id: ORG_ID,
      full_name: 'Existing Customer',
      phone: '+38761111111',
      email: 'existing@example.com',
      status: 'active',
    },
  ];
  reservations = [];
});

describe('POST /api/reservations customer linkage', () => {
  it('creates and links a commercial customer when new sale submits upsert=true', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'New Commercial Customer',
        customerPhone: '+38762222222',
        customerEmail: 'new@example.com',
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        upsert: true,
      });

    expect(res.status).toBe(201);
    expect(customers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: NEW_CUSTOMER_ID,
        full_name: 'New Commercial Customer',
        phone: '+38762222222',
      }),
    ]));
    expect(reservations[0]).toMatchObject({
      customer_id: NEW_CUSTOMER_ID,
      customer_name: 'New Commercial Customer',
      customer_phone: '+38762222222',
    });
  });
});
