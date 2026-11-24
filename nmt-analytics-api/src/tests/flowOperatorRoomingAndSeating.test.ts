import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const DEPARTURE_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT_ID = '44444444-4444-4444-8444-444444444444';
const PASSENGER_ID = '55555555-5555-4555-8555-555555555555';

const state = {
  roomingProposal: {
    departureId: DEPARTURE_ID,
    stateFingerprint: 'room-fp-1',
    summary: { totalPassengers: 1, fixedManualLocked: 0, proposedNew: 1, unresolved: 0 },
    fixedAssignments: [],
    replaceableAssignmentIds: [],
    proposedAssignments: [{ passengerId: PASSENGER_ID, slotId: 'slot-1', slotLabel: 'Double 01' }],
    unresolved: [],
    warnings: [],
  },
  seatingProposal: {
    departureId: DEPARTURE_ID,
    stateFingerprint: 'seat-fp-1',
    summary: { totalPassengers: 1, fixedManualLocked: 0, proposedNew: 1, unresolved: 0 },
    fixedAssignments: [],
    proposedAssignments: [{ passengerId: PASSENGER_ID, seatId: 'seat-1', seatNumber: 1, seatLabel: '1A', passengerName: 'Synthetic Pax' }],
    unresolved: [],
    warnings: [],
  },
  roomAssignment: {
    id: ASSIGNMENT_ID,
    org_id: ORG,
    departure_id: DEPARTURE_ID,
    passenger_id: PASSENGER_ID,
    room_slot_id: 'slot-1',
    locked: false,
  } as any,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcOverrides: new Map<string, { data: any; error: any }>(),
  seenOrgFilters: [] as Array<{ table: string; op: string; col: string; val: unknown }>,
};

function makeBuilder(table: string) {
  const ctx: { action: string; filters: Record<string, unknown>; payload: any } = {
    action: 'select',
    filters: {},
    payload: undefined,
  };
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn((col: string, val: unknown) => {
      ctx.filters[col] = val;
      if (col === 'org_id') state.seenOrgFilters.push({ table, op: ctx.action, col, val });
      return b;
    }),
    update: vi.fn((payload: any) => {
      ctx.action = 'update';
      ctx.payload = payload;
      return b;
    }),
    delete: vi.fn(() => {
      ctx.action = 'delete';
      return b;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === 'departure_room_slot_assignments') {
        const matchesOrg = !ctx.filters.org_id || ctx.filters.org_id === state.roomAssignment.org_id;
        const matchesId = !ctx.filters.id || ctx.filters.id === state.roomAssignment.id;
        if (!matchesOrg || !matchesId) return { data: null, error: null };
        if (ctx.action === 'update') {
          state.roomAssignment = { ...state.roomAssignment, ...ctx.payload };
        }
        return { data: { ...state.roomAssignment }, error: null };
      }
      return { data: null, error: null };
    }),
    then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return b;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (state.rpcOverrides.has(fn)) return state.rpcOverrides.get(fn)!;
      return { data: [{ deleted_count: 0, inserted_count: 1, updated_count: 1, error_detail: null }], error: null };
    }),
  },
  handleSupabaseError: (res: any, _err: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.sendStatus(401);
    req.user = { id: 'actor-1', role, email: 'synthetic@test.invalid' };
    req.orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/roomingStateLoader', () => ({
  loadRoomingState: vi.fn(async () => ({ state: { input: { departureId: DEPARTURE_ID } }, error: null })),
}));

vi.mock('../services/roomingProposal', () => ({
  generateRoomingProposal: vi.fn(() => ({ ...state.roomingProposal })),
}));

vi.mock('../services/seatingStateLoader', () => ({
  loadSeatingState: vi.fn(async () => ({ state: { input: { departureId: DEPARTURE_ID } }, error: null })),
}));

vi.mock('../services/seatingProposal', () => ({
  generateSeatingProposal: vi.fn(() => ({ ...state.seatingProposal })),
}));

let app: Express;

beforeEach(async () => {
  if (!app) {
    app = express();
    app.use(express.json());
    app.use('/api', (await import('../routes/rooming')).default);
    app.use('/api', (await import('../routes/seats')).default);
    app.use('/api', (await import('../routes/accommodation')).default);
    app.use('/api', (await import('../routes/departurePassengers')).default);
  }
  state.rpcCalls = [];
  state.rpcOverrides.clear();
  state.seenOrgFilters = [];
  state.roomAssignment = {
    id: ASSIGNMENT_ID,
    org_id: ORG,
    departure_id: DEPARTURE_ID,
    passenger_id: PASSENGER_ID,
    room_slot_id: 'slot-1',
    locked: false,
  };
});

describe('FLOW-01 operator rooming & seating contracts', () => {
  it('rejects stale rooming proposal before touching atomic RPC', async () => {
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-role', 'manager')
      .send({
        stateFingerprint: 'stale-fp',
        replaceableAssignmentIds: [],
        proposedAssignments: [{ passengerId: PASSENGER_ID, roomSlotId: 'slot-1' }],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('locks/unlocks room assignment scoped to org_id and blocks mutations while locked', async () => {
    const lockRes = await request(app)
      .patch(`/api/room-slot-assignments/${ASSIGNMENT_ID}/lock`)
      .set('x-test-role', 'manager')
      .send({ locked: true });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.locked).toBe(true);
    expect(state.seenOrgFilters).toContainEqual({
      table: 'departure_room_slot_assignments',
      op: 'update',
      col: 'org_id',
      val: ORG,
    });

    const delRes = await request(app)
      .delete(`/api/room-slot-assignments/${ASSIGNMENT_ID}`)
      .set('x-test-role', 'manager');
    expect(delRes.status).toBe(409);
    expect(delRes.body.code).toBe('ROOM_ASSIGNMENT_LOCKED');

    const moveRes = await request(app)
      .post(`/api/room-slot-assignments/${ASSIGNMENT_ID}/move`)
      .set('x-test-role', 'manager')
      .send({ targetSlotId: '66666666-6666-4666-8666-666666666666' });
    expect(moveRes.status).toBe(409);
    expect(moveRes.body.code).toBe('ROOM_ASSIGNMENT_LOCKED');

    // Tenant boundary: another org cannot see or mutate ORG's assignment
    state.roomAssignment.org_id = OTHER_ORG;
    const crossTenantLock = await request(app)
      .patch(`/api/room-slot-assignments/${ASSIGNMENT_ID}/lock`)
      .set('x-test-role', 'manager')
      .send({ locked: false });
    expect(crossTenantLock.status).toBe(404);
  });

  it('enforces legacy auto-seating gates and manager role boundary', async () => {
    for (const path of [
      '/api/seats/auto-assign',
      '/api/seats/group-auto-assign/group-1',
      '/api/seats/clear-all',
    ]) {
      const agentRes = await request(app).post(path).set('x-test-role', 'agent').send({});
      expect(agentRes.status).toBe(403);
      expect(agentRes.body.code).toBe('INSUFFICIENT_PERMISSIONS');

      const managerRes = await request(app).post(path).set('x-test-role', 'manager').send({});
      expect(managerRes.status).toBe(409);
      expect(managerRes.body.code).toBe('AUTO_SEATING_NOT_AVAILABLE');
    }
  });

  it('rejects stale seating proposal and propagates SEAT_LOCKED / seat-lock RPC contracts', async () => {
    const staleSeatRes = await request(app)
      .post(`/api/departures/${DEPARTURE_ID}/seating/apply`)
      .set('x-test-role', 'manager')
      .send({
        stateFingerprint: 'outdated-seat-fp',
        proposedAssignments: [{ passengerId: PASSENGER_ID, seatId: 'seat-1' }],
      });

    expect(staleSeatRes.status).toBe(409);
    expect(staleSeatRes.body.code).toBe('STALE_PROPOSAL');
    expect(state.rpcCalls).toHaveLength(0);

    state.rpcOverrides.set('manual_seat_assign', {
      data: null,
      error: { message: 'SEAT_LOCKED: Unlock seat first' },
    });
    const lockedSeatRes = await request(app)
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-role', 'manager')
      .send({ seatNumber: 4 });

    expect(lockedSeatRes.status).toBe(409);
    expect(lockedSeatRes.body.code).toBe('SEAT_LOCKED');

    const lockSeatRes = await request(app)
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat-lock`)
      .set('x-test-role', 'manager')
      .send({ locked: true });
    expect(lockSeatRes.status).toBe(200);
    expect(state.rpcCalls).toContainEqual({
      fn: 'manual_seat_lock',
      args: { p_org_id: ORG, p_passenger_id: PASSENGER_ID, p_locked: true },
    });
  });
});
