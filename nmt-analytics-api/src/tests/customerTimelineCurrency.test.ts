import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  fail: '',
  queries: [] as { table: string; columns: string; filters: Record<string, unknown> }[],
  reservations: [
    { id: 'reservation-a', org_id: 'org-a', customer_id: 'customer-a', status: 'confirmed', total_amount: 200, paid_amount: 100, currency: 'EUR', created_at: '2041-04-23T12:00:00Z' },
    { id: 'reservation-b', org_id: 'org-b', customer_id: 'customer-a', status: 'confirmed', total_amount: 999, paid_amount: 999, currency: 'BAM', created_at: '2041-04-23T12:00:00Z' },
  ],
}));
vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (req: any, _res: any, next: any) => { req.user = { id: 'synthetic', role: 'agent' }; next(); } }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (req: any, _res: any, next: any) => { req.orgId = req.headers['x-test-org'] || 'org-a'; next(); } }));
vi.mock('../middleware/requireRole', () => ({ requireMinimumRole: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../middleware/auditLogger', () => ({
  auditCustomerCreate: (_req: any, _res: any, next: any) => next(),
  auditCustomerUpdate: (_req: any, _res: any, next: any) => next(),
  auditCustomerDelete: (_req: any, _res: any, next: any) => next(),
  logAuditEntry: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  handleSupabaseError: (res: any, _error: unknown, message: string) => res.status(500).json({ message, code: 'DATABASE_ERROR' }),
  supabaseAdmin: { from: (table: string) => {
    const query = { table, columns: '', filters: {} as Record<string, unknown> };
    state.queries.push(query);
    const chain: any = {
      select: (columns: string) => { query.columns = columns; return chain; },
      eq: (column: string, value: unknown) => { query.filters[column] = value; return chain; },
      order: () => chain, limit: () => chain,
      then: (resolve: any) => {
        const rows = table === 'reservations' ? state.reservations : [];
        const matching = rows.filter(row => Object.entries(query.filters).every(([key, value]) => (row as any)[key] === value));
        return Promise.resolve({ data: matching, error: state.fail === table ? { code: 'XX000', message: 'private database diagnostic' } : null }).then(resolve);
      },
    };
    return chain;
  } },
}));
let app: express.Express;
beforeAll(async () => { app = express(); app.use('/api', (await import('../routes/customers')).default); });
beforeEach(() => { state.fail = ''; state.queries = []; });

it.each([['org-a', 'EUR', 200], ['org-b', 'BAM', 999]] as const)('timeline keeps source currency and tenant scope for %s', async (org, currency, amount) => {
  const response = await request(app).get('/api/customers/customer-a/timeline').set('x-test-org', org);
  expect(response.status).toBe(200);
  expect(response.body).toHaveLength(1);
  expect(response.body[0].details).toMatchObject({ currency, totalAmount: amount });
  expect(state.queries).toHaveLength(2);
  for (const query of state.queries) expect(query.filters.org_id).toBe(org);
  const reservations = state.queries.find(query => query.table === 'reservations')!;
  expect(reservations.filters.customer_id).toBe('customer-a');
  expect(reservations.columns.split(/,\s*/)).toContain('currency');
});
it('does not return records for a different customer', async () => {
  const response = await request(app).get('/api/customers/customer-elsewhere/timeline');
  expect(response.status).toBe(200); expect(response.body).toEqual([]);
});
it.each(['audit_logs', 'reservations'])('fails closed on %s read failure instead of showing an empty timeline', async table => {
  state.fail = table;
  const response = await request(app).get('/api/customers/customer-a/timeline');
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain('private database diagnostic');
});
