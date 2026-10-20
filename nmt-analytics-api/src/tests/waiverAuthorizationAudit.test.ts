import {beforeEach,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
const h=vi.hoisted(()=>({row:{} as any,writes:0,raceRevoke:false}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_q:any,_s:any,n:any)=>n(),logAuditEntry:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:vi.fn(),supabaseAdmin:{from:()=>{
 const filters:Record<string,unknown>={};let patch:any,expiry:string|undefined;
 const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},is:(k:string,v:unknown)=>{filters[k]=v;return q;},gt:(_k:string,v:string)=>{expiry=v;return q;},update:(p:any)=>{patch=p;return q;},single:async()=>({data:{...h.row},error:null}),maybeSingle:async()=>{
  if(h.raceRevoke)h.row.revoked_at=new Date().toISOString();
  if(!Object.entries(filters).every(([k,v])=>h.row[k]===v)||!expiry||h.row.expires_at<=expiry)return {data:null,error:null};
  h.writes++;Object.assign(h.row,patch);return {data:{id:h.row.id},error:null};
 }};return q;
}}}));
import routes from '../routes/waivers';
const app=express();app.use(express.json());app.use('/api',routes);
beforeEach(()=>{h.writes=0;h.raceRevoke=false;h.row={id:'waiver',org_id:'own',status:'pending',revoked_at:null,consumed_at:null,expires_at:'2044-01-01T00:00:00Z'};});
it.each(['revoked_at','consumed_at'])('a %s token cannot read or sign',async field=>{h.row[field]=new Date().toISOString();const responses=await Promise.all([request(app).get('/api/public/waiver/synthetic'),request(app).post('/api/public/waiver/synthetic/sign').send({signer_name:'Synthetic',agreed:true})]);expect(responses.map(r=>r.status)).toEqual(field==='revoked_at'?[404,404]:[409,409]);expect(h.writes).toBe(0);});
it('concurrent signatures have one winner and cannot overwrite the accepted signer',async()=>{const rs=await Promise.all(['First','Second'].map(signer_name=>request(app).post('/api/public/waiver/synthetic/sign').send({signer_name,agreed:true})));expect(rs.map(r=>r.status).sort()).toEqual([200,409]);expect(h.writes).toBe(1);expect(h.row.signer_name).toBe(rs[0].status===200?'First':'Second');});
it('revocation between capability read and write prevents signing',async()=>{h.raceRevoke=true;const r=await request(app).post('/api/public/waiver/synthetic/sign').send({signer_name:'Synthetic',agreed:true});expect(r.status).toBe(409);expect(h.writes).toBe(0);});
