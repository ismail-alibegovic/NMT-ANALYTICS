import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const api=process.env.E2E_API_URL||'';const auth=process.env.E2E_SUPABASE_URL||'';
test.use({trace:'off',video:'off',screenshot:'off'});
test('commercial hotel stock is explicit, concurrent, tenant-safe and protected from direct Data API writes',async({request,page})=>{
 test.skip(process.env.E2E_RUN_BROWSER!=='1','Requires disposable authenticated acceptance');test.setTimeout(90_000);
 expect([api,auth].every(url=>/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))).toBe(true);
 const login=async(email:string,password:string)=>{
  const r=await request.post(auth+'/auth/v1/token?grant_type=password',{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email,password}});expect(r.status()).toBe(200);return{Authorization:'Bearer '+(await r.json()).access_token};
 };
 const headers=await login(process.env.E2E_FLIGHT_MANAGER_EMAIL!,process.env.E2E_FLIGHT_MANAGER_PASSWORD!);
 const context=await request.get(api+'/api/me/context',{headers});expect(context.status()).toBe(200);expect((await context.json()).modules).toContain('travel_core');
 const marker='Synthetic stock '+randomUUID();
 const created=await request.post(api+'/api/hotels',{headers,data:{name:marker,destination:'Synthetic',totalRooms:1,amenities:[]}});
 expect(created.status()).toBe(201);const hotel=await created.json();expect(hotel.amenities).toEqual([]);
 const initial=await request.get(api+`/api/hotels/${hotel.id}/rooms`,{headers});expect(initial.status()).toBe(200);const defaults=await initial.json();
 expect(defaults).toHaveLength(4);expect(defaults.every((r:{total:number;available:number})=>r.total===0&&r.available===0)).toBe(true);
 const room=await request.post(api+`/api/hotels/${hotel.id}/rooms`,{headers,data:{roomType:'family',capacity:4,quantity:3,basePrice:12.34,currency:'EUR'}});
 expect(room.status()).toBe(201);expect(await room.json()).toMatchObject({capacity:4,total:3,available:3,room_type:'family',currency:'EUR'});
 const concurrent=await Promise.all([['twin',2],['suite',3]].map(([roomType,quantity])=>request.post(api+`/api/hotels/${hotel.id}/rooms`,{headers,data:{roomType,capacity:2,quantity,basePrice:0,currency:'BAM'}})));
 for(const result of concurrent)expect(result.status()).toBe(201);
 const reloaded=await request.get(api+`/api/hotels/${hotel.id}`,{headers});expect(reloaded.status()).toBe(200);const saved=await reloaded.json();
 expect(saved.totalRooms).toBe(8);expect(saved.rooms.reduce((sum:number,r:{total:number})=>sum+r.total,0)).toBe(8);
 const lowered=await request.patch(api+`/api/hotels/${hotel.id}`,{headers,data:{totalRooms:7}});expect(lowered.status()).toBe(409);
 const invalid=await request.post(api+`/api/hotels/${hotel.id}/rooms`,{headers,data:{roomType:'invalid',capacity:-1,quantity:4,basePrice:-1}});expect(invalid.status()).toBe(400);
 const foreign=await login(process.env.E2E_OTHER_TENANT_EMAIL!,process.env.E2E_OTHER_TENANT_PASSWORD!);
 expect((await request.post(api+`/api/hotels/${hotel.id}/rooms`,{headers:foreign,data:{roomType:'foreign',capacity:2,quantity:1,basePrice:0}})).status()).toBe(404);
 for(const browserHeaders of [{apikey:process.env.E2E_SUPABASE_ANON_KEY!},{apikey:process.env.E2E_SUPABASE_ANON_KEY!,...headers}]){
  const direct=await request.post(auth+'/rest/v1/rpc/create_hotel_room_inventory',{headers:browserHeaders,data:{p_org_id:hotel.orgId,p_hotel_id:hotel.id,p_room:{roomType:'bypass',capacity:2,quantity:100}}});expect([401,403]).toContain(direct.status());
 }
 await page.setViewportSize({width:390,height:900});await page.addInitScript(()=>{localStorage.setItem('travline_lang','en');localStorage.setItem('theme','dark');});
 await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_FLIGHT_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_FLIGHT_MANAGER_PASSWORD!);await page.locator('button[type="submit"]').click();await expect(page).not.toHaveURL(/auth\/signin/);
 await page.goto('/operations/hotels?hotelId='+hotel.id);const dialog=page.getByRole('dialog');await expect(dialog.getByText('family',{exact:true})).toBeVisible();await expect(dialog.getByLabel('Number of rooms',{exact:true})).toHaveValue('1');
 await expect(dialog.getByText('family',{exact:true}).locator('..').getByText('3/3 Available',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
});
