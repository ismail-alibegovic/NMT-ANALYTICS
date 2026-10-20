import { beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h=vi.hoisted(()=>({filters:[] as [string,unknown][], writes:[] as Record<string,unknown>[]}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:(res:any)=>res.status(500).json({code:'DB_ERROR'}),supabaseAdmin:{from:()=>{
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{h.filters.push([key,value]);return q;},update:(value:Record<string,unknown>)=>{h.writes.push(value);return q;},single:async()=>({data:{id:'agent',org_id:'org',name:'Synthetic agent',is_active:true,partner_type:'gold',commission_rate:7.5,portal_token_expires_at:'2045-01-01T00:00:00Z',portal_last_seen_at:null},error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:null,error:null}).then(resolve)};return q;
}}}));
let app:express.Express;
beforeEach(async()=>{h.filters=[];h.writes=[];app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.orgId='org';next();});app.use('/api',(await import('../routes/subAgentPortal')).default);});
test('issued link matches public route and retains configured port',async()=>{
 vi.stubEnv('PUBLIC_PORTAL_BASE_URL','http://localhost:3001/');const r=await request(app).post('/api/subagents/agent/portal-token').send({});expect(r.status).toBe(200);expect(r.body.portalUrl).toBe(`http://localhost:3001/portal/subagent/${r.body.token}`);expect(h.filters).toContainEqual(['org_id','org']);expect(h.writes[0].portal_token_hash).not.toBe(r.body.token);vi.unstubAllEnvs();
});
test('portal profile uses a hashed credential and returns actual rate and expiry',async()=>{
 const r=await request(app).get('/api/portal/me').set('Authorization','Bearer isolated-token');expect(r.status).toBe(200);expect(r.body.data).toMatchObject({name:'Synthetic agent',partnerType:'gold',commissionRate:7.5,expiresAt:'2045-01-01T00:00:00Z'});expect(h.filters.some(([key,value])=>key==='portal_token_hash'&&typeof value==='string'&&value.length===64)).toBe(true);expect(JSON.stringify(r.body)).not.toContain('isolated-token');expect(h.filters).toContainEqual(['org_id','org']);
});
test('missing credential fails before database access',async()=>{expect((await request(app).get('/api/portal/me')).status).toBe(401);expect(h.filters).toEqual([]);});
