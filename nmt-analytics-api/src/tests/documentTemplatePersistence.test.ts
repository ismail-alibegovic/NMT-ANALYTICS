import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h=vi.hoisted(()=>({row:null as any,fail:false,race:false,writes:0,audit:vi.fn()}));
vi.mock('../middleware/authenticateToken',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={id:'actor',role:req.headers['x-test-role']||'director'};req.orgId='agency-a';next();}}));
vi.mock('../middleware/requireOrgContext',()=>({requireOrgContext:(_req:any,_res:any,next:any)=>next()}));
vi.mock('../middleware/auditLogger',()=>({logAuditEntry:(...args:any[])=>h.audit(...args)}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{from:(table:string)=>{
 if(table!=='org_branding')throw Error('Unexpected table');
 let action='read',payload:any;const filters:[string,any][]=[];
 const run=()=>{
  if(h.fail)return{data:null,error:{code:'XX000',message:'private database detail'}};
  if(action==='read')return{data:h.row?structuredClone(h.row):null,error:null};
  if(action==='update'&&h.race)h.row.pdf_template_config={voucher:{footerText:'Concurrent saved value'}};
  if(action==='update'&&filters.some(([k,v])=>k==='pdf_template_config'
    && JSON.stringify(h.row?.pdf_template_config)!==JSON.stringify(typeof v==='string'?JSON.parse(v):v)))return{data:null,error:null};
  if(action==='update'&&!h.row)return{data:null,error:null};
  if(action==='insert'&&h.race)return{data:null,error:{code:'23505'}};
  if(payload.org_id&&payload.org_id!=='agency-a')throw Error('Foreign write');
  if(action==='update'&&!filters.some(([k,v])=>k==='org_id'&&v==='agency-a'))throw Error('Unscoped write');
  h.writes++;h.row={...(h.row||{}),...payload};return{data:h.row,error:null};
 };
 const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q;},is:(k:string,v:any)=>{filters.push([k,v]);return q;},update:(v:any)=>{action='update';payload=v;return q;},insert:(v:any)=>{action='insert';payload=v;return q;},upsert:(v:any)=>{action='upsert';payload=v;return q;},single:async()=>run(),maybeSingle:async()=>run(),then:(resolve:any)=>Promise.resolve(run()).then(resolve)};return q;
}}}));
import router from '../routes/onboarding';
const app=express();app.use(express.json());app.use('/onboarding',router);
beforeEach(()=>{h.row=null;h.fail=false;h.race=false;h.writes=0;h.audit.mockReset();});
it('persists bulk configuration when branding is absent',async()=>{
 const r=await request(app).put('/onboarding/templates').send({pdf_template_config:{invoice:{footerText:'Synthetic footer'}}});
 expect(r.status).toBe(200);expect(h.writes).toBe(1);expect(h.row.pdf_template_config.invoice.footerText).toBe('Synthetic footer');
});
it('preserves unrelated branding',async()=>{
 h.row={org_id:'agency-a',display_name:'Agency',primary_color:'#123456'};
 expect((await request(app).put('/onboarding/templates').send({invoice:{footerText:'Invoice'}})).status).toBe(200);
 expect(h.row).toMatchObject({display_name:'Agency',primary_color:'#123456'});
});
it.each([[],{pdf_template_config:[]},{pdf_template_config:null},{foreign:'value'}])('rejects malformed bulk input %j',async input=>{
 expect((await request(app).put('/onboarding/templates').send(input)).status).toBe(400);expect(h.writes).toBe(0);
});
it('persists a single document in absent branding',async()=>{
 expect((await request(app).put('/onboarding/templates/invoice').send({footerText:'Invoice'})).status).toBe(200);
 expect(h.row.pdf_template_config.invoice.footerText).toBe('Invoice');
});
it('preserves other document types',async()=>{
 h.row={org_id:'agency-a',pdf_template_config:{voucher:{footerText:'Keep'}}};
 expect((await request(app).put('/onboarding/templates/invoice').send({footerText:'Invoice'})).status).toBe(200);
 expect(h.row.pdf_template_config.voucher.footerText).toBe('Keep');
});
it.each([false,true])('rejects a concurrent save (existing=%s)',async existing=>{
 if(existing)h.row={org_id:'agency-a',pdf_template_config:{}};h.race=true;
 expect((await request(app).put('/onboarding/templates/invoice').send({footerText:'Stale'})).status).toBe(409);
 expect(h.writes).toBe(0);expect(h.audit).not.toHaveBeenCalled();
});
it('does not audit success after a database failure or leak details',async()=>{
 h.fail=true;const r=await request(app).put('/onboarding/templates').send({invoice:{footerText:'No save'}});
 expect(r.status).toBe(500);expect(h.writes).toBe(0);expect(h.audit).not.toHaveBeenCalled();expect(JSON.stringify(r.body)).not.toContain('private database detail');
});
it('denies manager mutations',async()=>{
 expect((await request(app).put('/onboarding/templates').set('x-test-role','manager').send({invoice:{footerText:'Denied'}})).status).toBe(403);expect(h.writes).toBe(0);
});
