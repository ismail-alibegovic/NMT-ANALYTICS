import { expect, test, type APIRequestContext } from '@playwright/test';
import { en } from '../src/lib/i18n/en'; import { bs } from '../src/lib/i18n/bs';
const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const auth = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
async function login(request: APIRequestContext, role: 'manager'|'staff'|'other' = 'manager') {
  const prefix = role === 'other' ? 'E2E_OTHER_TENANT' : role === 'staff' ? 'E2E_STAFF' : 'E2E_MANAGER';
  const response = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: { email: process.env[`${prefix}_EMAIL`], password: process.env[`${prefix}_PASSWORD`] },
  });
  expect(response.status()).toBe(200); return { Authorization: `Bearer ${(await response.json()).access_token}` };
}
async function json(response: any, status = 201) { expect(response.status(), await response.text()).toBe(status); return response.json(); }
async function seed(request: APIRequestContext, headers: Record<string,string>, linked = true) {
  const marker = `Supplier ledger ${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const supplier = await json(await request.post(`${api}/api/suppliers`, { headers, data: { name: marker, category: 'transport', defaultCurrency: 'BAM' } }));
  const pkg = await json(await request.post(`${api}/api/packages`, { headers, data: { name: marker, destination: 'Mostar', price: 180, currency: 'BAM', active: true, transportType: 'none', maxParticipants: 8 } }));
  const departure = await json(await request.post(`${api}/api/departures`, { headers, data: { packageId: pkg.id, departAt: '2027-07-10T10:00:00Z', returnAt: '2027-07-11T10:00:00Z', capacity: 8, status: 'active', transportType: 'none' } }));
  const { costItem } = await json(await request.post(`${api}/api/departures/${departure.id}/cost-items`, { headers, data: { category: 'transport', label: marker, supplierId: linked ? supplier.id : null, quantity: 2, unitCost: 50, currency: 'BAM' } }));
  return { marker, supplier, departure, cost: costItem };
}
for (const scenario of [{ lang: 'bs', width: 1440 }, { lang: 'en', width: 390 }] as const) {
  test(`issues pays reverses and cancels a supplier obligation in ${scenario.lang} at ${scenario.width}px`, async ({ page, request }) => {
    test.skip(!configured, 'BLOCKED: isolated Auth/API required'); test.setTimeout(90_000);
    const headers = await login(request), seeded = await seed(request, headers, false), copy = scenario.lang === 'bs' ? bs : en, c = copy.supplierPayables;
    await page.setViewportSize({ width: scenario.width, height: 900 }); await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!); await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).not.toHaveURL(/\/auth\/signin/);
    await page.evaluate(lang => localStorage.setItem('travline_lang', lang), scenario.lang);
    await page.goto(`/departures/${seeded.departure.id}?tab=finance`);
    const panel = page.getByRole('region', { name: c.title });
    const modal = page.locator('.modal');
    await page.getByRole('button', { name: copy.departure.finance.edit, exact: true }).click();
    await modal.getByLabel(c.supplier, { exact: true }).selectOption(seeded.supplier.id);
    const linking = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/cost-items/${seeded.cost.id}`));
    await modal.getByRole('button', { name: copy.common.save, exact: true }).click(); await json(await linking, 200);
    await expect(modal).toBeHidden();
    await panel.getByRole('button', { name: c.issue, exact: true }).click();
    await modal.getByLabel(c.costItem).selectOption(seeded.cost.id); await modal.getByLabel(c.dueDate).fill('2000-01-01');
    const issuing = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/departures/${seeded.departure.id}/supplier-payables`));
    await modal.getByRole('button', { name: c.confirm, exact: true }).click();
    const issued = await json(await issuing); const payableId = issued.record.id;
    const row = panel.locator(`[data-payable-id="${payableId}"]`);
    await expect(row.getByText(c.status.unpaid, { exact: true })).toBeVisible();
    await row.getByRole('button', { name: c.record, exact: true }).click();
    await modal.getByLabel(c.amount, { exact: true }).fill('60'); await modal.getByLabel(c.paymentDate).fill('2026-10-15');
    await modal.getByLabel(c.reference).fill('Recorded test transfer');
    const paying = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/supplier-payables/${payableId}/entries`));
    await modal.getByRole('button', { name: c.confirm, exact: true }).click(); const payment = await json(await paying);
    await expect(row.getByText(c.status.partial, { exact: true })).toBeVisible();
    await expect(row.locator('dd').nth(2)).toContainText(/40[,.]00 BAM/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const payload = (await paying).request().postDataJSON();
    const retry = await json(await request.post(`${api}/api/supplier-payables/${payableId}/entries`, { headers, data: payload }), 200);
    expect(retry.record.id).toBe(payment.record.id);
    await page.goto('/finance');
    const overview = page.getByRole('region', { name: copy.supplierPayablesOverview.title });
    await expect(overview.getByLabel(c.supplier,{exact:true}).locator('option', { hasText: seeded.marker })).toHaveCount(1);
    await overview.getByLabel(c.supplier,{exact:true}).selectOption(seeded.supplier.id);
    await overview.getByLabel(copy.supplierPayablesOverview.filter).selectOption('overdue');
    await expect(overview.locator('[data-currency="BAM"]').getByText(/40[,.]00 BAM/)).toHaveCount(2);
    await expect(overview.locator(`[data-payable-id="${payableId}"]`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await overview.locator(`[data-payable-id="${payableId}"]`).getByRole('link',{name:copy.supplierPayablesOverview.openDeparture}).click();
    await expect(page).toHaveURL(new RegExp(`/departures/${seeded.departure.id}\\?tab=finance`));
    await expect(row).toBeVisible();
    const locked = await request.patch(`${api}/api/departures/${seeded.departure.id}/cost-items/${seeded.cost.id}`, { headers, data: { unitCost: 1 } });
    expect(locked.status()).toBe(409); expect((await locked.json()).code).toBe('PAYABLE_COST_LOCKED');
    await page.getByRole('button', { name: copy.departure.finance.edit, exact: true }).click();
    await modal.getByLabel(copy.departure.finance.unitCost, { exact: true }).fill('1');
    const blockedEdit = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/cost-items/${seeded.cost.id}`));
    await modal.getByRole('button', { name: copy.common.save, exact: true }).click(); expect((await blockedEdit).status()).toBe(409);
    await expect(modal.getByRole('alert')).toHaveText(c.sourceLocked);
    await modal.getByRole('button', { name: copy.common.cancel, exact: true }).click();
    await expect(modal).toBeHidden();
    await row.locator('summary').click(); await row.getByRole('button', { name: c.reverse, exact: true }).click();
    await modal.getByLabel(c.paymentDate).fill('2026-10-15'); await modal.getByLabel(c.note).fill('Erroneous test entry');
    const reversing = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/supplier-payables/${payableId}/entries`));
    await modal.getByRole('button', { name: c.confirm, exact: true }).click(); await json(await reversing);
    await expect(row.getByText(c.status.unpaid, { exact: true })).toBeVisible();
    await expect(row.locator('li')).toHaveCount(2);
    await row.getByRole('button', { name: c.cancel, exact: true }).click();
    const cancelling = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/supplier-payables/${payableId}/cancel`));
    await modal.getByRole('button', { name: c.confirm, exact: true }).click(); await json(await cancelling, 200);
    await expect(row.getByText(c.status.cancelled, { exact: true })).toBeVisible();
    const corrected = await json(await request.patch(`${api}/api/departures/${seeded.departure.id}/cost-items/${seeded.cost.id}`, { headers, data: { unitCost: 70 } }), 200);
    expect(corrected.costItem.totalCost).toBe(140);
    const profit = await json(await request.get(`${api}/api/departures/${seeded.departure.id}/profitability`, { headers }), 200);
    expect(profit.supplierCosts).toBe(140); // The payment/reversal never becomes another cost.
    await page.reload(); await expect(panel.locator(`[data-payable-id="${payableId}"]`).getByText(c.status.cancelled, { exact: true })).toBeVisible();
  });
}
test('supplier ledger serializes payments and rejects foreign roles organizations and excess money', async ({ request }) => {
  test.skip(!configured, 'BLOCKED: isolated Auth/API required'); test.setTimeout(60_000);
  const headers = await login(request), seeded = await seed(request, headers), other = await login(request, 'other'), staff = await login(request, 'staff');
  const issue = { requestId: crypto.randomUUID(), costItemId: seeded.cost.id, dueDate: '2027-07-01' };
  const url = `${api}/api/departures/${seeded.departure.id}/supplier-payables`;
  expect((await request.post(url, { headers: staff, data: issue })).status()).toBe(403);
  expect((await request.post(url, { headers: other, data: issue })).status()).toBe(404);
  const issued = await json(await request.post(url, { headers, data: { ...issue, amount: 1, currency: 'EUR' } }));
  const p = issued.record; expect(Number(p.amount)).toBe(100); expect(p.currency).toBe('BAM');
  expect((await json(await request.post(url, { headers, data: issue }), 200)).record.id).toBe(p.id);
  expect((await request.post(url, { headers, data: { ...issue, requestId: crypto.randomUUID() } })).status()).toBe(409);
  const entriesUrl = `${api}/api/supplier-payables/${p.id}/entries`;
  const bodies = [0,1].map(() => ({ requestId: crypto.randomUUID(), currency: 'BAM', kind: 'payment', amount: 70, paymentDate: '2026-10-15', note: '', reference: '' }));
  const responses = await Promise.all(bodies.map(data => request.post(entriesUrl, { headers, data })));
  expect(responses.map(r => r.status()).sort()).toEqual([201,409]);
  const winner = responses.findIndex(r => r.status() === 201);
  const record = (await responses[winner].json()).record;
  expect((await json(await request.post(entriesUrl, { headers, data: bodies[winner] }), 200)).record.id).toBe(record.id);
  expect((await request.post(entriesUrl, { headers, data: { ...bodies[winner], amount: 1 } })).status()).toBe(409);
  expect((await request.post(entriesUrl, { headers: other, data: bodies[winner] })).status()).toBe(404);
  expect((await request.post(entriesUrl, { headers: staff, data: bodies[winner] })).status()).toBe(403);
  expect((await request.get(url, { headers: other })).status()).toBe(404);
  const ledger = await json(await request.get(url, { headers }), 200);
  expect((await request.get(`${api}/api/supplier-payables`, { headers:staff })).status()).toBe(403);
  const foreignOverview = await json(await request.get(`${api}/api/supplier-payables?supplierId=${seeded.supplier.id}&status=all`,{headers:other}),200);
  expect(foreignOverview.totalCount).toBe(0); expect(foreignOverview.payables).toEqual([]);
  expect(foreignOverview.suppliers.some((s:any)=>s.id===seeded.supplier.id)).toBe(false);
  expect(ledger.payables[0]).toMatchObject({ paid: 70, remaining: 30, status: 'partial' }); expect(ledger.payables[0].entries).toHaveLength(1);
  const deleted = await request.delete(`${api}/api/departures/${seeded.departure.id}/cost-items/${seeded.cost.id}`, { headers }); expect(deleted.status()).toBe(409);
  const fractional = await request.post(entriesUrl, { headers, data: { ...bodies[0], requestId: crypto.randomUUID(), amount: 0.001 } }); expect(fractional.status()).toBe(400);
  const wrongCurrency = await request.post(entriesUrl, { headers, data: { ...bodies[0], requestId: crypto.randomUUID(), amount: 1, currency: 'EUR' } }); expect(wrongCurrency.status()).toBe(422);
});
