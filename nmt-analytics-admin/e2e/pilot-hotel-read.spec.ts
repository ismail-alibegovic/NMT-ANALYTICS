import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const api=process.env.E2E_API_URL||'';const auth=process.env.E2E_SUPABASE_URL||'';
test.use({trace:'off',video:'off',screenshot:'off'});
test('commercial hotel identity and directory remain usable outside the first page and across tenants',async({request,page})=>{
 test.skip(process.env.E2E_RUN_BROWSER!=='1','Requires disposable authenticated acceptance');test.setTimeout(90_000);
 expect([api,auth].every(url=>/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))).toBe(true);
 async function login(email:string,password:string){const r=await request.post(auth+'/auth/v1/token?grant_type=password',{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email,password}});expect(r.status()).toBe(200);return{Authorization:'Bearer '+(await r.json()).access_token};}
 const headers=await login(process.env.E2E_FLIGHT_MANAGER_EMAIL!,process.env.E2E_FLIGHT_MANAGER_PASSWORD!);const context=await request.get(api+'/api/me/context',{headers});expect(context.status()).toBe(200);expect((await context.json()).modules).toContain('travel_core');
 const marker='Commercial hotel '+randomUUID();let target='';
 for(let i=0;i<13;i++){
  const r=await request.post(api+'/api/hotels',{headers,data:{name:marker+' '+i,destination:'Synthetic',totalRooms:0}});expect(r.status()).toBe(201);if(i===0)target=(await r.json()).id;
 }
 const first=await request.get(api+'/api/hotels?limit=10',{headers});expect(first.status()).toBe(200);const list=await first.json();
 expect(list.total).toBeGreaterThanOrEqual(13);expect(list.data.some((h:{id:string})=>h.id===target)).toBe(false);
 const identity=await request.get(api+'/api/hotels/'+target,{headers});expect(identity.status()).toBe(200);expect((await identity.json()).name).toBe(marker+' 0');
 const foreign=await login(process.env.E2E_OTHER_TENANT_EMAIL!,process.env.E2E_OTHER_TENANT_PASSWORD!);
 expect((await request.get(api+'/api/hotels/'+target,{headers:foreign})).status()).toBe(404);
 await page.addInitScript(()=>{localStorage.setItem('travline_lang','en');localStorage.setItem('theme','dark');});
 await page.setViewportSize({width:390,height:900});await page.goto('/auth/signin');
 await page.locator('#signin-email').fill(process.env.E2E_FLIGHT_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_FLIGHT_MANAGER_PASSWORD!);
 await page.locator('button[type="submit"]').click();await expect(page).not.toHaveURL(/auth\/signin/);
 await page.goto('/operations/hotels/'+target);await expect(page.getByRole('heading',{name:marker+' 0',exact:true})).toBeVisible();
 await page.goto('/operations/hotels');await expect(page.getByText(marker+' 0',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
});
