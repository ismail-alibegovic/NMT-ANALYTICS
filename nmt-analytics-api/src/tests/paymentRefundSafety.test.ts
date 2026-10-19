import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const ORG='00000000-0000-4000-8000-000000000001', PAY='00000000-0000-4000-8000-000000000002', RES='00000000-0000-4000-8000-000000000003';
const h=vi.hoisted(()=>({ row:{} as Record<string,unknown>, audit:vi.fn(), writes:[] as unknown[], concurrent:false, readers:[] as ((value:unknown)=>void)[] }));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/auditLogger',()=>({auditPaymentCreate:(_q:unknown,_s:unknown,n:()=>void)=>n(),auditPaymentUpdate:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../lib/audit',()=>({logAction:h.audit}));
vi.mock('../lib/notificationService',()=>({notifyPaymentReceived:vi.fn()}));
vi.mock('../lib/email/EmailService',()=>({EmailService:{sendPaymentConfirmation:vi.fn()}}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:(res:any)=>res.status(500).json({code:'DB_ERROR'}),supabaseAdmin:{from:(table:string)=>{
 const filters:Record<string,unknown>={}; let patch:Record<string,unknown>|undefined;
 const finish=async()=>{
  if(table==='reservations')return {data:{id:RES,total_amount:180,paid_amount:0,status:'confirmed'},error:null};
  const matches=Object.entries(filters).every(([key,value])=>h.row[key]===value);
  if(!matches)return {data:null,error:null};
  if(!patch && h.concurrent){ const result={data:{...h.row},error:null}; return new Promise(resolve=>{h.readers.push(()=>resolve(result)); if(h.readers.length===2)h.readers.forEach(done=>done(null));}); }
  if(patch){h.writes.push(patch);Object.assign(h.row,patch);}
  return {data:{...h.row},error:null};
 };
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q;},update:(value:Record<string,unknown>)=>{patch=value;return q;},single:finish,maybeSingle:finish};return q;
}}}));
let app:express.Express;
beforeEach(async()=>{
 h.row={id:PAY,reservation_id:RES,org_id:ORG,status:'succeeded',amount:60,currency:'BAM',created_at:'2026-10-19'};h.writes=[];h.concurrent=false;h.readers=[];h.audit.mockReset();
 app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.orgId=req.headers['x-org']||ORG;next();});
 app.use('/api',(await import('../routes/payments')).default);
});
describe('refund eligibility and compare-and-set',()=>{
 it.each(['pending','failed','cancelled'])('rejects %s without a mutation or refund audit',async status=>{
  h.row.status=status;const r=await request(app).post(`/api/payments/${PAY}/refund`).send({});expect(r.status).toBe(409);expect(r.body.code).toBe('PAYMENT_NOT_REFUNDABLE');expect(h.writes).toHaveLength(0);expect(h.audit).not.toHaveBeenCalled();
 });
 it('permits one competing refund and audits only the winner',async()=>{
  h.concurrent=true;const results=await Promise.all([0,1].map(()=>request(app).post(`/api/payments/${PAY}/refund`).send({})));
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(h.writes).toEqual([{status:'refunded'}]);expect(h.audit).toHaveBeenCalledTimes(1);
 });
 it('does not access another tenant payment',async()=>{
  expect((await request(app).post(`/api/payments/${PAY}/refund`).set('x-org','foreign-org').send({})).status).toBe(404);expect(h.writes).toHaveLength(0);
 });
 it('rejects an already refunded payment without another write',async()=>{
  h.row.status='refunded';expect((await request(app).post(`/api/payments/${PAY}/refund`).send({})).status).toBe(400);expect(h.writes).toHaveLength(0);
 });
});
