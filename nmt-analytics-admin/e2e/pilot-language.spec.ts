import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { en } from '../src/lib/i18n/en';
import { bs } from '../src/lib/i18n/bs';

const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+(?:\/|$)/;
const configured = process.env.E2E_RUN_BROWSER === '1'
  && [process.env.E2E_BASE_URL, process.env.E2E_API_URL, process.env.E2E_SUPABASE_URL].every(url => local.test(url || ''))
  && Boolean(process.env.E2E_MANAGER_PASSWORD && process.env.E2E_SUPABASE_ANON_KEY);

// Login fields contain synthetic credentials; do not record this lifecycle.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
for (const initial of ['bs', 'en'] as const) for (const theme of ['light', 'dark']) {
  test(`isolated public/authenticated language persistence: ${initial} ${theme}`, async ({ page, request }) => {
    test.skip(!configured, 'Requires disposable localhost Auth/API/Mailpit and synthetic test password');
    test.setTimeout(90_000);
    // Each lifecycle owns its account: UI sign-out must not revoke the shared
    // acceptance manager's refresh sessions while other scenarios run.
    const email = `language@${randomUUID()}.pilot-language.test`;
    const signup = await request.post(`${process.env.E2E_API_URL}/api/auth/signup`, {
      data: { email, password: process.env.E2E_MANAGER_PASSWORD!, full_name: 'Synthetic Language', org_name: `Language ${randomUUID()}` },
    });
    expect(signup.status()).toBe(201);
    let verificationLink = '';
    await expect(async () => {
      const messages = await (await request.get('http://127.0.0.1:54324/api/v1/messages')).json();
      const message = (messages.messages || []).find((item: { ID: string; To: { Address: string }[] }) => item.To?.some(to => to.Address === email));
      expect(Boolean(message)).toBe(true);
      const detail = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
      verificationLink = ((detail.HTML || detail.Text || '').match(/https?:[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/) || [])[0]?.replace(/&amp;/g, '&') || '';
      expect(Boolean(verificationLink)).toBe(true);
    }).toPass({ timeout: 15_000 });
    // A verification message is trusted only for the disposable local Auth.
    expect(new URL(verificationLink).origin).toBe(new URL(process.env.E2E_SUPABASE_URL!).origin);
    const verified = await request.get(verificationLink, { maxRedirects: 0 });
    expect([302, 303]).toContain(verified.status());
    const original = initial === 'bs' ? bs : en;
    const next = initial === 'bs' ? en : bs;
    const nextLang = initial === 'bs' ? 'en' : 'bs';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(({ initial, theme }) => {
      if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', initial);
      localStorage.setItem('theme', theme);
    }, { initial, theme });

    await page.goto('/landing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.landing.heroTitle);
    await expect(page.locator('html')).toHaveAttribute('lang', initial);
    await page.goto('/auth/signin');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.auth.signInTitle);
    await page.locator('#signin-email').fill(email);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.locator('form').getByRole('button', { name: original.auth.signIn, exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    const targetLabel = initial === 'en' ? original.common.switchToBosnian : original.common.switchToEnglish;
    await page.getByRole('button', { name: targetLabel, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', nextLang);

    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next.reports.title);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next.reports.title);
    await expect(page.locator('html')).toHaveAttribute('lang', nextLang);
    expect(await page.evaluate(() => localStorage.getItem('travline_lang'))).toBe(nextLang);

    // Public routes keep the selected language while a session is present.
    await page.goto('/landing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next.landing.heroTitle);
    await page.goto('/home');
    const accountName = email.split('@')[0];
    await page.locator('header').getByRole('button', { name: accountName, exact: true }).click();
    await page.getByRole('button', { name: next.userMenu.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next.auth.signInTitle);
    await page.goto('/landing');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(next.landing.heroTitle);
    await expect(page.locator('html')).toHaveAttribute('lang', nextLang);
    expect(await page.evaluate(() => localStorage.getItem('travline_lang'))).toBe(nextLang);
  });
}
