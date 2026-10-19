import { beforeEach,expect,it,vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h=vi.hoisted(()=>({fail:false,filters:[] as unknown[],throw:false}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(q:any,_s:unknown,n:()=>void)=>{q.orgId='org-a';n();}}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:vi.fn(),supabaseAdmin:{from:()=>{
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{h.filters.push([key,value]);return q;},gte:()=>q,lte:()=>q,then:(resolve:any,reject:any)=>h.throw?Promise.reject(new Error('internal')).then(resolve,reject):Promise.resolve({data:[],count:0,error:h.fail?{message:'database unavailable'}:null}).then(resolve,reject)};return q;
}}}));
let app:express.Express;
beforeEach(async()=>{h.fail=false;h.throw=false;h.filters=[];app=express();app.use('/api',(await import('../routes/reports')).default);});
it('returns validation failure instead of a successful zero report',async()=>{const r=await request(app).get('/api/reports/summary?from=invalid');expect(r.status).toBe(400);expect(r.body).not.toHaveProperty('paidRevenue');});
it('returns 503 instead of fabricating zero revenue when either query fails',async()=>{h.fail=true;const r=await request(app).get('/api/reports/summary');expect(r.status).toBe(503);expect(r.body).not.toHaveProperty('paidRevenue');});
it('returns 503 on unexpected query failure',async()=>{h.throw=true;expect((await request(app).get('/api/reports/summary')).status).toBe(503);});
it('returns legitimate empty totals with both reads scoped to the organization',async()=>{const r=await request(app).get('/api/reports/summary');expect(r.status).toBe(200);expect(r.body.paidRevenue).toBe(0);expect(h.filters).toEqual([['org_id','org-a'],['org_id','org-a']]);});
