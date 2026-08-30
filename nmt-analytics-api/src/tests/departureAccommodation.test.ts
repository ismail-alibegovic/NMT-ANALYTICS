import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const DEPARTURE = '33333333-3333-4333-8333-333333333333';
const PACKAGE = '44444444-4444-4444-8444-444444444444';
const HOTEL = '55555555-5555-4555-8555-555555555555';
const PACKAGE_HOTEL = '66666666-6666-4666-8666-666666666666';

let currentOrgId = ORG;
let packageHotels: any[] = [];
let hotelAllocations: any[] = [];
let departures: any[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matches(row: any, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

function withHotel(row: any) {
  return {
    ...row,
    hotels: { id: row.hotel_id, name: 'Hotel Grand', destination: 'Istanbul', stars: 5 },
  };
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    filters: {},
    action: 'select',
    payload: undefined,
    limitCount: null,
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
    order: vi.fn(() => builder),
    limit: vi.fn((count: number) => {
      state.limitCount = count;
      return builder;
    }),
    insert: vi.fn((payload: any) => {
      state.action = 'insert';
      state.payload = payload;
      return builder;
    }),
    update: vi.fn((payload: any) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    }),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    }),
    single: vi.fn(async () => {
      const result = await execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  async function execute() {
    if (table === 'departures') {
      let rows = departures.filter((row) => matches(row, state.filters));
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    if (table === 'package_hotels') {
      let rows = packageHotels.filter((row) => matches(row, state.filters));
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    if (table === 'hotel_allocations') {
      if (state.action === 'insert') {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
        rows.forEach((row, index) => hotelAllocations.push({
          id: `allocation-${hotelAllocations.length + index + 1}`,
          created_at: '2026-08-30T12:00:00.000Z',
          updated_at: '2026-08-30T12:00:00.000Z',
          ...clone(row),
        }));
        return { data: null, error: null };
      }

      if (state.action === 'update') {
        hotelAllocations = hotelAllocations.map((row) => (
          matches(row, state.filters) ? { ...row, ...clone(state.payload) } : row
        ));
      }

      let rows = hotelAllocations.filter((row) => matches(row, state.filters));
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      if (state.selectColumns.includes('hotels:')) rows = rows.map(withHotel);
      return { data: clone(rows), error: null };
    }

    throw new Error(`Unhandled table ${table}`);
  }

  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'manager' };
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
  auditDepartureCreate: (_req: any, _res: any, next: any) => next(),
  auditDepartureUpdate: (_req: any, _res: any, next: any) => next(),
  auditDepartureDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/manualMessaging', () => ({
  manualMessageSchema: { safeParse: vi.fn(() => ({ success: false })) },
  sendManualEmailForOrg: vi.fn(),
  sendManualSmsForOrg: vi.fn(),
}));

beforeEach(() => {
  currentOrgId = ORG;
  departures = [{ id: DEPARTURE, org_id: ORG, package_id: PACKAGE }];
  packageHotels = [{
    id: PACKAGE_HOTEL,
    org_id: ORG,
    package_id: PACKAGE,
    hotel_id: HOTEL,
    sort_order: 1,
    room_options: [
      { type: 'double', label: 'Double', available: 20, net_price: 80, sell_price: 110 },
      { type: 'triple', label: 'Triple', available: 10, net_price: 90, sell_price: 125 },
    ],
  }];
  hotelAllocations = [];
});

describe('departure accommodation allotments', () => {
  it('materializes package room options into departure-specific hotel allocations', async () => {
    const { materializeDepartureAccommodationFromPackage } = await import('../lib/departureAccommodation');

    const result = await materializeDepartureAccommodationFromPackage({
      orgId: ORG,
      departureId: DEPARTURE,
      packageId: PACKAGE,
      departAt: '2026-09-10T08:00:00.000Z',
      returnAt: '2026-09-17T08:00:00.000Z',
    });

    expect(result).toEqual({ inserted: 2, skipped: false });
    expect(hotelAllocations).toMatchObject([
      {
        org_id: ORG,
        departure_id: DEPARTURE,
        hotel_id: HOTEL,
        package_hotel_id: PACKAGE_HOTEL,
        source_room_option_index: 0,
        room_type: 'double',
        room_label: 'Double',
        rooms_reserved: 20,
        template_rooms: 20,
        capacity_per_room: 2,
        check_in: '2026-09-10',
        check_out: '2026-09-17',
        net_price: 80,
        sell_price: 110,
      },
      {
        room_type: 'triple',
        rooms_reserved: 10,
        capacity_per_room: 3,
      },
    ]);
  });

  it('does not rematerialize or mutate an existing departure snapshot after package changes', async () => {
    const { materializeDepartureAccommodationFromPackage } = await import('../lib/departureAccommodation');
    hotelAllocations = [{ id: 'existing', org_id: ORG, departure_id: DEPARTURE, rooms_reserved: 18 }];
    packageHotels[0].room_options[0].available = 99;

    const result = await materializeDepartureAccommodationFromPackage({
      orgId: ORG,
      departureId: DEPARTURE,
      packageId: PACKAGE,
      departAt: '2026-09-10T08:00:00.000Z',
      returnAt: '2026-09-17T08:00:00.000Z',
    });

    expect(result).toEqual({ inserted: 0, skipped: true });
    expect(hotelAllocations).toEqual([{ id: 'existing', org_id: ORG, departure_id: DEPARTURE, rooms_reserved: 18 }]);
  });

  it('updates only the requested departure allotment in the authenticated organization', async () => {
    const { updateDepartureAccommodationAllotment } = await import('../lib/departureAccommodation');
    hotelAllocations = [
      { id: 'same-org', org_id: ORG, departure_id: DEPARTURE, hotel_id: HOTEL, room_type: 'double', room_label: 'Double', rooms_reserved: 20, template_rooms: 20, capacity_per_room: 2, check_in: '2026-09-10', check_out: '2026-09-17', net_price: 80, sell_price: 110 },
      { id: 'other-org', org_id: OTHER_ORG, departure_id: DEPARTURE, hotel_id: HOTEL, room_type: 'double', rooms_reserved: 5 },
    ];

    const updated = await updateDepartureAccommodationAllotment({
      orgId: ORG,
      departureId: DEPARTURE,
      itemId: 'same-org',
      roomCount: 18,
    });

    expect(updated?.departureRooms).toBe(18);
    expect(hotelAllocations.find((row) => row.id === 'same-org')?.rooms_reserved).toBe(18);
    expect(hotelAllocations.find((row) => row.id === 'other-org')?.rooms_reserved).toBe(5);

    const denied = await updateDepartureAccommodationAllotment({
      orgId: ORG,
      departureId: DEPARTURE,
      itemId: 'other-org',
      roomCount: 1,
    });
    expect(denied).toBeNull();
  });

  it('rejects negative departure room counts at the PATCH API boundary', async () => {
    const app = express();
    app.use(express.json());
    const mod = await import('../routes/departures');
    app.use('/api', mod.default);

    const res = await request(app)
      .patch(`/api/departures/${DEPARTURE}/accommodation-allotments/allocation-1`)
      .send({ roomCount: -1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
