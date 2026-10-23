import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Papa from 'papaparse';
import { escapeCSVValue, generateCSV } from '../utils/csv';
const h = vi.hoisted(() => ({ filters: [] as unknown[][], error: null as any }));
vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (req: any, _res: any, next: any) => {
  req.user = { id: 'user-a', role: 'manager' }; req.orgId = 'org-a'; next();
} }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (_req: any, _res: any, next: any) => next() }));
vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: () => {
  const query: any = {};
  for (const method of ['select', 'eq', 'or', 'range', 'order']) query[method] = (...args: any[]) => {
    if (method === 'eq' || method === 'or') h.filters.push([method, ...args]);
    return query;
  };
  query.then = (resolve: any) => Promise.resolve({ data: [{ full_name: '=SUM(1,2)', notes: 'A "quote",\nnew line', phone: '+38761123456' }], error: h.error }).then(resolve);
  return query;
} }, handleSupabaseError: (res: any) => res.sendStatus(500) }));
import exportRoutes from '../routes/export';
import notificationRoutes from '../routes/notifications';
const app = express(); app.use(exportRoutes); app.use(notificationRoutes);
beforeEach(() => { h.filters = []; h.error = null; });
it.each(['=1+1', '+SUM(1,2)', '-1+1', '@SUM(1,2)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1'])('neutralizes spreadsheet input %j', value => {
  expect(Papa.parse<string[]>(generateCSV(['value'], [[value]])).data[1][0]).toBe("'" + value);
});
it('round-trips quotes, commas and newlines without extra cells', () => {
  const rows = [['A "quote",\nand another line', 'Sarajevo'], ['plain', 'Živinice']];
  expect(Papa.parse<string[]>(generateCSV(['a', 'b'], rows)).data).toEqual([['a', 'b'], ...rows]);
});
it('preserves numeric financial cells and nulls', () => {
  expect(escapeCSVValue(-123.45)).toBe('-123.45');
  expect(escapeCSVValue(0)).toBe('0'); expect(escapeCSVValue(null)).toBe('');
});
it('exports a tenant-scoped customer CSV with intact safe cells', async () => {
  const response = await request(app).get('/export/customers.csv');
  expect(response.status).toBe(200);
  const parsed = Papa.parse<Record<string, string>>(response.text, { header: true });
  expect(parsed.errors).toEqual([]);
  expect(parsed.data[0]).toMatchObject({ fullName: "'=SUM(1,2)", notes: 'A "quote",\nnew line', phone: "'+38761123456" });
  expect(h.filters).toContainEqual(['eq', 'org_id', 'org-a']);
});
it('does not leak provider row values through notification errors', async () => {
  h.error = { message: 'Private passenger passport SECRET-123', code: 'XX000' };
  const response = await request(app).get('/notifications');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ code: 'FETCH_FAILED', message: 'Failed to fetch notifications' });
  expect(response.text).not.toContain('SECRET-123');
  expect(h.filters).toContainEqual(['eq', 'org_id', 'org-a']);
  expect(h.filters).toContainEqual(['or', 'user_id.eq.user-a,user_id.is.null']);
});
it('retains actionable client validation details', async () => {
  const { apiError } = await import('../lib/errors');
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  apiError(response, 422, 'VALIDATION_ERROR', 'Invalid input', [{ path: 'amount' }]);
  expect(response.json).toHaveBeenCalledWith({ code: 'VALIDATION_ERROR', message: 'Invalid input', details: [{ path: 'amount' }] });
});

it('preserves saved-sale recovery without exposing the database cause', async () => {
  const { apiError } = await import('../lib/errors');
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const reservationId = '12345678-1234-4234-8234-123456789abc';
  apiError(response, 500, 'INSTALLMENT_SCHEDULE_CREATE_FAILED', 'Sale requires recovery', {
    stage: 'installments', reservationId, cause: 'private passenger SECRET-123', hint: 'private SQL',
  });
  expect(response.json).toHaveBeenCalledWith({ code: 'INSTALLMENT_SCHEDULE_CREATE_FAILED', message: 'Sale requires recovery', details: { stage: 'installments', reservationId } });
});
