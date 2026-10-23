import {beforeEach,expect,it,vi} from 'vitest';
import express from 'express';import request from 'supertest';
const h=vi.hoisted(()=>({profile:{org_id:'org-a',role:'agent'} as any,error:null as any,config:{DEV_BYPASS_AUTH:false,DEV_AUTO_BOOTSTRAP:false,NODE_ENV:'test'}}));
vi.mock('../config',()=>({config:h.config}));
vi.mock('../lib/supabase',()=>({supabaseAdmin:{auth:{getUser:async()=>({data:{user:{id:'own',email:'synthetic@test.invalid'}},error:h.error})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:h.profile,error:null})})})})}}));
import {authenticateToken} from '../middleware/authenticateToken';
const app=express();app.get('/context',authenticateToken,(q,s)=>s.json({org:q.orgId,role:q.user?.role}));
beforeEach(()=>{h.config.DEV_BYPASS_AUTH=false;h.config.NODE_ENV='test';h.error=null;h.profile={org_id:'org-a',role:'agent'};});
it.each([{org_id:null,role:'director'},{org_id:'org-a',role:'unknown'},{org_id:'org-a',role:null}])('fails closed for invalid profile %j',async profile=>{h.profile=profile;const r=await request(app).get('/context').set('Authorization','Bearer synthetic');expect(r.status).toBe(403);expect(r.body.code).toBe('INVALID_AUTH_CONTEXT');});
it('ignores caller-supplied role and organization headers',async()=>{const r=await request(app).get('/context').set('Authorization','Bearer synthetic').set('x-org-id','foreign').set('x-role','director');expect(r.status).toBe(200);expect(r.body).toEqual({org:'org-a',role:'agent'});});
it('rejects invalid tokens before profile lookup',async()=>{h.error={message:'Invalid JWT'};expect((await request(app).get('/context').set('Authorization','Bearer invalid')).status).toBe(401);});

it('never bypasses authentication in production even if config is changed after startup',async()=>{h.config.NODE_ENV='production';h.config.DEV_BYPASS_AUTH=true;expect((await request(app).get('/context')).status).toBe(401);});
