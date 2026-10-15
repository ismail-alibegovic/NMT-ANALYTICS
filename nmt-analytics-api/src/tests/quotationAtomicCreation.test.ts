import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import routes from '../routes/quotations';
const db = vi.hoisted(() => ({rpc:vi.fn(),from:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:db,handleSupabaseError:(res:any,_error:any,message:string)=>res.status(500).json({error:message})}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={id:'11111111-1111-4111-8111-111111111111',role:'director'};next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(req:any,_res:any,next:any)=>{req.orgId='22222222-2222-4222-8222-222222222222';next();}}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../lib/pdfGenerator',()=>({generateOfferPDF:vi.fn()}));
vi.mock('../lib/orgBranding',()=>({getOrgBranding:vi.fn()}));
function app(){const result=express();result.use(express.json());result.use(routes);return result;}
const org='22222222-2222-4222-8222-222222222222';
const saved={id:'quote',org_id:org,title:'Safe offer',reference:'QTN-2026-0041',status:'draft',currency:'EUR',net_total:12.51,sell_total:13.76,margin_total:1.25,global_markup_percent:0,booking_context:{source:'standalone',currency:'EUR'}};
beforeEach(()=>{vi.resetAllMocks();db.from.mockImplementation(()=>{throw new Error('Creation must use one transaction');});db.rpc.mockResolvedValue({data:saved,error:null});});
describe('atomic quotation API boundary',()=>{
  it('passes server actor/org and validated header/items to exactly one RPC',async()=>{
    const response=await request(app()).post('/quotations').send({title:'Safe offer',currency:'EUR',org_id:'attacker',created_by:'attacker',items:[{title:'Service',quantity:1.25,netUnitPrice:10.01,markupPercent:10}]});
    expect(response.status).toBe(201);
    expect(response.body.netTotal).toBe(12.51);
    expect(response.body.bookingContext).toEqual(saved.booking_context);
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('create_quotation_snapshot_atomic',expect.objectContaining({
      p_org_id:org,p_actor_id:'11111111-1111-4111-8111-111111111111',
      p_payload:expect.objectContaining({currency:'EUR',items:[expect.objectContaining({title:'Service',net_unit_price:10.01,quantity:1.25,currency:null})]}),
    }));
    expect(db.rpc.mock.calls[0][1].p_payload).not.toHaveProperty('org_id');
  });
  it.each([
    ['QUOTATION_SOURCE_NOT_FOUND','P0001',404,'NOT_FOUND'],
    ['QUOTATION_CURRENCY_MISMATCH','P0001',422,'QUOTATION_CURRENCY_MISMATCH'],
    ['QUOTATION_ACTOR_CONTEXT_INVALID','42501',403,'INSUFFICIENT_PERMISSIONS'],
    ['Foreign key','23503',422,'QUOTATION_INVALID_SNAPSHOT'],
    ['Numeric overflow','22003',422,'QUOTATION_INVALID_SNAPSHOT'],
    ['Unknown database failure','XX000',500,undefined],
  ])('does not report success on transaction failure: %s',async(message,code,status,expectedCode)=>{
    db.rpc.mockResolvedValue({data:null,error:{message,code}});
    const response=await request(app()).post('/quotations').send({title:'Safe offer'});
    expect(response.status).toBe(status);
    if(expectedCode)expect(response.body.code).toBe(expectedCode);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null,{...saved,org_id:'other'}])('rejects absent or unexpected transaction output',async(data)=>{
    db.rpc.mockResolvedValue({data,error:null});
    const response=await request(app()).post('/quotations').send({title:'Safe offer'});
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('QUOTATION_SNAPSHOT_FAILED');
  });
  it('validates currency before requesting a transaction',async()=>{
    await request(app()).post('/quotations').send({title:'Safe offer',currency:'invalid'}).expect(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
