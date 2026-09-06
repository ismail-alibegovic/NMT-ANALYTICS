import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const TEST_ORG = '11111111-1111-4111-8111-111111111111';
const BUS_DEPARTURE = '22222222-2222-4222-8222-222222222222';
const BUS_DEPARTURE_NO_VEHICLE = '22222222-2222-4222-8222-222222222299';
const FLIGHT_DEPARTURE = '22222222-2222-4222-8222-222222222223';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

const defaultRpcResult = {
  data: [{ cleared_count: 0, inserted_count: 2, error_detail: null as string | null }],
  error: null as string | null,
};

const rpcMock = vi.fn(async (_fn: string, _args: Record<string, any>) => defaultRpcResult);

let departures: any[] = [];
let vehicles: any[] = [];
let seats: any[] = [];
let passengers: any[] = [];
let groups: any[] = [];
let groupMembers: any[] = [];
let seatingRouter: any;

function matches(row: any, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) =>
    Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
  );
}
function filterRows(src: any[], filters: Record<string, any>, inFilters: Record<string, any>) {
  return src.filter((row) => {
    if (!matches(row, filters)) return false;
    return Object.entries(inFilters).every(([key, values]) => (values as any[]).includes(row[key]));
  });
}
function buildQuery(table: string) {
  const _filters: Record<string, any> = {};
  const _inFilters: Record<string, any> = {};
  const query: any = {
    select() { return query; },
    eq(col: string, val: any) { _filters[col] = val; return query; },
    in(col: string, vals: any[]) { _inFilters[col] = vals; return query; },
    order() { return query; },
    async maybeSingle() {
      const src = sourceFor(table);
      const rows = filterRows(src, _filters, _inFilters);
      return { data: rows[0] ?? null, error: null };
    },
    then(resolve: any) {
      const src = sourceFor(table);
      const rows = filterRows(src, _filters, _inFilters);
      resolve({ data: rows, error: null });
    },
    async *[Symbol.asyncIterator]() {
      const src = sourceFor(table);
      yield* filterRows(src, _filters, _inFilters);
    },
  };
  return query;
}
function sourceFor(t: string) {
  if (t === 'departures') return departures;
  if (t === 'departure_vehicle_assignments') return vehicles;
  if (t === 'departure_vehicle_seats') return seats;
  if (t === 'departure_passengers') return passengers;
  if (t === 'trip_passenger_groups') return groups;
  if (t === 'trip_passenger_group_members') return groupMembers;
  return [];
}
function createApp(router: any) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err?.message ?? 'error' });
  });
  return app;
}

beforeEach(async () => {
  departures = [
    { id: BUS_DEPARTURE, org_id: TEST_ORG, transport_type: 'bus', capacity: 4 },
    { id: BUS_DEPARTURE_NO_VEHICLE, org_id: TEST_ORG, transport_type: 'bus', capacity: 4 },
    { id: FLIGHT_DEPARTURE, org_id: TEST_ORG, transport_type: 'flight', capacity: 6 },
  ];
  vehicles = [
    { id: VEHICLE_ID, org_id: TEST_ORG, departure_id: BUS_DEPARTURE, vehicle_label: 'Bus 10000000', registration_number: null, capacity: 4 },
  ];
  seats = [
    { id: 's1', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 1, seat_label: '1A', row_number: 1, column_index: 0, side: 'left', is_active: true },
    { id: 's2', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 2, seat_label: '1B', row_number: 1, column_index: 1, side: 'right', is_active: true },
    { id: 's3', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 3, seat_label: '2A', row_number: 2, column_index: 0, side: 'left', is_active: true },
    { id: 's4', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 4, seat_label: '2B', row_number: 2, column_index: 1, side: 'right', is_active: true },
  ];
  passengers = [
    { id: '30000000-0000-4000-8000-000000000001', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Manual User', seat_number: 1, seat_is_manual: true, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000002', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Locked User', seat_number: 2, seat_is_manual: false, seat_locked: true },
    { id: '30000000-0000-4000-8000-000000000003', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 1', seat_number: null, seat_is_manual: false, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000004', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 2', seat_number: null, seat_is_manual: false, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000099', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Solo', seat_number: null, seat_is_manual: false, seat_locked: false },
  ];
  groups = [
    { id: 'g1', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, name: 'Family', seating_preference: 'keep_together' },
  ];
  groupMembers = [
    { group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000003' },
    { group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000004' },
  ];

  vi.resetModules();
  const seatsModule = await import('../routes/seats');
  seatingRouter = seatsModule.default;

  rpcMock.mockReset();
  rpcMock.mockResolvedValue(defaultRpcResult);
});

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => buildQuery(table)),
    rpc: (fn: string, args: Record<string, any>) => rpcMock(fn, args),
  },
  supabase: {},
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));
vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => { req.orgId = TEST_ORG; next(); },
}));
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => next(),
}));
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
  hasAccess: () => true,
  can: () => true,
}));

describe('M12.2 atomic seating proposal apply', () => {
  async function getProposal() {
    const app = createApp(seatingRouter);
    return request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send();
  }

  it('applies a valid proposal', async () => {
    const proposalRes = await getProposal();
    expect(proposalRes.status).toBe(200);
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.appliedCount).toBe(2);
  });

  it('preserves manual assignment on apply', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    const manualInProposed = proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000001');
    expect(manualInProposed).toBeUndefined();
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(200);
  });

  it('preserves locked assignment on apply', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    const lockedInProposed = proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000002');
    expect(lockedInProposed).toBeUndefined();
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(200);
  });

  it('rejects stale fingerprint', async () => {
    const proposalRes = await getProposal();
    const { proposedAssignments } = proposalRes.body;
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint: 'stale_fingerprint_12345678', proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('rejects tampered client proposal', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    const tampered = [...proposedAssignments];
    if (tampered.length >= 2) {
      const first = { ...tampered[0] };
      const second = { ...tampered[1] };
      first.seatId = second.seatId;
      tampered[0] = first;
    }
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments: tampered });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('rejects seat conflict atomically', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    rpcMock.mockResolvedValue({
      data: [{ cleared_count: 0, inserted_count: 0, error_detail: 'SEAT_CONFLICT: Seat 3 is already occupied' }],
      error: null,
    });
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('rejects inactive/nonexistent seat', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    rpcMock.mockResolvedValue({
      data: [{ cleared_count: 0, inserted_count: 0, error_detail: 'SEAT_NOT_FOUND: Seat no longer exists' }],
      error: null,
    });
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('rejects duplicate proposed seat', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    rpcMock.mockResolvedValue({
      data: [{ cleared_count: 0, inserted_count: 0, error_detail: 'DUPLICATE_SEAT: Seat 3 assigned to multiple passengers' }],
      error: null,
    });
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('rejects non-BUS departure', async () => {
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${FLIGHT_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint: 'abc', proposedAssignments: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_BUS_DEPARTURE');
  });

  it('rejects cross-departure passenger on apply', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    rpcMock.mockResolvedValue({
      data: [{ cleared_count: 0, inserted_count: 0, error_detail: 'PASSENGER_NOT_FOUND: Passenger does not belong to this departure' }],
      error: null,
    });
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('leaves all seat assignments unchanged on failed apply', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    rpcMock.mockResolvedValue({
      data: [{ cleared_count: 0, inserted_count: 0, error_detail: 'SEAT_CONFLICT: Atomic apply failed' }],
      error: null,
    });
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STALE_PROPOSAL');
  });

  it('persists proposed automatic assignments', async () => {
    const proposalRes = await getProposal();
    const { stateFingerprint, proposedAssignments } = proposalRes.body;
    for (const a of proposedAssignments) {
      expect(a.passengerId).not.toBe('30000000-0000-4000-8000-000000000001');
      expect(a.passengerId).not.toBe('30000000-0000-4000-8000-000000000002');
    }
    const app = createApp(seatingRouter);
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/apply`)
      .set('x-test-org', TEST_ORG)
      .send({ stateFingerprint, proposedAssignments });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
  });
});
