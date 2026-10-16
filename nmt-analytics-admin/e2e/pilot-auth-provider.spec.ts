import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const auth = process.env.E2E_SUPABASE_URL || '';
const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const configured = /^http:\/\/(127\.0\.0\.1|localhost):/.test(auth) && Boolean(process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_PASSWORD);
// Recovery links contain short-lived isolated tokens: never collect traces/videos/screenshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('isolated Auth signup confirmation and recovery work through captured SMTP', async ({ request, page }) => {
  test.skip(!configured, 'Requires disposable local Supabase Auth and Mailpit');
  const email = `auth-${randomUUID()}@pilot-auth.test`;
  const password = process.env.E2E_MANAGER_PASSWORD!;
  const headers = { apikey: process.env.E2E_SUPABASE_ANON_KEY! };
  const signup = await request.post(`${api}/api/auth/signup`, { data: { email, password, full_name: 'Auth Pilot', org_name: 'Auth Pilot' } });
  expect(signup.status()).toBe(201);
  expect((await signup.json()).confirmationRequired).toBe(true);
  const blocked = await request.post(`${auth}/auth/v1/token?grant_type=password`, { headers, data: { email, password } });
  expect(blocked.status()).toBe(400);
  async function capturedLink(subject: RegExp) {
    let link = '';
    await expect(async () => {
      const response = await request.get('http://127.0.0.1:54324/api/v1/messages');
      const body = await response.json();
      const message = (body.messages || []).find((m: { To: { Address: string }[]; Subject: string }) => m.To?.some(to => to.Address === email) && subject.test(m.Subject));
      expect(Boolean(message)).toBe(true);
      const detail = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
      const html = detail.HTML || detail.Text || '';
      link = (html.match(/https?:[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/) || [])[0]?.replace(/&amp;/g, '&') || '';
      expect(Boolean(link)).toBe(true);
    }).toPass({ timeout: 10000 });
    return link;
  }
  const confirmation = await request.get(await capturedLink(/confirm/i), { maxRedirects: 0 });
  expect([302, 303]).toContain(confirmation.status());
  const signedIn = await request.post(`${auth}/auth/v1/token?grant_type=password`, { headers, data: { email, password } });
  expect(signedIn.status()).toBe(200);
  const recovered = await request.post(`${auth}/auth/v1/recover?redirect_to=${encodeURIComponent(api + '/auth/reset-password')}`, { headers, data: { email } });
  expect(recovered.status()).toBe(200);
  const verification = await request.get(await capturedLink(/reset/i), { maxRedirects: 0 });
  expect([302, 303]).toContain(verification.status());
  const recovery = new URL(verification.headers().location);
  expect(recovery.pathname).toBe('/auth/reset-password');
  await page.goto('/auth/reset-password');
  await page.evaluate(hash => { window.location.hash = hash; window.location.reload(); }, recovery.hash);
  await page.locator('#new-password').waitFor();
  const newPassword = password + '-updated';
  await page.locator('#new-password').fill(newPassword);
  await page.locator('#confirm-password').fill(newPassword);
  await page.getByRole('button', { name: /Update password|Sačuvaj lozinku/ }).click();
  await expect(page).toHaveURL(/\/auth\/signin\?reset=1/);
  const login = await request.post(`${auth}/auth/v1/token?grant_type=password`, { headers, data: { email, password: newPassword } });
  expect(login.status()).toBe(200);
});
