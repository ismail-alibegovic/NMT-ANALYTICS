import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type APIRequestContext } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3001';
const configured = Boolean(
  process.env.E2E_RUN_BROWSER === '1' &&
  process.env.E2E_SUPABASE_ANON_KEY &&
  process.env.E2E_MANAGER_EMAIL &&
  process.env.E2E_MANAGER_PASSWORD &&
  process.env.E2E_OTHER_TENANT_EMAIL &&
  process.env.E2E_OTHER_TENANT_PASSWORD,
);

async function authHeaders(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: { email, password },
  });
  expect(response.status(), `sign-in failed for ${email}`).toBe(200);
  return { Authorization: `Bearer ${(await response.json()).access_token}` };
}

const scenarios = [
  { lang: 'bs', locale: 'bs-BA', width: 1440 },
  { lang: 'en', locale: 'en-US', width: 390 },
] as const;

for (const scenario of scenarios) {
  test(`public form embeds in a third-party iframe and creates a tenant-scoped inquiry in ${scenario.lang} at ${scenario.width}px`, async ({ browser, request }) => {
    test.skip(!configured, 'BLOCKED: isolated acceptance Auth/API environment required');
    test.setTimeout(90_000);

    const manager = await authHeaders(request, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!);
    const other = await authHeaders(request, process.env.E2E_OTHER_TENANT_EMAIL!, process.env.E2E_OTHER_TENANT_PASSWORD!);

    const marker = `Embed ${scenario.lang} ${Date.now()}`;
    const slug = `pb-${scenario.lang}-${Date.now()}`;
    const thankYou = `Hvala-${slug}`;
    const createForm = await request.post(`${apiUrl}/api/forms`, {
      headers: manager,
      data: {
        title: `Form ${marker}`,
        slug,
        active: true,
        thankYouMessage: thankYou,
        fields: [
          { id: 'contact_name', type: 'short_text', label: 'Name', required: true, mapTo: 'contact_name' },
          { id: 'email', type: 'email', label: 'Email', required: false, mapTo: 'email' },
          { id: 'phone', type: 'phone', label: 'Phone', required: false, mapTo: 'phone' },
          { id: 'destination', type: 'short_text', label: 'Destination', required: false, mapTo: 'destination' },
        ],
      },
    });
    expect(createForm.status(), await createForm.text()).toBe(201);
    const formId = (await createForm.json()).id as string;

    const context = await browser.newContext({ locale: scenario.locale, viewport: { width: scenario.width, height: 900 } });
    const page = await context.newPage();
    // A real server on a different origin (localhost:<port> vs 127.0.0.1:3001), as on an agency's own
    // website. It must be a real loopback listener: Playwright-fulfilled pages have no IP and Chromium's
    // Local Network Access checks then refuse to let them frame the loopback test server.
    const hostPage = `<!doctype html><html><body><h1>Agency site</h1><iframe id="travline" title="booking" src="${baseUrl}/public/forms/${slug}?embed=1" width="100%" height="700" style="border:0"></iframe></body></html>`;
    const host: Server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(hostPage);
    });
    await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
    const hostOrigin = `http://localhost:${(host.address() as AddressInfo).port}`;
    try {
      await page.goto(`${hostOrigin}/trips`);
      await runEmbeddedFlow();
    } finally {
      await new Promise<void>((resolve) => host.close(() => resolve()));
    }

    async function runEmbeddedFlow() {
      const frame = page.frameLocator('#travline');

      // Required-field validation runs inside the embed before anything is sent.
      await frame.locator('button[type="submit"]').click({ timeout: 20_000 });
      await expect(frame.locator('p.text-red-500').first()).toBeVisible();

      await frame.locator('#contact_name').fill(marker);
      await frame.locator('#email').fill('embed@example.ba');
      await frame.locator('#phone').fill('+38761555000');
      await frame.locator('#destination').fill('Mostar');
      await frame.locator('button[type="submit"]').click();
      await expect(frame.getByText(thankYou)).toBeVisible({ timeout: 20_000 });
    }
    await context.close();

    // The submission became an inquiry for the owning tenant only.
    const own = await request.get(`${apiUrl}/api/inquiries`, { headers: manager });
    expect(own.status()).toBe(200);
    expect(await own.text()).toContain(marker);
    const foreign = await request.get(`${apiUrl}/api/inquiries`, { headers: other });
    expect(foreign.status()).toBe(200);
    expect(await foreign.text()).not.toContain(marker);

    // The other tenant cannot read or alter the form.
    const foreignRead = await request.get(`${apiUrl}/api/forms/${formId}`, { headers: other });
    expect([403, 404]).toContain(foreignRead.status());
    const foreignPatch = await request.patch(`${apiUrl}/api/forms/${formId}`, { headers: other, data: { active: false } });
    expect([403, 404]).toContain(foreignPatch.status());

    // Deactivating the form closes the public endpoints (unauthenticated).
    const deactivate = await request.patch(`${apiUrl}/api/forms/${formId}`, { headers: manager, data: { active: false } });
    expect(deactivate.status(), await deactivate.text()).toBe(200);
    expect((await request.get(`${apiUrl}/api/public/forms/${slug}`)).status()).toBe(404);
    const lateSubmit = await request.post(`${apiUrl}/api/public/forms/${slug}`, { data: { contact_name: `${marker} late` } });
    expect(lateSubmit.status()).toBe(404);
    expect(await (await request.get(`${apiUrl}/api/inquiries`, { headers: manager })).text()).not.toContain(`${marker} late`);
  });
}
