import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const auth = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`detail and operator portal fixtures ${theme} ${width}`, async ({ page, request }, info) => {
    test.skip(process.env.E2E_RUN_BROWSER !== '1', 'Requires isolated acceptance');
    test.setTimeout(180_000);
    expect([api, auth].every(url => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))).toBe(true);
    const login = await request.post(auth + '/auth/v1/token?grant_type=password', {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      data: { email: process.env.E2E_FINANCE_DIRECTOR_EMAIL, password: process.env.E2E_FINANCE_DIRECTOR_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const headers = { Authorization: 'Bearer ' + (await login.json()).access_token };
    const marker = 'Readiness ' + randomUUID().slice(0, 8);
    async function create(path: string, data: unknown) {
      const result = await request.post(api + '/api' + path, { headers, data });
      expect(result.status(), await result.text()).toBe(201); return result.json();
    }
    const pkg = await create('/packages', { name: marker, destination: 'Synthetic', price: 50, currency: 'BAM', active: true, transportType: 'none', maxParticipants: 8 });
    const itinerary = await create('/itineraries', { title: marker, destination: 'Synthetic' });
    const quote = await create('/quotations', { title: marker, items: [{ title: 'Synthetic', quantity: 1, netUnitPrice: 50, markupPercent: 0, currency: 'BAM' }] });
    const hotel = await create('/hotels', { name: marker, destination: 'Synthetic', totalRooms: 2 });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => { localStorage.setItem('theme', theme); localStorage.setItem('travline_lang', 'en'); }, theme);
    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_FINANCE_DIRECTOR_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_FINANCE_DIRECTOR_PASSWORD!);
    await page.locator('button[type="submit"]').click(); await expect(page).not.toHaveURL(/auth\/signin/);
    const routes = [`/packages/${pkg.id}`, `/itineraries/${itinerary.id}`, `/quotations/${quote.id}`, `/operations/hotels/${hotel.id}`,
      '/portal', '/portal/packages', '/portal/departures', '/portal/reservations', '/portal/customers', '/portal/settings'];
    const observations: unknown[] = [];
    for (const route of routes) {
      const errors: string[] = []; const failures: number[] = [];
      const onError = (error: Error) => errors.push(error.message);
      const onResponse = (response: any) => { if (response.url().includes('/api/') && response.status() >= 400) failures.push(response.status()); };
      page.on('pageerror', onError); page.on('response', onResponse);
      await page.goto(route, { waitUntil: 'networkidle' });
      expect(new URL(page.url()).pathname).toBe(route);
      await expect(page.locator('h1').first()).toBeVisible();
      if (!route.startsWith('/portal')) await expect(page.locator('body')).toContainText(marker);
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
      expect(errors, route).toEqual([]); expect(failures, route).toEqual([]);
      observations.push({ route, status: 'PASS_INITIAL_RENDER_AND_API', theme, width });
      page.off('pageerror', onError); page.off('response', onResponse);
    }
    await info.attach('detail-portal-readiness', { body: JSON.stringify(observations), contentType: 'application/json' });
  });
}
