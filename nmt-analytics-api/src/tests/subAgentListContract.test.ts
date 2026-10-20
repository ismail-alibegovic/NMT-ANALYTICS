import { beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h=vi.hoisted(()=>({filters:[] as unknown[][], inserted:null as any}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(_q:unknown,_s:unknown,next:()=>void)=>next()}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_q:unknown,_s:unknown,next:()=>void)=>next()}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:unknown,_s:unknown,next:()=>void)=>next()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_q:unknown,_s:unknown,next:()=>void)=>next()}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:vi.fn(),supabaseAdmin:{from:()=>{
 const q:any={};q.insert=(value:unknown)=>{h.inserted=value;return q;};q.single=async()=>({data:{id:'synthetic',...h.inserted},error:null});for(const method of ['select','order','range'])q[method]=()=>q;
 q.eq=(...args:unknown[])=>{h.filters.push(args);return q;};q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[{id:'synthetic',org_id:'org-a',name:'Synthetic agent',commission_rate:'7.50',partner_type:'gold',is_active:true,portal_token_expires_at:'2030-01-01',sub_agent_sales:[{id:'synthetic-sale'}]}],count:1,error:null}).then(resolve);return q;
}}}));
let app:express.Express;
beforeEach(async()=>{h.filters=[];h.inserted=null;app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.orgId='org-a';next();});app.use('/api',(await import('../routes/subagents')).default);});
test('sub-agent reload preserves saved commission, tier, status and portal metadata',async()=>{
 const response=await request(app).get('/api/subagents');expect(response.status).toBe(200);
 expect(response.body.data[0]).toMatchObject({id:'synthetic',orgId:'org-a',commissionRate:7.5,partnerType:'gold',isActive:true,portalTokenExpiresAt:'2030-01-01',sales:[{id:'synthetic-sale'}]});expect(h.filters).toContainEqual(['org_id','org-a']);
});

test('optional blank email is omitted and the agency name is normalized',async()=>{
 const response=await request(app).post('/api/subagents').send({name:'  Synthetic agent  ',email:'   ',commissionRate:7.5,partnerType:'gold'});
 expect(response.status).toBe(201);expect(h.inserted.name).toBe('Synthetic agent');expect(h.inserted.email).toBeUndefined();expect(response.body).toMatchObject({commissionRate:7.5,partnerType:'gold',isActive:true});
});
test('whitespace-only name is rejected before insertion',async()=>{
 expect((await request(app).post('/api/subagents').send({name:'   '})).status).toBe(400);expect(h.inserted).toBeNull();
});
