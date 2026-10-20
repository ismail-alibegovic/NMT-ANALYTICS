import {test,expect} from '@playwright/test';
const configured=process.env.E2E_RUN_BROWSER==='1'&&process.env.E2E_MANAGER_EMAIL&&process.env.E2E_MANAGER_PASSWORD&&process.env.E2E_SUPABASE_ANON_KEY;
const api=process.env.E2E_API_URL||'http://127.0.0.1:3001',auth=process.env.E2E_SUPABASE_URL||'http://127.0.0.1:54321';
test.use({timezoneId:'Europe/Sarajevo'});
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`departure edit preserves UTC instant ${theme} ${width}`,async({page,request})=>{
 test.skip(!configured,'BLOCKED: isolated acceptance environment required');test.setTimeout(60_000);
 await page.setViewportSize({width,height:900});await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('travline_lang','en');},theme);
 const login=await request.post(`${auth}/auth/v1/token?grant_type=password`,{headers:{apikey:process.env.E2E_SUPABASE_ANON_KEY!},data:{email:process.env.E2E_MANAGER_EMAIL,password:process.env.E2E_MANAGER_PASSWORD}});expect(login.status()).toBe(200);const headers={Authorization:`Bearer ${(await login.json()).access_token}`};
 const marker=`Time audit ${theme} ${width} ${Date.now()}`;const pkg=await request.post(`${api}/api/packages`,{headers,data:{name:marker,destination:'Mostar',price:50,currency:'BAM',active:true,transportType:'bus',maxParticipants:8}});expect(pkg.status()).toBe(201);
 const departure=await request.post(`${api}/api/departures`,{headers,data:{packageId:(await pkg.json()).id,departAt:'2027-07-15T07:00:00Z',returnAt:'2027-07-15T20:00:00Z',capacity:8,status:'active',booked:0,transportType:'bus'}});expect(departure.status()).toBe(201);const id=(await departure.json()).id;
 await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/auth\/signin/);
 await page.goto('/departures');await page.getByPlaceholder('Traži polaske...').fill(marker);await page.getByRole('row').filter({hasText:marker}).getByRole('button',{name:'Uredi',exact:true}).click();
 const modal=page.locator('.modal');await expect(modal.locator('input[type="datetime-local"]').first()).toHaveValue('2027-07-15T09:00');
 const saved=page.waitForResponse(r=>r.url().endsWith(`/api/departures/${id}`)&&r.request().method()==='PATCH');await modal.getByRole('button',{name:'Sačuvaj',exact:true}).click();expect((await saved).status()).toBe(200);await expect(modal).toBeHidden();
 await page.reload();await page.getByPlaceholder('Traži polaske...').fill(marker);await page.getByRole('row').filter({hasText:marker}).getByRole('button',{name:'Uredi',exact:true}).click();await expect(modal.locator('input[type="datetime-local"]').first()).toHaveValue('2027-07-15T09:00');
 const persisted=await request.get(`${api}/api/departures/${id}`,{headers});expect(persisted.status()).toBe(200);const body=await persisted.json();expect(new Date(body.depart_at??body.departAt).toISOString()).toBe('2027-07-15T07:00:00.000Z');
});
