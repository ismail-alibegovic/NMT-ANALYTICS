import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const api=process.env.E2E_API_URL||'http://127.0.0.1:3001', auth=process.env.E2E_SUPABASE_URL||'http://127.0.0.1:54321';
const local=(url:string)=>/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
const enabled=process.env.E2E_RUN_BROWSER==='1'&&Boolean(process.env.E2E_MANAGER_EMAIL&&process.env.E2E_MANAGER_PASSWORD);
async function json(r:APIResponse,status=201){expect(r.status(),await r.text()).toBe(status);return r.json();}
async function login(request:APIRequestContext,other=false,director=false){const prefix=director?'E2E_FINANCE_DIRECTOR':other?'E2E_OTHER_TENANT':'E2E_MANAGER';const r=await json(await request.post(`${auth}/auth/v1/token?grant_type=password`,{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email:process.env[`${prefix}_EMAIL`],password:process.env[`${prefix}_PASSWORD`]}}),200);return {Authorization:`Bearer ${r.access_token}`};}
async function seed(request:APIRequestContext,headers:Record<string,string>,installments=2,date='2041-04-23'){
 const marker=`Finance audit ${randomUUID()}`;
 const pkg=await json(await request.post(`${api}/api/packages`,{headers,data:{name:marker,destination:'Mostar',price:180,currency:'BAM',active:true,transportType:'none',maxParticipants:8}}));
 const dep=await json(await request.post(`${api}/api/departures`,{headers,data:{packageId:pkg.id,departAt:`${date}T08:00:00Z`,returnAt:`${date}T18:00:00Z`,capacity:8,status:'active',transportType:'none'}}));
 const res=await json(await request.post(`${api}/api/reservations`,{headers:{...headers,'Idempotency-Key':randomUUID()},data:{departureId:dep.id,customerName:marker,customerPhone:'+38761000001',partySize:1,reservationAt:`${date}T10:00:00Z`,status:'confirmed',totalAmount:180,currency:'BAM',source:'agent',passengers:[{full_name:marker}],...(installments?{installmentCount:installments}:{})}}));
 return {marker,res,dep,pkg};
}
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`real payment installment edit refund reload ${theme} ${width}`,async({page,request,baseURL},testInfo)=>{
 test.skip(!enabled,'NOT TESTED: disposable local Auth/API required');test.setTimeout(90_000);expect(local(api)&&local(auth)&&local(baseURL!)).toBe(true);
 const headers=await login(request);const {marker,res,dep}=await seed(request,headers);
 await page.setViewportSize({width,height:900});await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/\/auth\/signin/);
 await page.evaluate(theme=>{localStorage.setItem('travline_lang','en');localStorage.setItem('theme',theme);},theme);
 await page.goto(`/reservations/${res.id}`);await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
 await page.getByRole('button',{name:'Uplate',exact:true}).click();await page.getByRole('button',{name:'Evidentiraj uplatu',exact:true}).click();
 const form=page.getByRole('form',{name:'Add Payment',exact:true});
 if(theme==='dark')expect(await form.locator('label').evaluateAll(nodes=>nodes.every(e=>Number(getComputedStyle(e).color.match(/\d+/)?.[0])>=150))).toBe(true);await expect(form.getByLabel('Amount *',{exact:true})).toHaveValue('90');
 await form.getByLabel('Amount *',{exact:true}).fill('12');await form.getByLabel('Method',{exact:true}).selectOption('cash');await form.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Evidentiraj uplatu',exact:true}).click();await expect(form.getByLabel('Amount *',{exact:true})).toHaveValue('90');await expect(form.getByLabel('Method',{exact:true})).toHaveValue('');
 let intercepted=0;await page.route('**/api/payments',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}intercepted++;if(intercepted===1)await route.fulfill({status:503,json:{error:{code:'AUDIT_SYNTHETIC_FAILURE',message:'Synthetic failure'}}});else {await new Promise(r=>setTimeout(r,300));await route.continue();}});
 await form.getByLabel('Method',{exact:true}).selectOption('bank_transfer');await form.getByLabel('Date *',{exact:true}).fill('2041-04-23');
 await form.getByRole('button',{name:'Add Payment',exact:true}).click();await expect(form.getByRole('alert')).toBeVisible();await expect(form.getByLabel('Amount *',{exact:true})).toHaveValue('90');
 await testInfo.attach(`add-form-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 const paying=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/payments')&&r.status()===201);
 await form.evaluate(e=>{e.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));e.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 await page.keyboard.press('Escape');await expect(form).toBeVisible();const paid=await json(await paying);expect(intercepted).toBe(2);expect(paid.reservation.paidAmount).toBe(90);await expect(form).toBeHidden();
 await page.reload();await page.getByRole('button',{name:'Uplate',exact:true}).click();const schedule=await json(await request.get(`${api}/api/reservations/${res.id}/installments`,{headers}),200);expect(schedule.installments.filter((p:any)=>p.status==='succeeded')).toHaveLength(1);expect(schedule.paidAmount).toBe(90);expect(schedule.balanceDue).toBe(90);
 await testInfo.attach(`payment-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 // Open the actual list payment editor, then verify correction and refund against the ledger.
 await page.goto(`/reservations?departureId=${dep.id}`);await page.getByPlaceholder('Traži klijenta ili telefon...').fill(marker);
 const row=page.getByRole('row').filter({hasText:marker});await row.getByRole('button',{name:'Plaćanja',exact:true}).click();
 const modal=page.locator('.modal').first();await modal.getByRole('button',{name:'Refund',exact:true}).locator('..').getByRole('button',{name:'Edit',exact:true}).click();
 const edit=page.getByRole('form',{name:'Edit Payment',exact:true});await edit.getByLabel('Method',{exact:true}).selectOption('card');
 await testInfo.attach(`edit-form-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 const saving=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(`/payments/${paid.payment.id}`));await edit.getByRole('button',{name:'Save',exact:true}).click();await json(await saving,200);await expect(edit).toBeHidden();
 const stored=await json(await request.get(`${api}/api/payments?reservation_id=${res.id}`,{headers}),200);expect(stored.data.find((p:any)=>p.id===paid.payment.id).paymentMethod).toBe('card');
 page.once('dialog',dialog=>dialog.accept('Isolated audit refund'));const refund=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/payments/${paid.payment.id}/refund`));await modal.getByRole('button',{name:'Refund',exact:true}).click();await json(await refund,200);
 const final=await json(await request.get(`${api}/api/reservations/${res.id}`,{headers}),200);expect(final.paidAmount).toBe(0);expect(final.balanceDue).toBe(180);
 await page.reload();await page.getByPlaceholder('Traži klijenta ili telefon...').fill(marker);await page.getByRole('row').filter({hasText:marker}).getByRole('button',{name:'Plaćanja',exact:true}).click();await expect(page.locator('.modal').getByText('Refunded',{exact:true})).toBeVisible();
 await page.locator('.modal').getByRole('button',{name:'+ Add Payment',exact:true}).click();
 const embedded=page.getByRole('form',{name:'Add Payment',exact:true});await embedded.getByLabel('Amount *',{exact:true}).fill('30');
 await testInfo.attach(`embedded-form-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 const adding=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/payments')&&r.status()===201);
 await embedded.getByRole('button',{name:'Add Payment',exact:true}).click();await json(await adding);
 await expect(embedded).toBeHidden();const extra=await json(await request.get(`${api}/api/reservations/${res.id}`,{headers}),200);expect(extra.paidAmount).toBe(30);expect(extra.balanceDue).toBe(150);
 await page.reload();const persisted=await json(await request.get(`${api}/api/payments?reservation_id=${res.id}`,{headers}),200);expect(persisted.data.filter((p:any)=>p.status==='succeeded')).toEqual([expect.objectContaining({amount:30})]);

});
test('refund eligibility concurrent refunds tenant isolation reports and ledger agree',async({request})=>{
 test.skip(!enabled,'NOT TESTED: disposable local Auth/API required');expect(local(api)&&local(auth)).toBe(true);test.setTimeout(60_000);
 const headers=await login(request),other=await login(request,true);const {res}=await seed(request,headers,0);
 const create=async(status:string,amount:number)=>json(await request.post(`${api}/api/payments`,{headers,data:{reservation_id:res.id,amount,status,currency:'BAM',payment_date:'2041-04-23',idempotency_key:randomUUID()}}));
 for(const status of ['pending','failed','cancelled']){const p=await create(status,5);const r=await request.post(`${api}/api/payments/${p.payment.id}/refund`,{headers,data:{}});expect(r.status()).toBe(409);expect((await r.json()).code).toBe('PAYMENT_NOT_REFUNDABLE');}
 const p=await create('succeeded',60);
 expect((await request.patch(`${api}/api/payments/${p.payment.id}`,{headers:other,data:{amount:65}})).status()).toBe(404);
 const corrected=await json(await request.patch(`${api}/api/payments/${p.payment.id}`,{headers,data:{amount:65}}),200);expect(corrected.affectedReservations.find((row:any)=>row.id===res.id).paidAmount).toBe(65);
 expect((await request.post(`${api}/api/payments/${p.payment.id}/refund`,{headers:other,data:{}})).status()).toBe(404);
 const outcomes=await Promise.all([0,1,2].map(()=>request.post(`${api}/api/payments/${p.payment.id}/refund`,{headers,data:{}})));expect(outcomes.filter(r=>r.status()===200)).toHaveLength(1);expect(outcomes.filter(r=>[400,409].includes(r.status()))).toHaveLength(2);
 const final=await json(await request.get(`${api}/api/reservations/${res.id}`,{headers}),200);const payments=await json(await request.get(`${api}/api/payments?reservation_id=${res.id}`,{headers}),200);expect(final.paidAmount).toBe(payments.data.filter((p:any)=>p.status==='succeeded').reduce((sum:number,p:any)=>sum+p.amount,0));expect(final.balanceDue).toBe(180);
 const report=await json(await request.get(`${api}/api/reports/summary?from=2041-04-23&to=2041-04-23&currency=BAM`,{headers}),200);expect(report.paidRevenue).toBeGreaterThanOrEqual(0);expect(report.bookedRevenue).toBe(report.paidRevenue+report.unpaidRevenue);
 expect((await json(await request.get(`${api}/api/payments?reservation_id=${res.id}`,{headers:other}),200)).data).toEqual([]);
});

for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`real financial report and authenticated CSV ${theme} ${width}`,async({page,request,baseURL},testInfo)=>{
 test.skip(!enabled || !process.env.E2E_FINANCE_DIRECTOR_EMAIL,'NOT TESTED: isolated entitled director required');test.setTimeout(90_000);expect(local(api)&&local(auth)&&local(baseURL!)).toBe(true);
 const date=`2042-01-${String((theme==='dark'?3:0)+[390,768,1440].indexOf(width)+1).padStart(2,'0')}`;
 const headers=await login(request,false,true),{res}=await seed(request,headers,0,date);
 await json(await request.post(`${api}/api/payments`,{headers,data:{reservation_id:res.id,amount:60,currency:'BAM',payment_date:date,idempotency_key:randomUUID()}}));
 await page.setViewportSize({width,height:900});await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_FINANCE_DIRECTOR_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_FINANCE_DIRECTOR_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/\/auth\/signin/);
 await page.evaluate(theme=>{localStorage.setItem('travline_lang','en');localStorage.setItem('theme',theme);},theme);await page.goto('/reports');await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
 await expect(page).toHaveURL(/\/reports$/);await page.getByLabel('From:',{exact:true}).fill(date);
 const refresh=page.waitForResponse(r=>r.url().includes('/analytics/overview-v2?')&&new URL(r.url()).searchParams.get('from')===date&&new URL(r.url()).searchParams.get('to')===date);
 await page.getByLabel('To:',{exact:true}).fill(date);const overview=await json(await refresh,200);expect(overview).toMatchObject({total_amount_sum:180,total_paid_sum:60,total_balance_sum:120});
 await expect(page.getByText(/180[,.]00/).first()).toBeVisible();
 const exported=page.waitForResponse(r=>r.url().includes('/analytics/overview.csv?'));const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export Overview CSV',exact:true}).click();const csvResponse=await exported;expect(csvResponse.status()).toBe(200);expect(csvResponse.request().headers().authorization).toMatch(/^Bearer /);expect(await csvResponse.text()).toContain('Total Amount Sum,180.00,BAM');await download;
 const packageExport=page.waitForResponse(r=>r.url().includes('/analytics/by-package.csv?'));const packageDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export Package CSV',exact:true}).click();const packageCSV=await packageExport;expect(packageCSV.status()).toBe(200);expect(packageCSV.request().headers().authorization).toMatch(/^Bearer /);expect(await packageCSV.text()).toContain('180.00,60.00,120.00');await packageDownload;

 const revenueChart=page.locator('svg').filter({hasText:'Total Revenue'}).first();
 expect(await revenueChart.locator('text[text-anchor="end"]').evaluateAll(nodes=>nodes.length===5&&nodes.every(node=>(node as SVGGraphicsElement).getBBox().x>=0))).toBe(true);
 await testInfo.attach(`report-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
 let fail=true;await page.route('**/api/analytics/overview-v2?**',async route=>{if(fail)await route.fulfill({status:503,json:{error:{code:'AUDIT_SYNTHETIC_FAILURE',message:'Synthetic failure'}}});else await route.continue();});
 await page.getByRole('button',{name:'Last 30 Days',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Export Overview CSV',exact:true})).toBeDisabled();fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('alert')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
