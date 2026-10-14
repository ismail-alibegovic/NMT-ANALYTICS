import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
const scenarios = [{ lang: 'bs', width: 1440 }, { lang: 'en', width: 390 }];

for (const scenario of scenarios) {
  test(`Today opens outstanding supplier confirmations in ${scenario.lang} at ${scenario.width}px`, async ({ page, request }) => {
    test.skip(!configured, 'BLOCKED: isolated acceptance Auth/API environment required');
    test.setTimeout(60_000);
    await page.setViewportSize({ width: scenario.width, height: 900 });
    async function headersFor(email: string, password: string) {
      const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! }, data: { email, password },
      });
      expect(response.status()).toBe(200);
      return { Authorization: `Bearer ${(await response.json()).access_token}` };
    }
    const headers = await headersFor(process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!);
    const marker = `Today ${scenario.lang} ${Date.now()}`;
    const pkg = await request.post(`${apiUrl}/api/packages`, { headers, data: {
      name: marker, destination: 'Mostar', price: 180, currency: 'BAM', durationDays: 1,
      maxParticipants: 8, active: true, transportType: 'bus', transportCapacity: 8,
    } });
    expect(pkg.status(), await pkg.text()).toBe(201);
    const departAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const departure = await request.post(`${apiUrl}/api/departures`, { headers, data: {
      packageId: (await pkg.json()).id, departAt, returnAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      capacity: 8, booked: 0, status: 'active', transportType: 'bus',
    } });
    expect(departure.status(), await departure.text()).toBe(201);
    const departureId = (await departure.json()).id;
    const ids: string[] = [];
    for (const status of ['unconfirmed', 'requested', 'confirmed', 'cancelled']) {
      const response = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items`, { headers, data: {
        category: 'transport', label: `${marker} ${status}`, quantity: 1, unitCost: 10, currency: 'BAM',
      } });
      expect(response.status(), await response.text()).toBe(201);
      const id = (await response.json()).costItem.id;
      ids.push(id);
      if (status !== 'unconfirmed') {
        const change = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items/${id}/confirmation`, { headers, data: { status } });
        expect(change.status(), await change.text()).toBe(200);
      }
    }
    const summary = await request.get(`${apiUrl}/api/departures/readiness-summary?limit=20`, { headers });
    expect(summary.status(), await summary.text()).toBe(200);
    expect((await summary.json()).departures.find((row: any) => row.departureId === departureId).supplierIssues).toBe(2);
    const staffHeaders = await headersFor(process.env.E2E_STAFF_EMAIL!, process.env.E2E_STAFF_PASSWORD!);
    const staffSummary = await request.get(`${apiUrl}/api/departures/readiness-summary?limit=20`, { headers: staffHeaders });
    expect(staffSummary.status()).toBe(200);
    expect((await staffSummary.json()).departures.find((row: any) => row.departureId === departureId)).not.toHaveProperty('supplierIssues');
    const otherHeaders = await headersFor(process.env.E2E_OTHER_TENANT_EMAIL!, process.env.E2E_OTHER_TENANT_PASSWORD!);
    const otherSummary = await request.get(`${apiUrl}/api/departures/readiness-summary?limit=20`, { headers: otherHeaders });
    expect(otherSummary.status()).toBe(200);
    expect((await otherSummary.json()).departures.some((row: any) => row.departureId === departureId)).toBe(false);

    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await page.evaluate(lang => localStorage.setItem('travline_lang', lang), scenario.lang);
    await page.goto('/');
    const label = scenario.lang === 'bs' ? 'Nepotvrđene usluge dobavljača: 2' : 'Supplier confirmations outstanding: 2';
    const link = page.locator(`a[href="/departures/${departureId}?tab=finance"]`);
    await expect(link).toContainText(marker);
    await expect(link).toContainText(label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/departures/${departureId}\\?tab=finance$`));

    for (const id of ids) {
      const change = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items/${id}/confirmation`, { headers, data: { status: 'confirmed' } });
      expect(change.status()).toBe(200);
    }
    const refreshed = page.waitForResponse(response => response.url().includes('/departures/readiness-summary') && response.status() === 200);
    await page.goto('/');
    await refreshed;
    await expect(page.locator(`a[href="/departures/${departureId}?tab=finance"]`)).toHaveCount(0);
  });
}
