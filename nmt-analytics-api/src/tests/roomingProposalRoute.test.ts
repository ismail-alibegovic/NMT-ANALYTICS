import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const DEPARTURE = '33333333-3333-4333-8333-333333333333';

let currentOrgId = ORG;

const rpcMock = vi.fn(async (_fn: string, _args: Record<string, any>) => ({ data: null, error: null }));

// Per-table canned rows returned by the query builder.
let departures: any[] = [];
let roomSlots: any[] = [];
let passengers: any[] = [];
let requirements: any[] = [];
let groups: any[] = [];

// Records mutation actions so the test can prove the endpoint is read-only.
const mutations: string[] = [];

function matches(row: any, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) =>
    Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
  );
}

function createBuilder(table: string) {
  const state: Record<string, any> = { filters: {}, action: 'select', payload: undefined };
  const builder: any = {
    select: vi.fn((_columns?: string) => builder),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    in: vi.fn((column: string, values: any[]) => {
      state.filters[column] = values;
      return builder;
    }),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    }),
    insert: vi.fn((_payload: any) => {
      mutations.push('insert:' + table);
      state.action = 'insert';
      return builder;
    }),
    update: vi.fn((_payload: any) => {
      mutations.push('update:' + table);
      state.action = 'update';
      return builder;
    }),
    delete: vi.fn(() => {
      mutations.push('delete:' + table);
      state.action = 'delete';
      return builder;
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  async function execute() {
    if (table === 'departures') {
      const rows = departures.filter((row) => matches(row, state.filters));
      return { data: rows, error: null };
    }
    if (table === 'departure_room_slots') {
      const rows = roomSlots.filter((row) => matches(row, state.filters));
      return { data: rows, error: null };
    }
    if (table === 'departure_passengers') {
      const rows = passengers.filter((row) => matches(row, state.filters));
      return { data: rows, error: null };
    }
    if (table === 'reservation_accommodation_requirements') {
      const rows = requirements.filter((row) => matches(row, state.filters));
      return { data: rows, error: null };
    }
    if (table === 'trip_passenger_groups') {
      const rows = groups.filter((row) => matches(row, state.filters));
      return { data: rows, error: null };
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

const proposalSpy = vi.fn((input: any) => ({
  departureId: input.departureId,
  stateFingerprint: 'deadbeef12345678',
  summary: { totalPassengers: input.passengers.length, fixedManualLocked: 0, proposedNew: 0, unresolved: 0 },
  fixedAssignments: [],
  replaceableAssignmentIds: [],
  proposedAssignments: [],
  unresolved: [],
  warnings: [],
}));

vi.mock('../services/roomingProposal', () => ({
  generateRoomingProposal: (input: any) => proposalSpy(input),
}));

async function getRouter() {
  const { default: router } = await import('../routes/rooming');
  return router;
}

beforeEach(() => {
  currentOrgId = ORG;
  rpcMock.mockClear();
  rpcMock.mockResolvedValue({ data: null, error: null });
  proposalSpy.mockClear();
  mutations.length = 0;
  departures = [{ id: DEPARTURE, org_id: ORG }];
  roomSlots = [];
  passengers = [];
  requirements = [];
  groups = [];
});

describe('POST /departures/:departureId/rooming/proposal', () => {
  it('returns a proposal for a correct-org departure', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    expect(res.status).toBe(200);
    expect(res.body.stateFingerprint).toBe('deadbeef12345678');
    expect(proposalSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a missing or cross-org departure', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    currentOrgId = OTHER_ORG;
    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    expect(res.status).toBe(404);
    expect(proposalSpy).not.toHaveBeenCalled();
  });

  it('calls the sync RPC before loading proposal slots', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    expect(rpcMock).toHaveBeenCalledWith('sync_departure_room_slots_atomic', {
      p_org_id: ORG,
      p_departure_id: DEPARTURE,
      p_hotel_allocation_id: null,
    });
  });

  it('classifies an unmapped passenger on a reservation WITH accommodation as PASSENGER_REQUIREMENT_UNASSIGNED', async () => {
    const RES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const REQ = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    passengers = [
      { id: 'p1', full_name: 'Unmapped', departure_id: DEPARTURE, org_id: ORG, reservation_id: RES, reservation_accommodation_requirement_id: null },
    ];
    // Reservation has an accommodation requirement, but the passenger has no mapped requirement id.
    requirements = [{ id: REQ, reservation_id: RES, org_id: ORG, hotel_id: 'h1', hotel_allocation_id: 'a1', room_type: 'double' }];

    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    expect(proposalSpy).toHaveBeenCalledTimes(1);
    const input = proposalSpy.mock.calls[0][0];
    const passenger = input.passengers.find((p: any) => p.id === 'p1');
    expect(passenger.reservationHasAccommodation).toBe(true);
    expect(passenger.hotelAllocationId).toBeUndefined();
    expect(passenger.roomType).toBeUndefined();
  });

  it('classifies a passenger on a reservation WITHOUT accommodation as NO_ACCOMMODATION_REQUIREMENT', async () => {
    const RES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    passengers = [
      { id: 'p2', full_name: 'NoAcc', departure_id: DEPARTURE, org_id: ORG, reservation_id: RES, reservation_accommodation_requirement_id: null },
    ];
    requirements = [];

    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    const input = proposalSpy.mock.calls[0][0];
    const passenger = input.passengers.find((p: any) => p.id === 'p2');
    expect(passenger.reservationHasAccommodation).toBe(false);
    expect(passenger.hotelAllocationId).toBeUndefined();
  });

  it('does not perform any insert/update/delete on room slot assignments', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    await request(app).post(`/departures/${DEPARTURE}/rooming/proposal`).send({});

    expect(mutations).toHaveLength(0);
  });
});
