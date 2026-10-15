import {beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
import routes from '../routes/quotationBooking';
const state=vi.hoisted(()=>({rpc:vi.fn(),allowed:true,audit:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{rpc:state.rpc},handleSupabaseError:(res:any,_e:any,m:string)=>res.status(500).json({error:m})}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_r:any,n:any)=>{req.user={id:'actor'};n();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(req:any,_r:any,n:any)=>{req.orgId='org';n();}}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:any,r:any,n:any)=>state.allowed?n():r.status(403).json({code:'INSUFFICIENT_PERMISSIONS'})}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (q:any,r:any,n:any)=>{state.audit();n();}}));
const id='11111111-1111-4111-8111-111111111111';
const body={departureId:'22222222-2222-4222-8222-222222222222',customerName:' Buyer ',customerPhone:' +38761 ',passengers:[{full_name:' Traveler '}]};
const saved={id:'reservation',org_id:'org',quotation_id:id,creation_state:'completed',status:'confirmed'};
function app(){const a=express();a.use(express.json());a.use(routes);return a;}
beforeEach(()=>{vi.clearAllMocks();state.allowed=true;state.rpc.mockResolvedValue({data:{created:true,reservation:saved},error:null});});
describe('quotation booking API',()=>{
 it('uses server actor/org and normalized names; ignores client price and fingerprint',async()=>{
  const r=await request(app()).post(`/quotations/${id}/booking`).send({...body,totalAmount:1,orgId:'attacker',fingerprint:'attacker'});
  expect(r.status).toBe(201);
  const [name,args]=state.rpc.mock.calls[0];expect(name).toBe('book_quotation_atomic');expect(args.p_org_id).toBe('org');expect(args.p_actor_id).toBe('actor');
  expect(args.p_payload.customerName).toBe('Buyer');expect(args.p_payload.passengers).toEqual([{full_name:'Traveler'}]);
  expect(args.p_payload.totalAmount).toBeUndefined();expect(args.p_fingerprint).toMatch(/^[0-9a-f]{64}$/);expect(state.audit).toHaveBeenCalledTimes(1);
 });
 it('returns saved retry without another creation audit',async()=>{
  state.rpc.mockResolvedValue({data:{created:false,reservation:saved},error:null});
  await request(app()).post(`/quotations/${id}/booking`).send(body).expect(200);expect(state.audit).not.toHaveBeenCalled();
 });
 it.each([['QUOTATION_NOT_FOUND',404],['QUOTATION_ALREADY_BOOKED',409],['QUOTATION_NOT_ACCEPTED',409],
 ['CAPACITY_FULL',409],['QUOTATION_DEPARTURE_INCOMPATIBLE',422],['QUOTATION_TRAVELERS_INVALID',422],['QUOTATION_CONTEXT_REQUIRED',422]])('maps %s',async(message,status)=>{
  state.rpc.mockResolvedValue({data:null,error:{message,code:'P0001'}});
  await request(app()).post(`/quotations/${id}/booking`).send(body).expect(status);
 });
 it('requires agent authorization',async()=>{state.allowed=false;await request(app()).post(`/quotations/${id}/booking`).send(body).expect(403);expect(state.rpc).not.toHaveBeenCalled();});
 it.each([{...body,passengers:[]},{...body,customerName:' '},{...body,departureId:'bad'}])('validates inputs',async payload=>{
  await request(app()).post(`/quotations/${id}/booking`).send(payload).expect(400);expect(state.rpc).not.toHaveBeenCalled();
 });
 it('fails closed on unexpected transaction output',async()=>{state.rpc.mockResolvedValue({data:{created:true,reservation:{...saved,org_id:'other'}},error:null});await request(app()).post(`/quotations/${id}/booking`).send(body).expect(500);});
 it('scopes departure choices to server org and quote',async()=>{
  state.rpc.mockResolvedValue({data:[],error:null});await request(app()).get(`/quotations/${id}/booking-options`).expect(200);
  expect(state.rpc).toHaveBeenCalledWith('quotation_booking_departures',{p_org_id:'org',p_quotation_id:id});
 });
});
