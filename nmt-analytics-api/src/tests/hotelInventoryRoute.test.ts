import {beforeEach,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
const h=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),audit:vi.fn()}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={id:'actor',role:req.headers['x-test-role']||'manager'};req.orgId='agency-a';next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_req:any,_res:any,next:any)=>next()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../lib/audit',()=>({logAction:(...args:any[])=>h.audit(...args)}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{rpc:(...args:any[])=>h.rpc(...args),from:(...args:any[])=>h.from(...args)},handleSupabaseError:vi.fn()}));
import router from '../routes/hotels';const app=express();app.use(express.json());app.use('/api',router);
beforeEach(()=>{h.rpc.mockReset();h.from.mockReset();h.audit.mockReset();h.rpc.mockResolvedValue({data:{id:'created',org_id:'agency-a',name:'Hotel',destination:'Synthetic',total_rooms:0},error:null});});
it('uses one scoped transaction for hotel and default stock without client tenant assignment',async()=>{
 const r=await request(app).post('/api/hotels').send({name:'  Hotel  ',destination:' Synthetic ',totalRooms:10});
 expect(r.status).toBe(201);expect(h.rpc).toHaveBeenCalledExactlyOnceWith('create_hotel_inventory',{p_org_id:'agency-a',p_hotel:{name:'Hotel',destination:'Synthetic',totalRooms:10}});expect(h.from).not.toHaveBeenCalled();
});
it.each([{org_id:'foreign'},{role:'director'},{slug:'forged'}])('rejects forged hotel fields %j',async forged=>{
 expect((await request(app).post('/api/hotels').send({name:'Hotel',destination:'Synthetic',...forged})).status).toBe(400);expect(h.rpc).not.toHaveBeenCalled();
});
it.each([{capacity:0},{capacity:-1},{capacity:1.5},{quantity:-1},{quantity:'4'},{basePrice:-1},{basePrice:1.001},{currency:'INVALID'},{roomType:'  '}])('rejects invalid room settings %j before mutation',async invalid=>{
 expect((await request(app).post('/api/hotels/owned/rooms').send({roomType:'family',capacity:4,quantity:3,basePrice:50,...invalid})).status).toBe(400);expect(h.rpc).not.toHaveBeenCalled();expect(h.from).not.toHaveBeenCalled();
});
it('keeps custom labels and quantity independent from passenger capacity',async()=>{
 h.rpc.mockResolvedValue({data:{id:'room',org_id:'agency-a',hotel_id:'owned',room_type:'family',capacity:4,total:3,available:3},error:null});
 const r=await request(app).post('/api/hotels/owned/rooms').send({roomType:' family ',capacity:4,quantity:3,basePrice:123.45,currency:'eur'});
 expect(r.status).toBe(201);expect(r.body).toMatchObject({capacity:4,total:3,available:3});
 expect(h.rpc).toHaveBeenCalledExactlyOnceWith('create_hotel_room_inventory',{p_org_id:'agency-a',p_hotel_id:'owned',p_room:{roomType:'family',capacity:4,quantity:3,basePrice:123.45,currency:'EUR'}});expect(h.audit).toHaveBeenCalledOnce();
});
it('defaults to one room independently of a four-person capacity',async()=>{
 await request(app).post('/api/hotels/owned/rooms').send({roomType:'family',capacity:4});expect(h.rpc.mock.calls[0][1].p_room).toMatchObject({capacity:4,quantity:1,basePrice:0});
});
it.each(['/hotels','/hotels/owned/rooms'])('does not fall back to unsafe writes when the RPC is missing (%s)',async path=>{
 h.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'private schema detail'}});
 const r=await request(app).post('/api'+path).send(path==='/hotels'?{name:'Hotel',destination:'Synthetic'}:{roomType:'family'});
 expect(r.status).toBe(503);expect(r.body.code).toBe('MIGRATION_PENDING');expect(JSON.stringify(r.body)).not.toContain('private schema detail');expect(h.from).not.toHaveBeenCalled();expect(h.audit).not.toHaveBeenCalled();
});
it.each(['returned','thrown'])('does not report created or audit success after a %s transaction failure',async mode=>{
 if(mode==='returned')h.rpc.mockResolvedValue({data:null,error:{code:'XX000',message:'Private child fault'}});else h.rpc.mockRejectedValue(Error('Private child fault'));
 const r=await request(app).post('/api/hotels').send({name:'Hotel',destination:'Synthetic',totalRooms:10});expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('Private child fault');expect(h.from).not.toHaveBeenCalled();expect(h.audit).not.toHaveBeenCalled();
});
it('rejects a foreign hotel through the scoped transaction',async()=>{
 h.rpc.mockResolvedValue({data:null,error:{code:'P0002',message:'HOTEL_NOT_FOUND'}});
 expect((await request(app).post('/api/hotels/foreign/rooms').send({roomType:'family'})).status).toBe(404);expect(h.rpc.mock.calls[0][1]).toMatchObject({p_org_id:'agency-a',p_hotel_id:'foreign'});
});
it.each(['agent','viewer'])('denies %s before inventory mutation',async role=>{
 expect((await request(app).post('/api/hotels/owned/rooms').set('x-test-role',role).send({roomType:'family'})).status).toBe(403);expect(h.rpc).not.toHaveBeenCalled();
});
