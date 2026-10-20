import { beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h = vi.hoisted(() => ({ calls: [] as unknown[][], error: null as unknown }));
vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../middleware/requireRole', () => ({ requireMinimumRole: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../middleware/auditLogger', () => ({ auditLog: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../lib/supabase', () => ({ handleSupabaseError: vi.fn(), supabaseAdmin: { from: (table: string) => {
  h.calls.push(['from', table]); const q: any = {};
  for (const method of ['select', 'eq', 'ilike', 'order', 'range']) q[method] = (...args: unknown[]) => { h.calls.push([method, ...args]); return q; };
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: 'synthetic', name: 'audit.pdf' }], count: 21, error: h.error }).then(resolve);
  return q;
} } }));
let app: express.Express;
beforeEach(async () => {
  h.calls = []; h.error = null; app = express();
  app.use((req: any, _res, next) => { req.orgId = 'isolated-org'; next(); });
  app.use('/api', (await import('../routes/documents')).default);
});
test('admin list applies literal search and pagination within the tenant', async () => {
  const result = await request(app).get('/api/documents').query({ page: 2, limit: 10, search: 'audit_50%' });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ data: [{ id: 'synthetic', name: 'audit.pdf' }], total: 21, page: 2, limit: 10, totalPages: 3 });
  expect(h.calls).toContainEqual(['eq', 'org_id', 'isolated-org']);
  expect(h.calls).toContainEqual(['ilike', 'name', '%audit\\_50\\%%']);
  expect(h.calls).toContainEqual(['range', 10, 19]);
});
test('legacy list without parameters remains an array', async () => {
  const result = await request(app).get('/api/documents');
  expect(result.status).toBe(200); expect(Array.isArray(result.body)).toBe(true);
  expect(h.calls.some(call => call[0] === 'range')).toBe(false);
});
test('invalid pagination is rejected before a database query', async () => {
  expect((await request(app).get('/api/documents?page=0')).status).toBe(400); expect(h.calls).toEqual([]);
});
test('list failure is an error instead of a misleading empty list', async () => {
  h.error = { message: 'Synthetic failure' }; expect((await request(app).get('/api/documents?page=1')).status).toBe(500);
});
