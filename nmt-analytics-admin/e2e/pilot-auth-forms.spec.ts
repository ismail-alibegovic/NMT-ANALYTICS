import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { en } from '../src/lib/i18n/en';

const auth = process.env.E2E_SUPABASE_URL || '';
const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const configured = /^http:\/\/(127\.0\.0\.1|localhost):/.test(auth) && /^http:\/\/(127\.0\.0\.1|localhost):/.test(api) && Boolean(process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_PASSWORD);
// Provider verification links contain credentials. Never record this lifecycle.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`isolated auth UI lifecycle ${theme} ${width}`, async ({ page, request }) => {
    test.skip(!configured, 'Requires disposable local Auth, API and Mailpit');
    test.setTimeout(90_000);
    const c = en.auth;
    const email = `form-${randomUUID()}@pilot-auth.test`;
    const password = process.env.E2E_MANAGER_PASSWORD!;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem('travline_lang', 'en'); localStorage.setItem('theme', theme);
    }, theme);
    async function capturedLink(subject: RegExp) {
      let link = '';
      await expect(async () => {
        const body = await (await request.get('http://127.0.0.1:54324/api/v1/messages')).json();
        const message = (body.messages || []).find((m: { To: { Address: string }[]; Subject: string }) => m.To?.some(to => to.Address === email) && subject.test(m.Subject));
        expect(Boolean(message)).toBe(true);
        const detail = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
        link = ((detail.HTML || detail.Text || '').match(/https?:[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/) || [])[0]?.replace(/&amp;/g, '&') || '';
        expect(Boolean(link)).toBe(true);
      }).toPass({ timeout: 10_000 });
      return link;
    }
    await page.goto('/auth/signup');
    const form = page.locator('form');
    await form.getByLabel(c.orgName, { exact: false }).fill('Isolated form audit');
    await form.getByLabel(c.firstName, { exact: false }).fill('Synthetic');
    await form.getByLabel(c.lastName, { exact: false }).fill('Audit');
    await form.getByLabel(c.email, { exact: false }).fill(email);
    await form.getByLabel(c.password, { exact: false }).and(form.locator('input')).fill(password);
    await form.getByRole('checkbox').check();
    // Reject before the API writes; retry must preserve the complete draft.
    await page.route('**/api/auth/signup', route => route.fulfill({ status: 503, json: { message: 'Synthetic pre-write failure' } }), { times: 1 });
    await form.getByRole('button', { name: c.signUpButton, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Synthetic pre-write failure');
    await expect(form.getByLabel(c.email, { exact: false })).toHaveValue(email);
    const created = page.waitForResponse(r => r.url().endsWith('/api/auth/signup') && r.request().method() === 'POST' && r.status() === 201);
    await form.evaluate(f => { for (let i = 0; i < 2; i++) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await created;
    await expect(page).toHaveURL(/\/auth\/signin\?verify=1/);
    const confirmed = await request.get(await capturedLink(/confirm/i), { maxRedirects: 0 });
    expect([302, 303]).toContain(confirmed.status());
    await page.goto('/auth/reset-password');
    await page.locator('form').getByLabel(c.email, { exact: false }).fill(email);
    await page.getByRole('button', { name: c.sendResetLink, exact: true }).click();
    await expect(page.getByRole('status')).toBeVisible();
    const verified = await request.get(await capturedLink(/reset/i), { maxRedirects: 0 });
    expect([302, 303]).toContain(verified.status());
    const recovery = new URL(verified.headers().location);
    expect(recovery.pathname).toBe('/auth/reset-password');
    await page.goto('/auth/reset-password');
    await page.evaluate(hash => { window.location.hash = hash; window.location.reload(); }, recovery.hash);
    await page.locator('#new-password').fill(password + '-updated');
    await page.locator('#confirm-password').fill(password + '-mismatch');
    await page.getByRole('button', { name: c.updatePassword, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(c.passwordsDoNotMatch);
    await page.locator('#confirm-password').fill(password + '-updated');
    await page.getByRole('button', { name: c.updatePassword, exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/signin\?reset=1/);
    await page.locator('#signin-email').fill(email);
    await page.locator('#signin-password').fill(password + '-updated');
    await page.getByRole('checkbox', { name: c.keepLoggedIn, exact: true }).check();
    const login = page.waitForResponse(r => r.url().includes('/auth/v1/token?grant_type=password') && r.status() === 200);
    await page.locator('form').getByRole('button', { name: c.signIn, exact: true }).click();
    await login;
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('nmt_refresh_token')))).toBe(true);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('nmt_refresh_token')))).toBe(true);
    const invalidOldPassword = await request.post(`${auth}/auth/v1/token?grant_type=password`, { headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! }, data: { email, password } });
    expect(invalidOldPassword.status()).toBe(400);
  });
}
