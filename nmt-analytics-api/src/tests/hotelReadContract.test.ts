import { beforeEach,expect,it,vi } from 'vitest';
import express from 'express';import request from 'supertest';
const h=vi.hoisted(()=>({failRead:false}));
const rows=Array.from({length:12},(_,i)=>({id:`hotel-${i+1}`,org_id:'agency-a',name:`Hotel ${i+1}`,destination:'Synthetic',total_rooms:0}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={role:req.headers['x-test-role']||'manager'};req.orgId='agency-a';next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_req:any,_res:any,next:any)=>next()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../lib/audit',()=>({logAction:vi.fn()}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:vi.fn(),supabaseAdmin:{from:()=>{let exact=false,start=0,end=rows.length-1;const filters:[string,any][]=[];
const result=()=>{if(h.failRead)return{data:[],error:{code:'XX000',message:'Synthetic private database error'},count:null};const filtered=rows.filter(r=>filters.every(([key,value])=>(r as any)[key]===value));return{data:filtered.slice(start,end+1),error:null,count:exact?filtered.length:null};};
const q:any={select:(_fields:any,options:any)=>{exact=options?.count==='exact';return q;},eq:(k:string,v:any)=>{filters.push([k,v]);return q;},order:()=>q,range:(a:number,b:number)=>{start=a;end=b;return q;},single:async()=>({...result(),data:result().data[0]}),maybeSingle:async()=>({...result(),data:result().data[0]||null}),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;}}}));
beforeEach(()=>{h.failRead=false;});
import hotels from '../routes/hotels';const app=express();app.use(express.json());app.use('/api',hotels);
it('reports the real hotel count for pagination',async()=>{const r=await request(app).get('/api/hotels');expect(r.status).toBe(200);expect(r.body.total).toBe(12);expect(r.body.totalPages).toBe(2);});
it('loads an owned hotel outside the first list page by identity',async()=>{const r=await request(app).get('/api/hotels/hotel-12');expect(r.status).toBe(200);expect(r.body.id).toBe('hotel-12');});

it('does not expose a missing hotel as a valid identity',async()=>{expect((await request(app).get('/api/hotels/missing')).status).toBe(404);});
it('denies an invalid role before database access',async()=>{expect((await request(app).get('/api/hotels/hotel-12').set('x-test-role','unknown')).status).toBe(403);});
it('never returns another organization hotel',async()=>{rows.push({id:'foreign',org_id:'agency-b',name:'Foreign',destination:'Synthetic',total_rooms:0});expect((await request(app).get('/api/hotels/foreign')).status).toBe(404);});

it('returns a service error rather than false not-found when the identity query fails',async()=>{h.failRead=true;const r=await request(app).get('/api/hotels/hotel-12');expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('Synthetic private database error');});
