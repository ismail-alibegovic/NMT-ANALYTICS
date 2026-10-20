import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  failure: false, persisted: 'in_progress',
  writes: [] as Array<{ payload: any; filters: Array<[string, unknown]> }>,
  rpcCalls: [] as Array<{ name: string; args: any }>,
  releaseError: false,
}));
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
  let payload: any;
  const filters: Array<[string, unknown]> = [];
  for (const method of ['select', 'insert', 'order', 'limit', 'or', 'in', 'not']) query[method] = () => query;
  query.eq = (key: string, value: unknown) => { filters.push([key, value]); return query; };
  query.update = (value: any) => { payload = value; return query; };
  query.maybeSingle = async () => ({ data: null, error: null });
  query.single = async () => ({
    data: table === 'reservations' ? { id: reservationId, total_amount: 180, currency: 'BAM' } : null,
    error: null,
  });
  query.then = (resolve: any) => {
    let error: { message: string } | null = null;
    if (table === 'reservations' && payload) {
      state.writes.push({ payload, filters: [...filters] });
      if (state.failure && payload.creation_state === 'completed') error = { message: 'completion unavailable' };
      else if (payload.creation_state) state.persisted = payload.creation_state;
    }
    return Promise.resolve({ data: [], error }).then(resolve);
  };
  return query;
}
let app: express.Express;
beforeAll(async () => {
  const routes = await import('../routes/reservations');
  app = express(); app.use(express.json()); app.use('/api', routes.default);
});
beforeEach(() => { state.failure = false; state.persisted = 'in_progress'; state.writes = []; });
const body = {
  customerName: 'Synthetic Completion', customerPhone: '000', partySize: 1,
  reservationAt: '2043-01-01T10:00:00Z', status: 'pending', totalAmount: 180,
};
describe('persisted reservation completion', () => {
  it.each([false, true])('finalizes before success with retry header %s', async keyed => {
    let pending = request(app).post('/api/reservations');
    if (keyed) pending = pending.set('Idempotency-Key', 'synthetic-completion');
    const response = await pending.send(body);
    expect(response.status).toBe(201);
    expect(response.body.creationState).toBe('completed');
    expect(state.persisted).toBe('completed');
    expect(state.writes).toContainEqual({
      payload: { creation_state: 'completed', creation_error_stage: null },
      filters: [['id', reservationId], ['org_id', 'org-1']],
    });
  });
  it('retains recovery state instead of reporting success when an unkeyed completion fails', async () => {
    state.failure = true;
    const response = await request(app).post('/api/reservations').send(body);
    expect(response.status).toBe(500);
    expect(state.persisted).toBe('recovery_required');
    expect(state.writes[state.writes.length - 1]).toEqual({
      payload: { creation_state: 'recovery_required', creation_error_stage: 'completion' },
      filters: [['id', reservationId], ['org_id', 'org-1']],
    });
  });
});
