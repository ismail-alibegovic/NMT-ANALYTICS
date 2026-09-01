import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000000002';
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_DEPARTURE_ID = '10000000-0000-4000-8000-000000000002';
const RESERVATION_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_RESERVATION_ID = '20000000-0000-4000-8000-000000000002';
const FOREIGN_RESERVATION_ID = '20000000-0000-4000-8000-000000000003';
const ALLOCATION_ID = '30000000-0000-4000-8000-000000000001';

let reservations: any[] = [];
let departures: any[] = [];
let allocations: any[] = [];
let requirements: any[] = [];

function resetStores() {
  departures = [
    { id: DEPARTURE_ID, org_id: ORG_ID },
    { id: OTHER_DEPARTURE_ID, org_id: ORG_ID },
  ];
  reservations = [
    { id: RESERVATION_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, status: 'confirmed' },
    { id: OTHER_RESERVATION_ID, org_id: ORG_ID, departure_id: OTHER_DEPARTURE_ID, status: 'confirmed' },
    { id: FOREIGN_RESERVATION_ID, org_id: OTHER_ORG_ID, departure_id: DEPARTURE_ID, status: 'confirmed' },
  ];
  allocations = [
    {
      id: ALLOCATION_ID,
      org_id: ORG_ID,
      departure_id: DEPARTURE_ID,
      hotel_id: 'hotel-1',
      room_type: 'double',
      room_label: 'Double',
      rooms_reserved: 2,
      capacity_per_room: 2,
      sell_price: 790,
      net_price: 650,
      check_in: '2027-06-10',
      check_out: '2027-06-17',
    },
  ];
  requirements = [
    { id: 'req-1', org_id: ORG_ID, reservation_id: RESERVATION_ID, hotel_allocation_id: ALLOCATION_ID, room_count: 2 },
  ];
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    filters: {},
    notFilters: {},
    inFilters: {},
    selectColumns: '',
  };

  const builder: any = {
    select: vi.fn((columns?: string) => {
      state.selectColumns = columns || '';
      return builder;
    }),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    neq: vi.fn((column: string, value: any) => {
      state.notFilters[column] = value;
      return builder;
    }),
    in: vi.fn((column: string, values: any[]) => {
      state.inFilters[column] = values;
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  function applyFilters(rows: any[]) {
    return rows.filter((row) => (
      Object.entries(state.filters).every(([key, value]) => row[key] === value) &&
      Object.entries(state.notFilters).every(([key, value]) => row[key] !== value) &&
      Object.entries(state.inFilters).every(([key, values]) => {
        if (key === 'reservations.status') {
          const reservation = reservations.find((item) => item.id === row.reservation_id);
          return Array.isArray(values) ? values.includes(reservation?.status) : reservation?.status === values;
        }
        return Array.isArray(values) ? values.includes(row[key]) : row[key] === values;
      })
    ));
  }

  async function execute() {
    if (table === 'departures') return { data: applyFilters(departures), error: null };
    if (table === 'reservations') return { data: applyFilters(reservations), error: null };
    if (table === 'hotel_allocations') {
      const rows = applyFilters(allocations).map((row) => ({
        ...row,
        hotels: { id: row.hotel_id, name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
      }));
      return { data: rows, error: null };
    }
    if (table === 'reservation_accommodation_requirements') {
      const rows = applyFilters(requirements).map((row) => (
        state.selectColumns.includes('reservations!inner(status)')
          ? { ...row, reservations: { status: reservations.find((item) => item.id === row.reservation_id)?.status } }
          : row
      ));
      return { data: rows, error: null };
    }
    return { data: [], error: null };
  }

  return builder;
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'test@travline.app', role: 'agent' } as any;
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
  auditDepartureCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditDepartureUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditDepartureDelete: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
  handleSupabaseError: (res: Response, err: { code?: string; message?: string }, message: string) =>
    res.status(500).json({ code: err?.code || 'DATABASE_ERROR', message: err?.message || message }),
}));

vi.mock('../lib/departureCapacity', () => ({
  getDepartureBookedMap: vi.fn(async () => new Map()),
}));

vi.mock('../lib/departureAccommodation', () => ({
  getDepartureAccommodationAllotments: vi.fn(),
  materializeDepartureAccommodationFromPackage: vi.fn(),
  updateDepartureAccommodationAllotment: vi.fn(),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/departures');
  app.use('/api', mod.default);
});

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

describe('GET /api/departures/:id/accommodation-options', () => {
  it('counts all active reservations by default for new sale availability', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE_ID}/accommodation-options`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        id: ALLOCATION_ID,
        reservedRooms: 2,
        availableRooms: 0,
      }),
    ]);
  });

  it('excludes only the current reservation when reservationId matches the same org and departure', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE_ID}/accommodation-options`).query({ reservationId: RESERVATION_ID });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        id: ALLOCATION_ID,
        reservedRooms: 0,
        availableRooms: 2,
      }),
    ]);
  });

  it('rejects reservationId values from another departure so inventory cannot be inflated', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE_ID}/accommodation-options`).query({ reservationId: OTHER_RESERVATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Reservation must belong to the same departure');
  });

  it('returns 404 for cross-org reservationId and does not inflate availability', async () => {
    const res = await request(app)
      .get(`/api/departures/${DEPARTURE_ID}/accommodation-options`)
      .query({ reservationId: FOREIGN_RESERVATION_ID });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toBe('Reservation not found');

    const baseline = await request(app).get(`/api/departures/${DEPARTURE_ID}/accommodation-options`);
    expect(baseline.status).toBe(200);
    expect(baseline.body.items).toEqual([
      expect.objectContaining({
        id: ALLOCATION_ID,
        reservedRooms: 2,
        availableRooms: 0,
      }),
    ]);
  });
});
