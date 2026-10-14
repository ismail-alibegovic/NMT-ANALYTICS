import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { saleRequestFingerprint } from '../lib/saleIdempotency';

const state = vi.hoisted(() => ({
  lookups: 0, fingerprint: '', matching: true, customerError: false,
  thrownInsert: false, releaseError: false,
  insertError: { code: '23505', message: 'duplicate key' },
  rpcCalls: [] as Array<{ name: string; args: any }>,
}));
const departureId = '11111111-1111-4111-8111-111111111111';
const reservationId = '22222222-2222-4222-8222-222222222222';

vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (req: any, _res: any, next: any) => { req.user = { id: 'user-1', role: 'agent' }; next(); } }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (req: any, _res: any, next: any) => { req.orgId = 'org-1'; next(); } }));
vi.mock('../middleware/requireRole', () => ({ requireMinimumRole: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: any, _res: any, next: any) => next(),
  auditReservationUpdate: (_req: any, _res: any, next: any) => next(),
  auditReservationDelete: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../lib/audit', () => ({ logAction: vi.fn() }));
vi.mock('../lib/notificationService', () => ({ notifyNewReservation: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: any) => {
      state.rpcCalls.push({ name, args });
      return { data: [], error: name === 'release_capacity_atomic' && state.releaseError ? { message: 'release unavailable' } : null };
    },
  },
  handleSupabaseError: (res: any, error: any) => res.status(500).json({ error }),
}));

function builder(table: string) {
  const query: any = {};
  for (const method of ['select', 'eq', 'or', 'limit', 'insert', 'update', 'delete', 'in', 'not', 'order']) query[method] = () => query;
  query.maybeSingle = async () => {
    if (table === 'reservations') {
      state.lookups += 1;
      return { data: state.lookups === 1 ? null : {
        id: reservationId, org_id: 'org-1', status: 'pending', creation_state: 'completed',
        creation_fingerprint: state.matching ? state.fingerprint : 'different-request',
      }, error: null };
    }
    return { data: null, error: null };
  };
  query.single = async () => {
    if (table === 'departures') return { data: { id: departureId, package_id: 'package-1', packages: { currency: 'BAM' } }, error: null };
    if (table === 'customers') return { data: null, error: state.customerError ? { code: '23514', message: 'customer rejected' } : null };
    if (table === 'reservations') {
      if (state.thrownInsert) throw new Error('insert transport failed');
      return { data: null, error: state.insertError };
    }
    return { data: null, error: null };
  };
  query.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
  return query;
}

let app: express.Express;
let parse: (body: any) => any;
const body = { departureId, customerName: 'Capacity Pilot', customerPhone: '+38761000005', partySize: 1, reservationAt: '2027-03-01T10:00:00.000Z', status: 'pending', totalAmount: 180 };
beforeAll(async () => {
  const routes = await import('../routes/reservations');
  parse = value => routes.createReservationSchema.parse(value);
  app = express(); app.use(express.json()); app.use('/api', routes.default);
});
beforeEach(() => {
  state.lookups = 0; state.matching = true; state.customerError = false;
  state.thrownInsert = false; state.releaseError = false;
  state.insertError = { code: '23505', message: 'duplicate key' }; state.rpcCalls = [];
});
async function create(overrides = {}) {
  const payload = { ...body, ...overrides };
  state.fingerprint = saleRequestFingerprint(parse(payload));
  return request(app).post('/api/reservations').set('Idempotency-Key', 'capacity-cleanup-retry').send(payload);
}
function expectHoldReleasedOnce() {
  expect(state.rpcCalls).toEqual([
    { name: 'reserve_capacity_atomic', args: { p_departure_id: departureId, p_org_id: 'org-1', p_party_size: 1 } },
    { name: 'release_capacity_atomic', args: { p_departure_id: departureId, p_org_id: 'org-1', p_party_size: 1 } },
  ]);
}

describe('temporary sale capacity cleanup', () => {
  it('releases the losing request hold before returning the existing sale', async () => {
    const res = await create(); expect(res.status).toBe(200);
    expect(res.body.id).toBe(reservationId); expectHoldReleasedOnce();
  });
  it('releases a hold when the concurrent key belongs to a different payload', async () => {
    state.matching = false; const res = await create();
    expect(res.status).toBe(409); expectHoldReleasedOnce();
  });
  it('releases the hold if customer upsert fails before reservation insertion', async () => {
    state.customerError = true; const res = await create({ upsert: true });
    expect(res.status).toBe(500); expectHoldReleasedOnce(); expect(state.lookups).toBe(1);
  });
  it('releases the hold on a thrown insert transport error', async () => {
    state.thrownInsert = true; const res = await create();
    expect(res.status).toBe(500); expectHoldReleasedOnce();
  });
  it('does not report retry success when release fails and never releases twice', async () => {
    state.releaseError = true; const res = await create();
    expect(res.status).toBe(500); expect(state.lookups).toBe(1); expectHoldReleasedOnce();
  });
  it('does not release capacity that a cancelled creation never acquired', async () => {
    state.insertError = { code: '23503', message: 'invalid reference' };
    const res = await create({ status: 'cancelled' });
    expect(res.status).toBe(500); expect(state.rpcCalls).toEqual([]);
  });
});
