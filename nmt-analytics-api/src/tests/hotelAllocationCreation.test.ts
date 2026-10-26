import {beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
const state=vi.hoisted(()=>({foreign:'',readError:false,insertError:false,rows:[] as any[],role:'manager'}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={id:'staff'};next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(req:any,_res:any,next:any)=>{req.orgId='agency-a';next();}}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_req:any,res:any,next:any)=>state.role==='viewer'?res.sendStatus(403):next()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../lib/audit',()=>({logAction:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{from:(table:string)=>{const filters:any={};let payload:any;const q:any={select:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q;},insert:(p:any)=>{payload=p;return q;},single:async()=>{
 if(table==='hotel_allocations'){if(state.insertError)return{data:null,error:{code:'XX000',message:'PRIVATE SQL'}};state.rows.push(payload);return{data:{id:'allocation',...payload},error:null};}
 expect(filters.org_id).toBe('agency-a');if(state.readError)return{data:null,error:{code:'XX000',message:'PRIVATE SQL'}};
 return{data:state.foreign===table?null:{id:filters.id},error:state.foreign===table?{code:'PGRST116'}:null};
 }};return q;}},handleSupabaseError:(res:any)=>res.sendStatus(500)}));
import router from '../routes/hotels';
import {logAction} from '../lib/audit';
const app=express();app.use(express.json());app.use('/api',router);
const valid={hotelId:'d01cb36c-a26f-4b25-868d-b5143b111111',roomType:'Family',roomsReserved:3,capacityPerRoom:4,checkIn:'2026-11-01',checkOut:'2026-11-04',netPrice:87.25,sellPrice:0};
const send=(body:any)=>request(app).post('/api/departures/d01cb36c-a26f-4b25-868d-b5143b222222/allocations').send(body);
beforeEach(()=>{vi.mocked(logAction).mockClear();state.foreign='';state.readError=false;state.insertError=false;state.rows=[];state.role='manager';});
describe('allocation creation integrity',()=>{
 it('persists independent room capacity and canonical net/sell snapshots',async()=>{const r=await send(valid);expect(r.status).toBe(201);expect(state.rows[0]).toMatchObject({org_id:'agency-a',rooms_reserved:3,capacity_per_room:4,net_price:87.25,sell_price:0,price_per_night:87.25});expect(logAction).toHaveBeenCalledWith(expect.anything(),'CREATE','hotel_allocation','allocation',expect.anything());});
 it('keeps legacy canonical capacity and net alias without inventing retail markup',async()=>{const {capacityPerRoom,netPrice,...legacy}=valid;const r=await send({...legacy,roomType:'double',pricePerNight:25});expect(r.status).toBe(201);expect(state.rows[0]).toMatchObject({capacity_per_room:2,net_price:25,sell_price:0,price_per_night:25});});
 it.each([{checkIn:'0000-01-01'},{checkOut:'0000-01-01'},{checkIn:'2026-02-30'},{checkOut:'2026-10-31'},{checkOut:''},{roomsReserved:-1},{roomsReserved:1.5},{roomsReserved:1001},{capacityPerRoom:0},{capacityPerRoom:101},{netPrice:-1},{netPrice:2.345},{sellPrice:1e12},{org_id:'agency-b'},{pricePerNight:12},{capacityPerRoom:undefined}])('rejects invalid allocation %j before database writes',async patch=>{const r=await send({...valid,...patch});expect(r.status).toBe(400);expect(state.rows).toHaveLength(0);});
 it('allows zero inventory and same-day stays',async()=>{expect((await send({...valid,roomsReserved:0,checkOut:valid.checkIn})).status).toBe(201);});
 it.each(['hotels','departures'])('rejects foreign %s',async table=>{state.foreign=table;expect((await send(valid)).status).toBe(404);expect(state.rows).toHaveLength(0);});
 it('does not disguise unavailable parent reads as missing data',async()=>{state.readError=true;const r=await send(valid);expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('PRIVATE');expect(state.rows).toHaveLength(0);});
 it('hides private insert errors',async()=>{state.insertError=true;const r=await send(valid);expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('PRIVATE');});
 it('retains manager role floor',async()=>{state.role='viewer';expect((await send(valid)).status).toBe(403);expect(state.rows).toHaveLength(0);});
});
