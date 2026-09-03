import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const DEPARTURE = '33333333-3333-4333-8333-333333333333';

let currentOrgId = ORG;

const FINGERPRINT = 'deadbeef12345678';

let applyRpcResult: { data: any; error: any } | null = null;
const applyRpcSpy = vi.fn();

const rpcMock = vi.fn(async (fn: string, _args: Record<string, any>) => {
  if (fn === 'apply_rooming_proposal_atomic') {
    applyRpcSpy(_args);
    return applyRpcResult ?? { data: [{ deleted_count: 0, inserted_count: 1, error_detail: null }], error: null };
  }
  return { data: null, error: null };
});

let departures: any[] = [];
let roomSlots: any[] = [];
let passengers: any[] = [];
let requirements: any[] = [];
let groups: any[] = [];

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

vi.mock('../services/roomingProposal', () => ({
  generateRoomingProposal: () => ({
    departureId: DEPARTURE,
    stateFingerprint: FINGERPRINT,
    summary: { totalPassengers: 0, fixedManualLocked: 0, proposedNew: 0, unresolved: 0 },
    fixedAssignments: [],
    replaceableAssignmentIds: [],
    proposedAssignments: [],
    unresolved: [],
    warnings: [],
  }),
}));

async function getRouter() {
  const { default: router } = await import('../routes/rooming');
  return router;
}

beforeEach(() => {
  currentOrgId = ORG;
  rpcMock.mockClear();
  applyRpcSpy.mockClear();
  applyRpcResult = null;
  mutations.length = 0;
  departures = [{ id: DEPARTURE, org_id: ORG }];
  roomSlots = [];
  passengers = [];
  requirements = [];
  groups = [];
});

describe('POST /departures/:departureId/rooming/apply', () => {
  function validBody() {
    return {
      stateFingerprint: FINGERPRINT,
      replaceableAssignmentIds: ['ra-1'],
      proposedAssignments: [{ passengerId: 'p1', slotId: 'slot-1' }],
    };
  }

  it('applies atomically when the fingerprint matches', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.insertedCount).toBe(1);
    expect(applyRpcSpy).toHaveBeenCalledTimes(1);
    expect(applyRpcSpy.mock.calls[0][0]).toMatchObject({
      p_org_id: ORG,
      p_departure_id: DEPARTURE,
      p_replaceable_assignment_ids: ['ra-1'],
    });
  });

  it('returns 409 STALE_PROPOSAL with zero writes when the fingerprint differs', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app)
      .post(`/departures/${DEPARTURE}/rooming/apply`)
      .send({ ...validBody(), stateFingerprint: 'stale-fingerprint' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
    expect(applyRpcSpy).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing or cross-org departure', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    currentOrgId = OTHER_ORG;
    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(404);
    expect(applyRpcSpy).not.toHaveBeenCalled();
  });

  it('maps ROOM_ASSIGNMENT_LOCKED to 409 STALE_PROPOSAL (race protection)', async () => {
    applyRpcResult = { data: [{ deleted_count: 0, inserted_count: 0, error_detail: 'ROOM_ASSIGNMENT_LOCKED' }], error: null };
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('maps capacity conflict (NO_COMPATIBLE_ROOM_CAPACITY) to 409 with zero partial writes', async () => {
    applyRpcResult = { data: [{ deleted_count: 0, inserted_count: 0, error_detail: 'NO_COMPATIBLE_ROOM_CAPACITY (slot x, capacity 1, occupied 1)' }], error: null };
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('maps requirement mismatch to 409', async () => {
    applyRpcResult = { data: [{ deleted_count: 0, inserted_count: 0, error_detail: 'REQUIREMENT_MISMATCH (pax p1, slot slot-1)' }], error: null };
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('maps duplicate passenger to 409', async () => {
    applyRpcResult = { data: [{ deleted_count: 0, inserted_count: 0, error_detail: 'DUPLICATE_PASSENGER (p1)' }], error: null };
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app).post(`/departures/${DEPARTURE}/rooming/apply`).send(validBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('requires stateFingerprint', async () => {
    const app = express();
    app.use(express.json());
    app.use(await getRouter());

    const res = await request(app)
      .post(`/departures/${DEPARTURE}/rooming/apply`)
      .send({ replaceableAssignmentIds: [], proposedAssignments: [] });

    expect(res.status).toBe(400);
    expect(applyRpcSpy).not.toHaveBeenCalled();
  });
});
