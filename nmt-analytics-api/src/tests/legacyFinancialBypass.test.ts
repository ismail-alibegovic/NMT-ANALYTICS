import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const RA = '33333333-3333-4333-8333-333333333333';
const RB = '44444444-4444-4444-8444-444444444444';
const TA = '55555555-5555-4555-8555-555555555555';
const TB = '66666666-6666-4666-8666-666666666666';
const h = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as { table: string; filters: [string, unknown][] }[],
  writes: vi.fn(),
  error: null as null | { message: string },
  throws: false,
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const entry = { table, filters: [] as [string, unknown][] };
      h.queries.push(entry);
      const result = () => {
        if (h.throws) throw new Error('lookup failed');
        const rows = (h.rows[table] || []).filter(row => entry.filters.every(([key, value]) => row[key] === value));
        return { data: rows, error: h.error, count: rows.length };
      };
      const mutation = (...args: unknown[]) => { h.writes(...args); throw new Error('Unexpected mutation'); };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { entry.filters.push([key, value]); return query; },
        gte: () => query, lte: () => query, order: () => query, range: () => query,
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data[0] || null }; },
        single: async () => { const r = result(); return { ...r, data: r.data[0] || null }; },
        then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
        insert: mutation, update: mutation, delete: mutation, upsert: mutation,
      };
      return query;
    },
  },
  handleSupabaseError: (res: Response, _error: unknown, message: string) => res.status(500).json({ code: 'DB_ERROR', message }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { id: A, email: 'test@example.com', role: (req.headers['x-test-role'] || 'manager') as any };
    req.orgId = A;
    next();
  },
}));
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationDelete: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import transactions from '../routes/transactions';
import reservations from '../routes/reservations';
const app = express();
app.use(express.json());
app.use('/api', transactions, reservations);
const auth = { Authorization: 'Bearer test' };
const legacy = { amount: 100, currency: 'BAM', type: 'payment', occurredAt: '2026-10-11T00:00:00Z' };

beforeEach(() => {
  h.rows = {
    reservations: [{ id: RA, org_id: A, paid_amount: 100 }, { id: RB, org_id: B, paid_amount: 50 }],
    transactions: [{ id: TA, org_id: A, reservation_id: RA, amount: 100 }, { id: TB, org_id: B, reservation_id: RB, amount: 50 }],
    payments: [{ id: A, org_id: A, reservation_id: RA, amount: 100, status: 'succeeded' }],
  };
  h.queries.length = 0;
  h.writes.mockClear();
  h.error = null;
  h.throws = false;
});

describe('legacy transaction retirement', () => {
  it.each(['reservationId', 'reservation_id'])('scopes POST ownership for %s and does not expose a foreign reservation', async key => {
    const res = await request(app).post('/api/transactions').set(auth).send({ ...legacy, [key]: RB, org_id: B });
    expect(res.status).toBe(404);
    expect(h.queries[0].filters).toEqual([['id', RB], ['org_id', A]]);
    expect(h.writes).not.toHaveBeenCalled();
  });
  it.each(['payment', 'refund', 'PAYMENT', 'income'])('rejects old %s requests and retries without double counting', async type => {
    const before = JSON.stringify(h.rows);
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post('/api/transactions').set(auth).send({ ...legacy, type, reservationId: RA });
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('LEGACY_TRANSACTIONS_READ_ONLY');
    }
    expect(h.writes).not.toHaveBeenCalled();
    expect(JSON.stringify(h.rows)).toBe(before);
  });
  it('rejects unlinked and snake-case legacy payloads', async () => {
    for (const body of [legacy, { ...legacy, reservation_id: RA, occurred_at: legacy.occurredAt }, {}]) {
      expect((await request(app).post('/api/transactions').set(auth).send(body)).status).toBe(410);
    }
    expect(h.writes).not.toHaveBeenCalled();
  });
  it('rejects ambiguous or invalid IDs before querying', async () => {
    for (const body of [{ reservationId: RA, reservation_id: RB }, { reservationId: 'bad' }]) {
      expect((await request(app).post('/api/transactions').set(auth).send(body)).status).toBe(400);
    }
    expect(h.queries).toHaveLength(0);
  });
  it.each(['patch', 'delete'] as const)('%s retains own history and hides foreign/missing history', async method => {
    const before = JSON.stringify(h.rows);
    for (const [id, status] of [[TA, 410], [TB, 404], [RA, 404]] as const) {
      expect((await request(app)[method](`/api/transactions/${id}`).set(auth).send({ amount: 999 })).status).toBe(status);
    }
    expect(h.queries.every(q => q.filters.some(([k, v]) => k === 'org_id' && v === A))).toBe(true);
    expect(h.writes).not.toHaveBeenCalled();
    expect(JSON.stringify(h.rows)).toBe(before);
  });
  it.each(['viewer', 'agent', 'unknown'])('denies %s before any transaction query', async role => {
    for (const [method, url] of [['get', '/api/transactions'], ['post', '/api/transactions'], ['patch', `/api/transactions/${TA}`], ['delete', `/api/transactions/${TA}`]] as const) {
      expect((await request(app)[method](url).set(auth).set('x-test-role', role).send(legacy)).status).toBe(403);
    }
    expect(h.queries).toHaveLength(0);
  });
  it('requires authentication', async () => {
    expect((await request(app).post('/api/transactions').send(legacy)).status).toBe(401);
    expect(h.queries).toHaveLength(0);
  });
  it.each(['manager', 'director', 'super_admin'])('preserves org-scoped historical reads for %s', async role => {
    const res = await request(app).get('/api/transactions').set(auth).set('x-test-role', role);
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual([TA]);
  });
  it.each([false, true])('fails closed for database lookup errors (throw=%s)', async throws => {
    h.error = { message: 'database unavailable' };
    h.throws = throws;
    expect((await request(app).post('/api/transactions').set(auth).send({ ...legacy, reservationId: RA })).status).toBe(500);
    expect((await request(app).patch(`/api/transactions/${TA}`).set(auth).send({})).status).toBe(500);
    expect((await request(app).delete(`/api/transactions/${TA}`).set(auth)).status).toBe(500);
    expect(h.writes).not.toHaveBeenCalled();
  });
});

describe('reservation cached finance inputs', () => {
  it.each(['paidAmount', 'paid_amount', 'balanceDue', 'balance_due', 'paymentStatus', 'payment_status'])('rejects %s on create and patch before any side effects', async field => {
    const value = field.toLowerCase().includes('status') ? 'paid' : 100;
    const create = { customerName: 'Test', customerPhone: '123', partySize: 1, reservationAt: legacy.occurredAt, [field]: value };
    expect((await request(app).post('/api/reservations').set(auth).send(create)).status).toBe(400);
    expect((await request(app).patch(`/api/reservations/${RA}`).set(auth).send({ [field]: value })).status).toBe(400);
    expect(h.queries).toHaveLength(0);
    expect(h.writes).not.toHaveBeenCalled();
  });
  it('denies viewer reservation writes', async () => {
    expect((await request(app).patch(`/api/reservations/${RA}`).set(auth).set('x-test-role', 'viewer').send({ totalAmount: 500 })).status).toBe(403);
    expect((await request(app).post('/api/reservations').set(auth).set('x-test-role', 'viewer').send({})).status).toBe(403);
    expect(h.queries).toHaveLength(0);
  });
});
