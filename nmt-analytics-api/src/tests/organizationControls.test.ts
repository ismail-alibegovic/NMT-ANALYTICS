import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h = vi.hoisted(() => ({ org: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[],
  filters: [] as [string,unknown][], missingExtended: false }));
vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (req: any,_res: unknown,next: () => void) => {
  req.user = { id: 'actor',role: req.headers['x-test-role'] || 'director' }; req.orgId = 'org-a'; next();
} }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (_req: unknown,_res: unknown,next: () => void) => next() }));
vi.mock('../middleware/auditLogger', () => ({ auditSettingsUpdate: (_req: unknown,_res: unknown,next: () => void) => next(), logAuditEntry: vi.fn(async () => {}) }));
vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: (table: string) => {
  if (table !== 'organizations') throw new Error('Unexpected tenant table');
  const filters: ((row: Record<string,unknown>) => boolean)[] = []; let patch: Record<string,unknown> | undefined;
  const q: any = { select: () => q, eq: (key: string,value: unknown) => { h.filters.push([key,value]); filters.push(row=>row[key]===value);return q; },
    neq: (key: string,value: unknown) => { filters.push(row=>row[key]!==value);return q; },
    update: (value: Record<string,unknown>) => { patch=value;return q; },
    single: async () => {
      if (patch && h.missingExtended && ['timezone','tax_id','bank_account','invoice_footer','invoice_notes'].some(key=>key in patch!)) {
        return { data: null,error: { code:'42703',message:'Synthetic missing extended column' } };
      }
      const row = filters.every(filter=>filter(h.org)) ? h.org : null;
      if (row && patch) { h.writes.push(patch);Object.assign(row,patch); }
      return { data: row,error: null };
    },
  }; q.maybeSingle=q.single; return q;
} } }));
import settings from '../routes/settings';
const app = express();app.use(express.json());app.use('/settings',settings);
beforeEach(() => { h.org={ id:'org-a',name:'Existing agency',slug:'existing-agency',currency:'BAM',timezone:'Europe/Sarajevo',plan:'trial' }; h.writes=[];h.filters=[];h.missingExtended=false; });
describe('commercial organization mutation boundaries', () => {
  it.each([{name:'   '},{currency:'INVALID'},{currency:42},{timezone:'Not/A_Real_Zone'},{bank_account:{invalid:'object'}}])('rejects invalid settings %j before any write',async payload=>{
    const response=await request(app).patch('/settings').send(payload);expect(response.status).toBe(400);expect(h.writes).toEqual([]);
  });
  it.each(['org_id','role','plan'])('refuses mass assignment of %s with an otherwise valid name',async key=>{
    const response=await request(app).patch('/settings').send({name:'Allowed name',[key]:'foreign'});
    expect(response.status).toBe(400);expect(h.org.name).toBe('Existing agency');expect(h.writes).toEqual([]);
  });
  it('does not partially save the agency name when nonempty tax fields need a migration',async()=>{
    h.missingExtended=true;
    const response=await request(app).patch('/settings').send({name:'Requested rename',tax_id:'SYNTHETIC-TAX'});
    expect(response.status).toBe(409);expect(h.org.name).toBe('Existing agency');expect(h.writes).toEqual([]);
  });
  it('prevents an agency director from assigning enterprise entitlements',async()=>{
    const response=await request(app).patch('/settings/plan').send({plan:'enterprise'});
    expect(response.status).toBe(403);expect(h.org.plan).toBe('trial');expect(h.writes).toEqual([]);
  });
  it('retains a scoped platform-admin assignment without accepting a foreign org selector',async()=>{
    const response=await request(app).patch('/settings/plan').set('x-test-role','super_admin').send({plan:'enterprise',org_id:'foreign'});
    expect(response.status).toBe(400);expect(h.writes).toEqual([]);
  });
  it('allows an authorized platform administrator to assign the current scoped org plan',async()=>{
    const response=await request(app).patch('/settings/plan').set('x-test-role','super_admin').send({plan:'enterprise'});
    expect(response.status).toBe(200);expect(h.org.plan).toBe('enterprise');expect(h.filters).toContainEqual(['id','org-a']);
  });
  it('does not claim a plan was saved when the scoped organization no longer exists',async()=>{
    h.org.id='org-b';
    const response=await request(app).patch('/settings/plan').set('x-test-role','super_admin').send({plan:'enterprise'});
    expect(response.status).toBe(404);expect(h.org.plan).toBe('trial');expect(h.writes).toEqual([]);
  });
  it('preserves legitimate clearing and normalizes currency without changing tenant identity',async()=>{
    const response=await request(app).patch('/settings').send({name:'  Renamed agency  ',currency:'eur',email:'',tax_id:null});
    expect(response.status).toBe(200);expect(h.org).toMatchObject({id:'org-a',name:'Renamed agency',currency:'EUR',email:null,tax_id:null});
    expect(h.filters).toContainEqual(['id','org-a']);
  });
  it('accepts the existing long generated signup slugs',async()=>{
    const slug='synthetic-commercial-agency-00000000-0000-4000-8000-000000000001';
    const response=await request(app).patch('/settings').send({slug});
    expect(response.status).toBe(200);expect(h.org.slug).toBe(slug);
  });
  it('never reports partial success for empty clears in an incomplete schema',async()=>{
    h.missingExtended=true;
    const response=await request(app).patch('/settings').send({name:'Allowed rename',tax_id:'',bank_account:null});
    expect(response.status).toBe(409);expect(h.org.name).toBe('Existing agency');expect(h.writes).toEqual([]);
  });
  it('preserves a valid legacy base-only update without dropping any requested fields',async()=>{
    h.missingExtended=true;
    const response=await request(app).patch('/settings').send({name:'Allowed rename'});
    expect(response.status).toBe(200);expect(h.org.name).toBe('Allowed rename');expect(h.writes).toEqual([{name:'Allowed rename'}]);
  });
  it.each(['manager','agent','viewer'])('denies %s settings mutations before any query',async role=>{
    const response=await request(app).patch('/settings').set('x-test-role',role).send({name:'Rejected'});
    expect(response.status).toBe(403);expect(h.filters).toEqual([]);expect(h.writes).toEqual([]);
  });
});
