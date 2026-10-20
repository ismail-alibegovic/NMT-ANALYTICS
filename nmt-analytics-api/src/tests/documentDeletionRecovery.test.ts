import { beforeEach, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h=vi.hoisted(()=>({fail:true,path:'org/synthetic.pdf',deleted:false,remove:vi.fn(),filters:[] as [string,unknown][]}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/requireRole',()=>({requireMinimumRole:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../middleware/auditLogger',()=>({auditLog:()=> (_q:unknown,_s:unknown,n:()=>void)=>n()}));
vi.mock('../lib/supabase',()=>({handleSupabaseError:vi.fn(),supabaseAdmin:{storage:{from:()=>({remove:h.remove})},from:()=>{
 const filters:Record<string,unknown>={};let deleting=false;const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;h.filters.push([key,value]);return q;},single:async()=>({data:filters.org_id==='org'?{storage_path:h.path}:null,error:null}),delete:()=>{deleting=true;return q;},then:(resolve:(value:unknown)=>unknown)=>{if(deleting)h.deleted=true;return Promise.resolve({error:null}).then(resolve);}};return q;
}}}));
let app:express.Express;
beforeEach(async()=>{h.fail=true;h.path='org/synthetic.pdf';h.deleted=false;h.filters=[];h.remove.mockReset().mockImplementation(async()=>({error:h.fail?{message:'Synthetic storage failure'}:null}));app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.orgId=req.headers['x-org']||'org';next();});app.use('/api',(await import('../routes/documents')).default);});
test('storage failure preserves the document record for a safe delete retry',async()=>{
 const failed=await request(app).delete('/api/documents/synthetic');expect(failed.status).toBe(503);expect(h.deleted).toBe(false);h.fail=false;expect((await request(app).delete('/api/documents/synthetic')).status).toBe(200);expect(h.deleted).toBe(true);expect(h.filters).toContainEqual(['org_id','org']);
});
test('foreign tenant cannot remove the file or document record',async()=>{expect((await request(app).delete('/api/documents/synthetic').set('x-org','foreign')).status).toBe(404);expect(h.remove).not.toHaveBeenCalled();expect(h.deleted).toBe(false);});

test('a foreign Storage path cannot be deleted even from an owned document row',async()=>{h.path='foreign/private.pdf';h.fail=false;const r=await request(app).delete('/api/documents/synthetic');expect(r.status).toBe(403);expect(h.remove).not.toHaveBeenCalled();expect(h.deleted).toBe(false);});

test('a foreign Storage path cannot be downloaded even from an owned document row',async()=>{h.path='foreign/private.pdf';const r=await request(app).get('/api/documents/synthetic/download');expect(r.status).toBe(403);expect(h.remove).not.toHaveBeenCalled();});
