import { expect, test, type APIRequestContext } from '@playwright/test';
import { en } from '../src/lib/i18n/en';
import { bs } from '../src/lib/i18n/bs';
const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const authUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
async function authenticate(request: APIRequestContext, other = false) {
  const response = await request.post(`${authUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: {email: other ? process.env.E2E_OTHER_TENANT_EMAIL : process.env.E2E_MANAGER_EMAIL,
      password: other ? process.env.E2E_OTHER_TENANT_PASSWORD : process.env.E2E_MANAGER_PASSWORD},
  });
  expect(response.status()).toBe(200);
  return {Authorization: `Bearer ${(await response.json()).access_token}`};
}
async function create(request: APIRequestContext, headers: Record<string,string>, items: unknown[]) {
  const response = await request.post(`${apiUrl}/api/quotations`, {headers, data: {
    title: `Approval ${Date.now()}-${Math.random()}`, items,
  }});
  expect(response.status(),await response.text()).toBe(201);
  return response.json();
}
for (const scenario of [{lang:'bs',width:1440}, {lang:'en',width:390}] as const) {
  test(`locks accepted standalone quotation in ${scenario.lang} at ${scenario.width}px`, async ({page,request}) => {
    test.skip(!configured,'BLOCKED: isolated Auth/API environment required');
    const headers = await authenticate(request);
    const copy = scenario.lang === 'bs' ? bs : en;
    const quote = await create(request,headers,[{title:'Approved pilot transfer',quantity:1,netUnitPrice:100,markupPercent:10,currency:'EUR'}]);
    await page.setViewportSize({width:scenario.width,height:900});
    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button',{name:/sign in/i}).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await page.evaluate(lang=>localStorage.setItem('travline_lang',lang),scenario.lang);
    await page.goto(`/quotations/${quote.id}`);
    await expect(page.getByRole('button',{name:copy.quotations.editItem,exact:true})).toBeVisible();
    await page.getByRole('button',{name:copy.quotations.markSent,exact:true}).click();
    await page.getByRole('button',{name:copy.quotations.markAccepted,exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:copy.quotations.acceptedLocked})).toBeVisible();
    await expect(page.getByText('Approved pilot transfer',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:copy.quotations.editItem,exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:copy.quotations.addItem,exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const saved = await (await request.get(`${apiUrl}/api/quotations/${quote.id}`,{headers})).json();
    expect(saved.sellTotal).toBe(110); expect(saved.netTotal).toBe(100); expect(saved.commercialLocked).toBe(true);
    const attempts = await Promise.all([
      request.post(`${apiUrl}/api/quotations/${quote.id}/items`,{headers,data:{title:'Changed',netUnitPrice:999}}),
      request.patch(`${apiUrl}/api/quotations/${quote.id}/items/${saved.items[0].id}`,{headers,data:{title:'Changed',netUnitPrice:999}}),
      request.delete(`${apiUrl}/api/quotations/${quote.id}/items/${saved.items[0].id}`,{headers}),
      request.patch(`${apiUrl}/api/quotations/${quote.id}`,{headers,data:{status:'draft'}}),
    ]);
    for(const response of attempts) {
      expect(response.status(),await response.text()).toBe(409);
      expect((await response.json()).code).toBe('QUOTATION_LOCKED');
    }
    const other = await authenticate(request,true);
    const denied = await request.patch(`${apiUrl}/api/quotations/${quote.id}`,{headers:other,data:{internalNotes:'Denied'}});
    expect(denied.status()).toBe(404);
    const note = await request.patch(`${apiUrl}/api/quotations/${quote.id}`,{headers,data:{internalNotes:'Operations review',status:'rejected'}});
    expect(note.status()).toBe(200);
    expect((await note.json()).acceptedAt).toBe(saved.acceptedAt);
    const late = await request.delete(`${apiUrl}/api/quotations/${quote.id}/items/${saved.items[0].id}`,{headers});
    expect(late.status()).toBe(409);
  });
}
test('approval serializes concurrent item editing and rejects empty or mixed-currency pricing',async({request})=>{
  test.skip(!configured,'BLOCKED: isolated Auth/API environment required');
  const headers = await authenticate(request);
  const quote = await create(request,headers,[{title:'Concurrent price',quantity:1,netUnitPrice:100,markupPercent:10,currency:'EUR'}]);
  const saved = await (await request.get(`${apiUrl}/api/quotations/${quote.id}`,{headers})).json();
  const [approval,edit] = await Promise.all([
    request.patch(`${apiUrl}/api/quotations/${quote.id}`,{headers,data:{status:'accepted'}}),
    request.patch(`${apiUrl}/api/quotations/${quote.id}/items/${saved.items[0].id}`,{headers,data:{title:'Concurrent price',quantity:1,netUnitPrice:1000,markupPercent:10,currency:'EUR'}}),
  ]);
  expect(approval.status(),await approval.text()).toBe(200);
  expect([200,409]).toContain(edit.status());
  const final = await (await request.get(`${apiUrl}/api/quotations/${quote.id}`,{headers})).json();
  expect(final.status).toBe('accepted'); expect(final.commercialLocked).toBe(true);
  expect(final.netTotal).toBe(final.items[0].netUnitPrice);
  expect(final.sellTotal).toBeCloseTo(final.items[0].netUnitPrice*1.1,2);
  for(const items of [[],[{title:'EUR',netUnitPrice:10,currency:'EUR'},{title:'BAM',netUnitPrice:10,currency:'BAM'}]]) {
    const invalid = await create(request,headers,items);
    const response = await request.patch(`${apiUrl}/api/quotations/${invalid.id}`,{headers,data:{status:'accepted'}});
    expect(response.status(),await response.text()).toBe(422);
    expect((await response.json()).code).toBe('QUOTATION_INVALID_PRICING');
    const stillDraft = await (await request.get(`${apiUrl}/api/quotations/${invalid.id}`,{headers})).json();
    expect(stillDraft.status).toBe('draft'); expect(stillDraft.acceptedAt).toBeNull(); expect(stillDraft.commercialLocked).toBe(false);
  }
});
