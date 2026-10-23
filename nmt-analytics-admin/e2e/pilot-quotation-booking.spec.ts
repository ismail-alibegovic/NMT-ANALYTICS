import {expect,test,type APIRequestContext} from '@playwright/test';
import {en} from '../src/lib/i18n/en';import {bs} from '../src/lib/i18n/bs';
const api=process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const auth=process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured=process.env.E2E_RUN_BROWSER==='1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
async function signIn(request:APIRequestContext,other=false){
 const response=await request.post(`${auth}/auth/v1/token?grant_type=password`,{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{
 email:other?process.env.E2E_OTHER_TENANT_EMAIL:process.env.E2E_MANAGER_EMAIL,password:other?process.env.E2E_OTHER_TENANT_PASSWORD:process.env.E2E_MANAGER_PASSWORD}});
 expect(response.status()).toBe(200);return {Authorization:`Bearer ${(await response.json()).access_token}`};
}
async function expectJson(response:any,status=201){expect(response.status(),await response.text()).toBe(status);return response.json();}
async function seed(request:APIRequestContext,headers:Record<string,string>,capacity=4){
 const marker=`Quote booking ${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
 const itinerary=await expectJson(await request.post(`${api}/api/itineraries`,{headers,data:{title:marker,tripType:'tailor_made',travelStart:'2027-04-10',travelEnd:'2027-04-15',travelers:2,currency:'EUR',destination:'Vienna'}}));
 await expectJson(await request.post(`${api}/api/itineraries/${itinerary.id}/items`,{headers,data:{title:'Approved service',dayNumber:1,quantity:2,unit:'per_day',netUnitPrice:80,markupPercent:10,currency:'EUR'}}));
 const pkg=await expectJson(await request.post(`${api}/api/packages`,{headers,data:{name:marker,destination:'Vienna',price:999,currency:'EUR',itineraryId:itinerary.id,active:true,transportType:'none',maxParticipants:capacity}}));
 const departure=await expectJson(await request.post(`${api}/api/departures`,{headers,data:{packageId:pkg.id,departAt:'2027-04-10T10:00:00Z',returnAt:'2027-04-15T10:00:00Z',capacity,booked:0,status:'active',transportType:'none'}}));
 async function quote(){
  const q=await expectJson(await request.post(`${api}/api/quotations`,{headers,data:{title:marker,itineraryId:itinerary.id,itineraryVersionId:itinerary.versions[0].id}}));
  await expectJson(await request.patch(`${api}/api/quotations/${q.id}`,{headers,data:{status:'accepted'}}),200);return q;
 }
 return {quote:await quote(),another:quote,departure,marker};
}
for(const scenario of [{lang:'bs',width:1440},{lang:'en',width:390}] as const){
 test(`books accepted quotation and preserves price in ${scenario.lang} at ${scenario.width}px`,async({page,request})=>{
  test.skip(!configured,'BLOCKED: isolated Auth/API environment required');test.setTimeout(60_000);
  const headers=await signIn(request);const seeded=await seed(request,headers);const c=(scenario.lang==='bs'?bs:en).quotations;
  await page.setViewportSize({width:scenario.width,height:900});await page.goto('/auth/signin');
  await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
  await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/\/auth\/signin/);
  await page.evaluate(lang=>localStorage.setItem('travline_lang',lang),scenario.lang);await page.goto(`/quotations/${seeded.quote.id}`);
  await page.getByRole('button',{name:c.bookQuote,exact:true}).click();
  const modal=page.locator('.modal');await modal.getByLabel(c.bookingDeparture).selectOption(seeded.departure.id);
  await modal.getByLabel(c.contactName).fill(seeded.marker);await modal.getByLabel(c.bookingPhone).fill('+38761000222');
  await modal.getByLabel(c.bookingNames).fill('Quoted First Traveler\nQuoted Second Traveler');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const pending=page.waitForResponse(r=>r.url().endsWith(`/api/quotations/${seeded.quote.id}/booking`) && r.request().method()==='POST');
  await modal.getByRole('button',{name:c.bookQuote,exact:true}).click();
  const response=await pending;expect(response.status(),await response.text()).toBe(201);const booking=await response.json();
  const payload=response.request().postDataJSON();
  await expect(page.getByRole('link',{name:c.openBooking,exact:true})).toBeVisible();
  const retries=await Promise.all([0,1].map(()=>request.post(`${api}/api/quotations/${seeded.quote.id}/booking`,{headers,data:payload})));
  for(const retry of retries){expect(retry.status(),await retry.text()).toBe(200);expect((await retry.json()).reservation.id).toBe(booking.reservation.id);}
  const reservation=await expectJson(await request.get(`${api}/api/reservations/${booking.reservation.id}`,{headers}),200);
  expect(reservation.quotationId).toBe(seeded.quote.id);expect(reservation.totalAmount).toBe(176);expect(reservation.currency).toBe('EUR');expect(reservation.partySize).toBe(2);
  expect(reservation.options.quotation_snapshot.sellTotal).toBe(176);
  const protectedPatch=await request.patch(`${api}/api/reservations/${booking.reservation.id}`,{headers,data:{totalAmount:1,partySize:3}});
  expect(protectedPatch.status()).toBe(409);
  expect((await request.delete(`${api}/api/reservations/${booking.reservation.id}`,{headers})).status()).toBe(409);
  await page.getByRole('link',{name:c.openBooking,exact:true}).click();
  await expect(page.getByRole('link',{name:c.sourceQuotation,exact:true})).toHaveAttribute('href',`/quotations/${seeded.quote.id}`);
  await page.getByRole('button',{name:scenario.lang==='bs'?'Uredi rezervaciju':'Edit reservation',exact:true}).click();
  await expect(page.locator('.modal input[disabled][type="number"]')).toHaveValue('176');
 });
}
test('serializes first conversion and rejects incompatible, foreign and full requests',async({request})=>{
 test.skip(!configured,'BLOCKED: isolated Auth/API environment required');
 const headers=await signIn(request);const seeded=await seed(request,headers,2);
 const body={departureId:seeded.departure.id,customerName:'Concurrent buyer',customerPhone:'+38761000333',passengers:[{full_name:'Concurrent One'},{full_name:'Concurrent Two'}],totalAmount:1,currency:'BAM'};
 const other=await signIn(request,true);
 expect((await request.post(`${api}/api/quotations/${seeded.quote.id}/booking`,{headers:other,data:body})).status()).toBe(404);
 const wrong=await request.post(`${api}/api/quotations/${seeded.quote.id}/booking`,{headers,data:{...body,departureId:'00000000-0000-4000-8000-000000000099'}});
 expect(wrong.status(),await wrong.text()).toBe(422);
 const responses=await Promise.all([0,1].map(()=>request.post(`${api}/api/quotations/${seeded.quote.id}/booking`,{headers,data:body})));
 expect(responses.map(r=>r.status()).sort()).toEqual([200,201]);
 const a=await responses[0].json();const b=await responses[1].json();expect(a.reservation.id).toBe(b.reservation.id);expect(a.reservation.total_amount).toBe(176);
 const conflict=await request.post(`${api}/api/quotations/${seeded.quote.id}/booking`,{headers,data:{...body,customerName:'Different buyer'}});
 expect(conflict.status()).toBe(409);
 const another=await seeded.another();
 const full=await request.post(`${api}/api/quotations/${another.id}/booking`,{headers,data:body});
 expect(full.status(),await full.text()).toBe(409);expect((await full.json()).code).toBe('DEPARTURE_CAPACITY_EXCEEDED');
 const manifest=await expectJson(await request.get(`${api}/api/departures/${seeded.departure.id}/passengers`,{headers}),200);
 expect((manifest.manifest || manifest.passengers).filter((p:any)=>(p.reservationId || p.reservation_id)===a.reservation.id)).toHaveLength(2);
 const saved=await expectJson(await request.get(`${api}/api/quotations/${seeded.quote.id}`,{headers}),200);
 expect(saved.booking.id).toBe(a.reservation.id);
});
