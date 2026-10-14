import { expect, test } from '@playwright/test';
import { en } from '../src/lib/i18n/en';
import { bs } from '../src/lib/i18n/bs';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const authUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;

for (const scenario of [{ lang: 'bs', width: 1440 }, { lang: 'en', width: 390 }] as const) {
  test(`preserves inquiry and quotation version in ${scenario.lang} at ${scenario.width}px`, async ({ page, request }) => {
    test.skip(!configured, 'BLOCKED: isolated Auth/API environment required');
    test.setTimeout(60_000);
    await page.setViewportSize({ width: scenario.width, height: 900 });
    const copy = scenario.lang === 'bs' ? bs : en;
    async function authenticate(email: string, password: string) {
      const response = await request.post(`${authUrl}/auth/v1/token?grant_type=password`, {
        headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! }, data: { email, password },
      });
      expect(response.status()).toBe(200);
      return { Authorization: `Bearer ${(await response.json()).access_token}` };
    }
    const headers = await authenticate(process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!);
    const marker = `Inquiry ${scenario.lang} ${Date.now()}`;
    const inquiryResponse = await request.post(`${apiUrl}/api/inquiries`, { headers, data: {
      contactName: marker, phone: '+38761000004', tripType: 'tailor_made', source: 'phone',
      destination: 'Vienna', travelStart: '2027-04-10', travelEnd: '2027-04-15', travelers: 4, currency: 'EUR',
    } });
    expect(inquiryResponse.status(), await inquiryResponse.text()).toBe(201);
    const inquiryId = (await inquiryResponse.json()).id;

    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await page.evaluate(lang => localStorage.setItem('travline_lang', lang), scenario.lang);
    await page.goto('/inquiries');
    const card = page.locator('article').filter({ hasText: marker });
    await card.getByRole('button', { name: copy.inquiries.createItinerary }).click();
    const form = page.locator('.modal');
    await expect(form.locator('input').first()).toHaveValue(`Vienna — ${marker}`);
    await expect(form.locator('input[type="date"]').nth(0)).toHaveValue('2027-04-10');
    await expect(form.locator('input[type="date"]').nth(1)).toHaveValue('2027-04-15');
    await expect(form.locator('input[type="number"]')).toHaveValue('4');
    const createdItinerary = page.waitForResponse(response => response.url().endsWith('/api/itineraries') && response.request().method() === 'POST');
    await form.getByRole('button', { name: copy.itineraries.create, exact: true }).click();
    const itineraryResponse = await createdItinerary;
    expect(itineraryResponse.status(), await itineraryResponse.text()).toBe(201);
    const itinerary = await itineraryResponse.json();
    expect(itinerary.inquiryId).toBe(inquiryId);
    expect(itinerary.currency).toBe('EUR');
    expect(itinerary.travelers).toBe(4);
    const versionId = itinerary.versions[0].id;
    const itemResponse = await request.post(`${apiUrl}/api/itineraries/${itinerary.id}/items`, { headers, data: {
      title: `${marker} service`, dayNumber: 1, sortOrder: 0, category: 'guide', quantity: 2,
      unit: 'per_day', netUnitPrice: 80, currency: 'EUR', markupPercent: 10, included: true,
    } });
    expect(itemResponse.status(), await itemResponse.text()).toBe(201);
    const itemId = (await itemResponse.json()).id;
    await page.goto(`/itineraries/${itinerary.id}`);
    await page.getByRole('button', { name: copy.itineraries.createQuotation, exact: true }).click();
    await expect(form.locator('input').first()).toHaveValue(`${copy.quotations.offerFor}: Vienna — ${marker}`);
    await form.locator('input[type="date"]').fill('2027-04-01');
    const createdQuotation = page.waitForResponse(response => response.url().endsWith('/api/quotations') && response.request().method() === 'POST');
    await form.getByRole('button', { name: copy.quotations.create, exact: true }).click();
    const quoteResponse = await createdQuotation;
    expect(quoteResponse.status(), await quoteResponse.text()).toBe(201);
    const quote = await quoteResponse.json();
    expect(quote.itineraryId).toBe(itinerary.id);
    expect(quote.itineraryVersionId).toBe(versionId);
    expect(quote.currency).toBe('EUR');
    expect(quote.netTotal).toBe(160);
    expect(quote.sellTotal).toBe(176);
    await expect(page).toHaveURL(new RegExp(`/quotations/${quote.id}$`));
    await expect(page.getByText(`${marker} service`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const edited = await request.patch(`${apiUrl}/api/itinerary-items/${itemId}`, { headers, data: { netUnitPrice: 900 } });
    expect(edited.status(), await edited.text()).toBe(200);
    const snapshot = await request.get(`${apiUrl}/api/quotations/${quote.id}`, { headers });
    expect(snapshot.status()).toBe(200);
    const savedQuote = await snapshot.json();
    expect(savedQuote.netTotal).toBe(160);
    expect(savedQuote.items[0].netUnitPrice).toBe(80);
    const otherHeaders = await authenticate(process.env.E2E_OTHER_TENANT_EMAIL!, process.env.E2E_OTHER_TENANT_PASSWORD!);
    const forbidden = await request.post(`${apiUrl}/api/quotations`, { headers: otherHeaders, data: {
      title: 'Cross-tenant denied', itineraryId: itinerary.id, itineraryVersionId: versionId,
    } });
    expect(forbidden.status(), await forbidden.text()).toBe(404);
  });
}
