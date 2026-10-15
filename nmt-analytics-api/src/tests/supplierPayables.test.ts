import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import routes, { transformPayable } from '../routes/supplierPayables';

const state = vi.hoisted(() => ({ rpc: vi.fn(), allowed: true, audit: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabaseAdmin: { rpc: state.rpc }, handleSupabaseError: (res: any) => res.status(500).json({ code: 'DATABASE_ERROR' }) }));
vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (q: any, _r: any, n: any) => { q.user = { id: 'actor' }; n(); } }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (q: any, _r: any, n: any) => { q.orgId = 'org'; n(); } }));
vi.mock('../middleware/requireRole', () => ({ requireMinimumRole: (role: string) => (_q: any, r: any, n: any) => role === 'manager' && state.allowed ? n() : r.status(403).end() }));
vi.mock('../middleware/auditLogger', () => ({ auditLog: () => (_q: any, _r: any, n: any) => { state.audit(); n(); } }));
const dep = '11111111-1111-4111-8111-111111111111', payable = '22222222-2222-4222-8222-222222222222';
const cost = '33333333-3333-4333-8333-333333333333', key = '44444444-4444-4444-8444-444444444444';
const body = { requestId: key, currency: 'BAM', kind: 'payment', amount: 60, paymentDate: '2026-10-15', reference: ' ref ', note: '' };
const saved = { id: 'entry', org_id: 'org', payable_id: payable, request_id: key };
function app() { const a = express(); a.use(express.json()); a.use(routes); return a; }
beforeEach(() => { vi.clearAllMocks(); state.allowed = true; state.rpc.mockResolvedValue({ data: { created: true, record: saved }, error: null }); });
describe('supplier payable API', () => {
  it('normalizes payment data and derives actor/org/fingerprint on the server', async () => {
    const r = await request(app()).post(`/supplier-payables/${payable}/entries`).send({ ...body, orgId: 'foreign', fingerprint: 'client' });
    expect(r.status).toBe(201); const [name, args] = state.rpc.mock.calls[0];
    expect(name).toBe('record_supplier_payable_entry'); expect(args).toMatchObject({ p_org_id: 'org', p_actor_id: 'actor', p_payable_id: payable, p_request_id: key });
    expect(args.p_payload).toEqual({ currency: 'BAM', kind: 'payment', amount: 60, paymentDate: '2026-10-15', reference: 'ref', note: '' });
    expect(args.p_fingerprint).toMatch(/^[0-9a-f]{64}$/); expect(state.audit).toHaveBeenCalledOnce();
  });
  it('does not audit an idempotent retry twice', async () => { state.rpc.mockResolvedValue({ data: { created: false, record: saved } }); await request(app()).post(`/supplier-payables/${payable}/entries`).send(body).expect(200); expect(state.audit).not.toHaveBeenCalled(); });
  it('issues only the persisted source cost, never the browser amount', async () => {
    state.rpc.mockResolvedValue({ data: { created: true, record: { id: payable, org_id: 'org', departure_id: dep } } });
    await request(app()).post(`/departures/${dep}/supplier-payables`).send({ requestId: key, costItemId: cost, dueDate: '2027-07-01', amount: 1, currency: 'EUR', supplierId: 'foreign' }).expect(201);
    expect(state.rpc.mock.calls[0][1]).toMatchObject({ p_departure_id: dep, p_cost_item_id: cost, p_due_date: '2027-07-01', p_request_id: key });
    expect(state.rpc.mock.calls[0][1]).not.toHaveProperty('amount');
  });
  it.each([{ ...body, amount: 0 }, { ...body, amount: 1.001 }, { ...body, amount: -1 }, { ...body, paymentDate: 'bad' }, { ...body, requestId: 'bad' }, { ...body, kind: 'reversal', reversesId: cost, note: ' ' }])('rejects malformed money/date/id/reversal before RPC', async data => {
    await request(app()).post(`/supplier-payables/${payable}/entries`).send(data).expect(400); expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([['PAYABLE_NOT_FOUND',404],['PAYABLE_SOURCE_NOT_FOUND',404],['PAYABLE_ACTOR_INVALID',403],['PAYABLE_BALANCE_CONFLICT',409],['PAYABLE_ALREADY_REVERSED',409],['PAYABLE_HAS_PAYMENTS',409],['PAYABLE_REQUEST_CONFLICT',409],['PAYABLE_SOURCE_INVALID',422],['PAYABLE_CURRENCY_MISMATCH',422]])('maps %s to a meaningful HTTP response', async (message,status) => {
    state.rpc.mockResolvedValue({ data: null, error: { message } }); await request(app()).post(`/supplier-payables/${payable}/entries`).send(body).expect(status);
  });
  it('requires manager access for all operations', async () => {
    state.allowed = false; await request(app()).get(`/departures/${dep}/supplier-payables`).expect(403);
    await request(app()).post(`/departures/${dep}/supplier-payables`).send({}).expect(403);
    await request(app()).post(`/supplier-payables/${payable}/entries`).send(body).expect(403);
    await request(app()).post(`/supplier-payables/${payable}/cancel`).expect(403); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on transaction output for another organization', async () => { state.rpc.mockResolvedValue({ data: { created: true, record: { ...saved, org_id: 'foreign' } } }); await request(app()).post(`/supplier-payables/${payable}/entries`).send(body).expect(500); });
  it('reads the complete ledger in one organization/departure-scoped RPC', async () => {
    state.rpc.mockResolvedValue({ data: [] }); await request(app()).get(`/departures/${dep}/supplier-payables`).expect(200);
    expect(state.rpc).toHaveBeenCalledWith('list_supplier_payables', { p_org_id: 'org', p_departure_id: dep });
  });
  it('does not present missing ledger data as zero paid', async () => {
    state.rpc.mockResolvedValue({ data: [{ org_id: 'org', departure_id: dep, amount: 100 }] }); await request(app()).get(`/departures/${dep}/supplier-payables`).expect(500);
  });
  it('derives partial, paid and cancelled balances from signed entries in cents', () => {
    const row = { amount: '100.01', entries: [{ id: 'a', created_at: 'date', amount: '60.01' }, { id: 'b', created_at: 'date', amount: '40' }, { id: 'c', created_at: 'date', amount: '-40' }] };
    expect(transformPayable(row)).toMatchObject({ paid: 60.01, remaining: 40, status: 'partial' });
    expect(transformPayable({ ...row, entries: row.entries.slice(0,2) })).toMatchObject({ paid: 100.01, remaining: 0, status: 'paid' });
    expect(transformPayable({ ...row, entries: [], cancelled_at: 'date' })).toMatchObject({ paid: 0, remaining: 0, status: 'cancelled' });
    expect(() => transformPayable({ ...row, entries: [{ id: 'a', created_at: 'date', amount: '-1' }] })).toThrow();
  });
});
