import {expect,test} from '@playwright/test';
const configured=process.env.E2E_RUN_BROWSER==='1'&&process.env.E2E_MANAGER_EMAIL&&process.env.E2E_MANAGER_PASSWORD&&process.env.E2E_SUPABASE_ANON_KEY&&process.env.E2E_RECOVERY_RESERVATION_ID;
const api=process.env.E2E_API_URL||'http://127.0.0.1:3001',auth=process.env.E2E_SUPABASE_URL||'http://127.0.0.1:54321';
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`cards, commission controls and reservation tabs fit ${theme} ${width}`,async({page,request},info)=>{
 test.skip(!configured,'BLOCKED: isolated acceptance environment required');test.setTimeout(90_000);await page.setViewportSize({width,height:900});await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('travline_lang','en');},theme);
 const token=await request.post(`${auth}/auth/v1/token?grant_type=password`,{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email:process.env.E2E_MANAGER_EMAIL,password:process.env.E2E_MANAGER_PASSWORD}});expect(token.status()).toBe(200);const headers={Authorization:`Bearer ${(await token.json()).access_token}`};
 const marker=`LongSyntheticUnbrokenTitleForMobileViewportAudit${Date.now()}${theme}${width}`;
 const itinerary=await request.post(`${api}/api/itineraries`,{headers,data:{title:marker,tripType:'tailor_made',travelers:2,currency:'BAM',destination:'Mostar'}});expect(itinerary.status(),await itinerary.text()).toBe(201);
 const quote=await request.post(`${api}/api/quotations`,{headers,data:{title:marker,currency:'BAM'}});expect(quote.status(),await quote.text()).toBe(201);
 await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/auth\/signin/);
 for(const route of ['/itineraries','/quotations','/operations/commission-rules',`/reservations/${process.env.E2E_RECOVERY_RESERVATION_ID}`]){
  await page.goto(route,{waitUntil:'networkidle'});await expect(page.locator('html')).toHaveClass(theme==='dark'?/dark/:/^$/);
  if(route==='/itineraries'||route==='/quotations')await expect(page.getByRole('heading',{name:marker,exact:true})).toBeVisible();
  if(route==='/operations/commission-rules'){
   const button=page.getByRole('button',{name:'Izračunaj',exact:true});const box=await button.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
   await page.getByLabel('Partner',{exact:true}).selectOption('gold');await page.getByLabel('Usluga',{exact:true}).selectOption('transport');await page.getByLabel('Iznos',{exact:true}).fill('2500');
   await button.click();await expect(page.getByText('Finalni iznos',{exact:true})).toBeVisible();
  }
  if(route.startsWith('/reservations/')){
   await page.getByRole('button',{name:'Dokumenti',exact:true}).click();await page.getByRole('button',{name:'Pregled',exact:true}).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route).toBe(true);
  await page.screenshot({path:info.outputPath(`${route.replace(/[^a-z0-9]/gi,'_')}.png`),fullPage:true});
 }
});
