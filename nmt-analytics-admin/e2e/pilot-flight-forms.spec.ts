import { expect, test } from '@playwright/test';

const base = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
const localOnly = [base, process.env.E2E_BASE_URL || base, process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321'].every(url => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url));

for (const theme of ['light','dark']) for (const width of [390,768,1440]) {
 test(`Flight real isolated create/edit/reload/cancel ${theme} ${width}`, async ({page,request},info)=>{
  test.skip(!configured,'Requires isolated acceptance Auth/API');
  expect(localOnly, 'Flight acceptance refuses non-local APIs').toBe(true);
  await page.setViewportSize({width,height:900});
  await page.addInitScript(({theme})=>{localStorage.setItem('travline_lang','en');localStorage.setItem('theme',theme)}, {theme});
  await page.goto('/auth/signin');
  await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
  await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
  await page.getByRole('button',{name:/sign in/i}).click();
  await expect(page).not.toHaveURL(/\/auth\/signin/);
  const token=await page.evaluate(()=>localStorage.getItem('nmt_auth_token'));
  expect(token).toBeTruthy();
  const headers={Authorization:`Bearer ${token}`};
  const marker=`Flight form ${theme} ${width} ${Date.now()}`;
  let flightId: string | undefined;
  try {
   await page.goto('/operations/flights');
   await page.getByRole('button',{name:'New flight',exact:true}).first().click();
   const dialog=page.getByRole('dialog',{name:'New flight',exact:true});
   await expect(dialog).toBeVisible();
   await page.getByLabel(/^Airline/).fill(marker);
   await page.getByLabel(/^Flight number/).fill(`T${width}`);
   await page.getByLabel(/^Departure airport/).fill('sjj');
   await page.getByLabel(/^Arrival airport/).fill('ist');
   await page.getByLabel(/^Departure time/).fill('2027-07-15T10:00');
   await page.getByLabel(/^Arrival time/).fill('2027-07-15T12:00');
   await page.getByLabel('Base price').fill('0');
   await dialog.evaluate(el=>{el.scrollTop=0});
   await info.attach(`flight-${theme}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
   const post=page.waitForResponse(r=>r.url().endsWith('/api/flights')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Create',exact:true}).click();
   const created=await post;expect(created.status(),await created.text()).toBe(201);
   flightId=(await created.json()).id;
   await expect(dialog).toBeHidden();
   await page.reload();
   await page.getByPlaceholder('Search flights...').fill(marker);
   const row=page.getByRole('row').filter({hasText:marker});
   await row.getByRole('button',{name:'Edit',exact:true}).click();
   const edit=page.getByRole('dialog',{name:'Edit flight',exact:true});
   await expect(page.getByLabel(/^Departure time/)).toHaveValue('2027-07-15T10:00');
   await expect(page.getByLabel('Base price')).toHaveValue('0');
   await page.getByLabel('Notes',{exact:true}).fill('Saved isolated edit');
   const patch=page.waitForResponse(r=>r.url().endsWith(`/api/flights/${flightId}`)&&r.request().method()==='PATCH');
   await page.getByRole('button',{name:'Save changes',exact:true}).click();
   expect((await patch).status()).toBe(200);
   await expect(edit).toBeHidden();
   await page.reload();
   await page.getByPlaceholder('Search flights...').fill(marker);
   await row.getByRole('button',{name:'Edit',exact:true}).click();
   await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('Saved isolated edit');
   await page.getByLabel('Notes',{exact:true}).fill('Cancelled edit');
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   const stored=await request.get(`${base}/api/flights/${flightId}`,{headers});
   expect(stored.status()).toBe(200);
   const flight=await stored.json();
   expect(flight.notes).toBe('Saved isolated edit');
   expect(flight.basePrice).toBe(0);
   expect(flight.departureAirport).toBe('SJJ');
   const iso=await page.evaluate(()=>new Date('2027-07-15T10:00').toISOString());
   expect(new Date(flight.departureTime).toISOString()).toBe(iso);
  } finally {
   if(flightId) expect((await request.delete(`${base}/api/flights/${flightId}`,{headers})).status()).toBe(200);
  }
 });
}
