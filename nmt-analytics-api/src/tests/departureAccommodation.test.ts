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
let packages: any[] = [];
let reservations: any[] = [];
let reservationAccommodationRequirements: any[] = [];
let failHotelAllocationInsert = false;
const rpcMock = vi.fn(async (_fn: string, _args: Record<string, any>) => ({ data: null, error: null }));

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
    notFilters: {},
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
    neq: vi.fn((column: string, value: any) => {
      state.notFilters[column] = value;
      return builder;
    }),
    in: vi.fn((column: string, values: any[]) => {
      state.filters[column] = values;
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
    upsert: vi.fn((payload: any) => {
      state.action = 'upsert';
      state.payload = payload;
      return builder;
    }),
    update: vi.fn((payload: any) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      state.action = 'delete';
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
    const applyFilters = (rows: any[]) => rows.filter((row) => (
      Object.entries(state.filters).every(([key, value]) => {
        if (key === 'reservations.status') {
          const reservation = reservations.find((item) => item.id === row.reservation_id);
          return Array.isArray(value) ? value.includes(reservation?.status) : reservation?.status === value;
        }
        return Array.isArray(value) ? value.includes(row[key]) : row[key] === value;
      }) &&
      Object.entries(state.notFilters).every(([key, value]) => row[key] !== value)
    ));

    if (table === 'packages') {
      let rows = applyFilters(packages);
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    if (table === 'departures') {
      if (state.action === 'upsert') {
        const existingIndex = departures.findIndex((row) =>
          row.org_id === state.payload.org_id &&
          row.package_id === state.payload.package_id &&
          row.depart_at === state.payload.depart_at
        );
        const row = existingIndex >= 0
          ? { ...departures[existingIndex], ...clone(state.payload) }
          : { id: DEPARTURE, created_at: '2026-08-30T12:00:00.000Z', ...clone(state.payload) };
        if (existingIndex >= 0) departures[existingIndex] = row;
        else departures.push(row);
        return { data: [clone(row)], error: null };
      }

      if (state.action === 'delete') {
        departures = departures.filter((row) => !matches(row, state.filters));
        return { data: null, error: null };
      }

      if (state.action === 'update') {
        departures = departures.map((row) => (
          matches(row, state.filters) ? { ...row, ...clone(state.payload) } : row
        ));
        return { data: clone(departures.filter((row) => matches(row, state.filters))), error: null };
      }

      let rows = applyFilters(departures);
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    if (table === 'package_hotels') {
      let rows = applyFilters(packageHotels);
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    if (table === 'hotel_allocations') {
      if (state.action === 'insert') {
        if (failHotelAllocationInsert) {
          return { data: null, error: { message: 'insert failed' } };
        }
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
          applyFilters([row]).length > 0 ? { ...row, ...clone(state.payload) } : row
        ));
      }

      let rows = applyFilters(hotelAllocations);
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      if (state.selectColumns.includes('hotels:')) rows = rows.map(withHotel);
      return { data: clone(rows), error: null };
    }

    if (table === 'reservation_accommodation_requirements') {
      let rows = applyFilters(reservationAccommodationRequirements);
      if (state.limitCount != null) rows = rows.slice(0, state.limitCount);
      return { data: clone(rows), error: null };
    }

    throw new Error(`Unhandled table ${table}`);
  }

  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
    rpc: (fn: string, args: Record<string, any>) => rpcMock(fn, args),
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
  failHotelAllocationInsert = false;
  packages = [{ id: PACKAGE, org_id: ORG, name: 'Package', destination: 'Istanbul', transport_type: 'bus' }];
  departures = [{ id: DEPARTURE, org_id: ORG, package_id: PACKAGE }];
  reservations = [];
  reservationAccommodationRequirements = [];
  rpcMock.mockClear();
  rpcMock.mockResolvedValue({ data: null, error: null });
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
    expect(rpcMock).toHaveBeenCalledWith('sync_departure_room_slots_atomic', {
      p_org_id: ORG,
      p_departure_id: DEPARTURE,
      p_hotel_allocation_id: null,
    });
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
    expect(updated?.allocated).toBe(0);
    expect(updated?.available).toBe(18);
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

  it('uses sold reservation requirements as allocated room count and rejects reducing below sold rooms', async () => {
    const { updateDepartureAccommodationAllotment } = await import('../lib/departureAccommodation');
    hotelAllocations = [
      { id: 'same-org', org_id: ORG, departure_id: DEPARTURE, hotel_id: HOTEL, room_type: 'double', room_label: 'Double', rooms_reserved: 20, template_rooms: 20, capacity_per_room: 2, check_in: '2026-09-10', check_out: '2026-09-17', net_price: 80, sell_price: 110 },
    ];
    reservations = [
      { id: 'reservation-1', org_id: ORG, status: 'confirmed' },
      { id: 'reservation-2', org_id: ORG, status: 'pending' },
      { id: 'reservation-3', org_id: ORG, status: 'cancelled' },
    ];
    reservationAccommodationRequirements = [
      { id: 'requirement-1', org_id: ORG, reservation_id: 'reservation-1', hotel_allocation_id: 'same-org', room_count: 2 },
      { id: 'requirement-2', org_id: ORG, reservation_id: 'reservation-2', hotel_allocation_id: 'same-org', room_count: 1 },
      { id: 'requirement-3', org_id: ORG, reservation_id: 'reservation-3', hotel_allocation_id: 'same-org', room_count: 10 },
    ];

    const updated = await updateDepartureAccommodationAllotment({
      orgId: ORG,
      departureId: DEPARTURE,
      itemId: 'same-org',
      roomCount: 3,
    });

    expect(updated?.allocated).toBe(3);
    expect(updated?.available).toBe(0);
    await expect(updateDepartureAccommodationAllotment({
      orgId: ORG,
      departureId: DEPARTURE,
      itemId: 'same-org',
      roomCount: 2,
    })).rejects.toMatchObject({ code: 'ALLOTMENT_BELOW_RESERVED' });
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

  it('deletes a newly inserted upsert departure when accommodation materialization fails', async () => {
    departures = [];
    failHotelAllocationInsert = true;
    const app = express();
    app.use(express.json());
    const mod = await import('../routes/departures');
    app.use('/api', mod.default);

    const res = await request(app)
      .post('/api/departures')
      .send({
        packageId: PACKAGE,
        departAt: '2026-09-10T08:00:00.000Z',
        returnAt: '2026-09-17T08:00:00.000Z',
        capacity: 40,
        upsert: true,
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ACCOMMODATION_MATERIALIZATION_FAILED');
    expect(res.body.message).toContain('Departure was not created');
    expect(departures).toHaveLength(0);
  });

  it('preserves an existing upsert departure when accommodation materialization fails', async () => {
    departures = [{
      id: DEPARTURE,
      org_id: ORG,
      package_id: PACKAGE,
      depart_at: '2026-09-10T08:00:00.000Z',
      return_at: '2026-09-17T08:00:00.000Z',
      capacity: 30,
      transport_type: 'bus',
      traveler_requirements: {
        travel_scope: 'international',
        document_type: 'passport',
        require_expiry: true,
      },
    }];
    failHotelAllocationInsert = true;
    const app = express();
    app.use(express.json());
    const mod = await import('../routes/departures');
    app.use('/api', mod.default);

    const res = await request(app)
      .post('/api/departures')
      .send({
        packageId: PACKAGE,
        departAt: '2026-09-10T08:00:00.000Z',
        returnAt: '2026-09-17T08:00:00.000Z',
        capacity: 40,
        travelerRequirements: {
          travelScope: 'domestic',
          documentType: 'none',
        },
        upsert: true,
      });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ACCOMMODATION_MATERIALIZATION_FAILED');
    expect(res.body.message).toContain('Existing departure was preserved');
    expect(departures).toHaveLength(1);
    expect(departures[0].id).toBe(DEPARTURE);
    expect(departures[0].capacity).toBe(30);
    expect(departures[0].return_at).toBe('2026-09-17T08:00:00.000Z');
    expect(departures[0].traveler_requirements).toEqual({
      travel_scope: 'international',
      document_type: 'passport',
      require_expiry: true,
    });
  });
});
