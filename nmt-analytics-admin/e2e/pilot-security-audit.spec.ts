import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';
const api=process.env.E2E_API_URL||'http://127.0.0.1:3001',auth=process.env.E2E_SUPABASE_URL||'http://127.0.0.1:54321';
const local=(u:string)=>/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u);
test.describe.configure({mode:'serial'});
const roles=['director','manager','agent'] as const;
type Role=typeof roles[number];type Headers=Record<string,string>;
const manifest=JSON.parse(readFileSync(new URL('../../docs/operations/authorization-audit/routes.json',import.meta.url),'utf8'));
const email=(role:Role)=>role==='director'?process.env.E2E_FINANCE_DIRECTOR_EMAIL:`${role}@security-audit.test`;
async function login(request:APIRequestContext,role:Role|'foreign'){
 const r=await request.post(`${auth}/auth/v1/token?grant_type=password`,{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email:role==='foreign'?process.env.E2E_OTHER_TENANT_EMAIL:email(role),password:process.env.E2E_FINANCE_DIRECTOR_PASSWORD}});expect(r.status(),await r.text()).toBe(200);const session=await r.json();return {headers:{Authorization:`Bearer ${session.access_token}`},userId:session.user.id};
}
async function create(request:APIRequestContext,headers:Headers,path:string,data:unknown){const r=await request.post(api+'/api'+path,{headers,data});expect(r.status(),await r.text()).toBe(201);return r.json();}
test.beforeEach(()=>{test.skip(process.env.E2E_RUN_BROWSER!=='1','Isolated security acceptance only');expect(local(api)&&local(auth)).toBe(true);});
test('every mounted staff route rejects anonymous and below-role direct requests',async({request},info)=>{
 test.setTimeout(180_000);const actors=Object.fromEntries(await Promise.all(roles.map(async role=>[role,await login(request,role)])));
 const rows=[];const uuid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 for(const route of manifest.routes.filter((r:any)=>r.realm==='staff')){
  const path=route.path.replace(/:[A-Za-z][A-Za-z0-9_]*/g,uuid);
  const anon=await request.fetch(api+'/api'+path,{method:route.method,...(route.method==='GET'?{}:{data:{}})});
  expect([401,403],`anonymous ${route.method} ${path}: ${await anon.text()}`).toContain(anon.status());
  const row:any={module:route.module,method:route.method,path:route.path,anonymous:anon.status(),roles:{}};
  for(const role of roles){if(route.roles[role]!==false){row.roles[role]='allowed by source contract; covered by workflow tests';continue;}
   const r=await request.fetch(api+'/api'+path,{method:route.method,headers:actors[role].headers,...(route.method==='GET'?{}:{data:{}})});
   expect(r.status(),`${role} ${route.method} ${path}: ${await r.text()}`).toBe(403);row.roles[role]=r.status();
  }rows.push(row);
 }
 await info.attach('mounted-route-denial-matrix',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
});
test('cross-tenant records and financial races stay within the authenticated organization',async({request},info)=>{
 test.setTimeout(120_000);const a=await login(request,'director'),b=await login(request,'foreign');const marker='Foreign security '+randomUUID();
 const pkg=await create(request,b.headers,'/packages',{name:marker,destination:'Synthetic',price:180,currency:'BAM',active:true,transportType:'none',maxParticipants:8});
 const dep=await create(request,b.headers,'/departures',{packageId:pkg.id,departAt:'2043-01-01T08:00:00Z',returnAt:'2043-01-02T18:00:00Z',capacity:8,status:'active',transportType:'none'});
 const customer=await create(request,b.headers,'/customers',{fullName:marker,phone:'+3876'+Date.now().toString().slice(-9)});
 const reservation=await create(request,b.headers,'/reservations',{departureId:dep.id,customerId:customer.id,customerName:marker,customerPhone:'000',partySize:1,reservationAt:'2043-01-01T10:00:00Z',status:'confirmed',totalAmount:180,currency:'BAM',source:'agent'});
 const payment=(await create(request,b.headers,'/payments',{reservation_id:reservation.id,amount:60,currency:'BAM',status:'succeeded',idempotency_key:randomUUID()})).payment;
 const supplier=await create(request,b.headers,'/suppliers',{name:marker,category:'other'});
 const hotel=await create(request,b.headers,'/hotels',{name:marker,destination:'Synthetic',totalRooms:1});
 const flight=await create(request,b.headers,'/flights',{airline:marker,flightNumber:'SYN1',departureAirport:'SJJ',arrivalAirport:'IST',departureTime:'2043-01-01T08:00:00Z',arrivalTime:'2043-01-01T10:00:00Z',capacity:10});
 const docResponse=await request.post(api+'/api/documents/upload',{headers:b.headers,multipart:{file:{name:marker+'.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF synthetic security')}}});expect(docResponse.status()).toBe(201);const doc=await docResponse.json();
 const ownPackage=await create(request,a.headers,'/packages',{name:'Own security '+randomUUID(),destination:'Synthetic',price:180,currency:'BAM',active:true,transportType:'none',maxParticipants:8});
 const ownDeparture=await create(request,a.headers,'/departures',{packageId:ownPackage.id,departAt:'2043-02-01T08:00:00Z',returnAt:'2043-02-02T18:00:00Z',capacity:8,status:'active',transportType:'none'});
 const observations=[];
 for(const role of roles){const actor=await login(request,role);
  for(const [path,payload] of [[`/customers/${customer.id}`,{fullName:'Forbidden'}],[`/packages/${pkg.id}`,{name:'Forbidden'}],[`/departures/${dep.id}`,{status:'cancelled'}],[`/reservations/${reservation.id}`,{status:'cancelled'}],[`/payments/${payment.id}`,{amount:1}],[`/suppliers/${supplier.id}`,{name:'Forbidden'}],[`/hotels/${hotel.id}`,{name:'Forbidden'}],[`/flights/${flight.id}`,{airline:'Forbidden'}]] as const){
   const r=await request.patch(api+'/api'+path,{headers:actor.headers,data:payload});expect([403,404],`${role} PATCH ${path}: ${await r.text()}`).toContain(r.status());observations.push({role,path,status:r.status()});
  }
  for(const path of [`/customers/${customer.id}`,`/packages/${pkg.id}`,`/departures/${dep.id}`,`/reservations/${reservation.id}`,`/documents/${doc.id}/download`]){const r=await request.get(api+'/api'+path,{headers:actor.headers});expect([403,404],`${role} GET ${path}: ${await r.text()}`).toContain(r.status());}
  const spoof=await request.post(api+'/api/reservations',{headers:actor.headers,data:{departureId:dep.id,customerName:'Forbidden',customerPhone:'000',partySize:1,reservationAt:'2043-01-01T10:00:00Z',totalAmount:180,currency:'BAM',status:'confirmed',org_id:b.userId,assignedTo:b.userId}});expect([400,403,404]).toContain(spoof.status());
  const assignee=await request.post(api+'/api/reservations',{headers:actor.headers,data:{departureId:ownDeparture.id,customerName:'Foreign assignee',customerPhone:'000',partySize:1,reservationAt:'2043-02-01T10:00:00Z',totalAmount:180,currency:'BAM',status:'confirmed',assignedTo:b.userId}});expect(assignee.status(),await assignee.text()).toBe(400);
  const deletion=await request.delete(`${api}/api/documents/${doc.id}`,{headers:actor.headers});expect([403,404]).toContain(deletion.status());
 }
 const preserved=await request.get(`${api}/api/documents/${doc.id}/download`,{headers:b.headers});expect(preserved.status()).toBe(200);
 // One replay winner in B, no competing A request can mutate B or share its key.
 const key=randomUUID(),body={reservation_id:reservation.id,amount:20,currency:'BAM',status:'succeeded',idempotency_key:key};
 const responses=await Promise.all([request.post(api+'/api/payments',{headers:b.headers,data:body}),request.post(api+'/api/payments',{headers:b.headers,data:body}),request.post(api+'/api/payments',{headers:a.headers,data:body})]);expect(responses.slice(0,2).map(r=>r.status()).sort()).toEqual([200,201]);expect(responses[2].status()).toBe(404);
 const winner=(await responses[0].json()).payment;
 const refunds=await Promise.all([request.post(`${api}/api/payments/${winner.id}/refund`,{headers:b.headers,data:{}}),request.post(`${api}/api/payments/${winner.id}/refund`,{headers:b.headers,data:{}}),request.post(`${api}/api/payments/${winner.id}/refund`,{headers:a.headers,data:{}})]);
 expect(refunds.filter(r=>r.status()===200)).toHaveLength(1);expect(refunds[2].status()).toBe(404);
 const own=await request.get(`${api}/api/reservations/${reservation.id}`,{headers:b.headers});expect((await own.json()).paidAmount).toBe(60);
 const rows=await request.get(`${api}/api/payments?reservation_id=${reservation.id}`,{headers:a.headers});expect((await rows.json()).data).toEqual([]);
 const docs=await request.get(`${api}/api/documents?page=1&search=${encodeURIComponent(marker)}`,{headers:a.headers});expect((await docs.json()).data).toEqual([]);
 await info.attach('cross-tenant-write-evidence',{body:JSON.stringify(observations,null,2),contentType:'application/json'});
});
test('Data API and Storage cannot bypass API roles; self-profile update rejects escalation',async({request},info)=>{
 test.setTimeout(90_000);const observations=[];
 const director=await login(request,'director');const file=await request.post(api+'/api/documents/upload',{headers:director.headers,multipart:{file:{name:'security-private-'+randomUUID()+'.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF private security data')}}});expect(file.status()).toBe(201);const stored=await file.json();expect(stored.storage_path).toBeTruthy();
 for(const role of roles){const actor=await login(request,role);const headers={...actor.headers,apikey:process.env.E2E_SUPABASE_ANON_KEY!};
  for(const table of ['profiles','organizations','payments','reservations','documents','org_settings','org_modules','supplier_payables']){
   const r=await request.get(`${auth}/rest/v1/${table}?select=*`,{headers});expect([401,403],`${role} direct table ${table}: ${await r.text()}`).toContain(r.status());observations.push({role,table,status:r.status()});
  }
  const object=await request.get(`${auth}/storage/v1/object/authenticated/documents/${stored.storage_path}`,{headers});expect(object.status(),await object.text()).not.toBe(200);
  const escalate=await request.patch(`${auth}/rest/v1/profiles?id=eq.${actor.userId}`,{headers,data:{role:'super_admin'}});expect([401,403]).toContain(escalate.status());
  const profile=await request.get(api+'/api/me/profile',{headers:actor.headers});expect(profile.status()).toBe(200);const original=(await profile.json()).profile;
  const results=await Promise.all([request.patch(api+'/api/me/profile',{headers:actor.headers,data:{full_name:'Synthetic '+role}}),request.patch(api+'/api/me/profile',{headers:actor.headers,data:{full_name:'Escalated',role:'super_admin',org_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}})]);expect(results.map(r=>r.status())).toEqual([200,400]);
  const after=(await (await request.get(api+'/api/me/profile',{headers:actor.headers})).json()).profile;expect(after.role).toBe(original.role);expect(after.org_id).toBe(original.org_id);
 }
 const publicFile=await request.get(`${auth}/storage/v1/object/public/documents/${stored.storage_path}`);expect(publicFile.status()).not.toBe(200);
 const download=await request.get(`${api}/api/documents/${stored.id}/download`,{headers:director.headers});expect(download.status()).toBe(200);expect(await download.text()).toBe('%PDF private security data');
 await info.attach('direct-data-api-denials',{body:JSON.stringify(observations,null,2),contentType:'application/json'});
});
for(const role of roles)test(`${role} browser direct-route authorization and profile persistence`,async({page,baseURL},info)=>{
 test.setTimeout(90_000);expect(local(baseURL!)).toBe(true);await page.goto('/auth/signin');await page.locator('#signin-email').fill(email(role)!);await page.locator('#signin-password').fill(process.env.E2E_FINANCE_DIRECTOR_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/\/auth\/signin/);
 const forbidden=role==='director'?[]:role==='manager'?['/settings','/admin/audit-logs','/operations/commission-rules']:['/payments','/reports','/finance','/admin/documents','/settings','/admin/audit-logs','/operations/commission-rules','/operations/subagents','/operations/flights','/operations/hotels','/operations/excursions','/operations/receipts'];
 for(const path of forbidden){await page.goto(path);await expect(page).not.toHaveURL(new RegExp(path.replaceAll('/','\\/')+'$'));}
 await page.goto('/profile');await expect(page.getByRole('heading',{name:'Korisnički Profil',exact:true})).toBeVisible();const input=page.getByPlaceholder('Unesite vaše ime');const name='Browser security '+role;await input.fill(name);const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/me/profile'));await page.getByRole('button',{name:'Spasi izmjene',exact:true}).click();expect((await saved).status()).toBe(200);await page.reload();await expect(input).toHaveValue(name);await info.attach(`${role}-self-profile`,{body:await page.screenshot(),contentType:'image/png'});
});
