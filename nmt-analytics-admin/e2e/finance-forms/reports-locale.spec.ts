import { test, expect } from '@playwright/test';

// Revenue buckets are calendar days, including west of UTC.
test.use({ timezoneId: 'America/Los_Angeles' });

for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`Reports monetary locale switches and persists: ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', 'bs');
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
    }, theme);
    let requests = 0;
    await page.route('**/__form-test-api/analytics/**', async route => {
      requests++;
      const path = new URL(route.request().url()).pathname;
      const totals = { total_amount_sum: 1234567.89, total_paid_sum: 200, total_balance_sum: 1234367.89, currency: 'EUR' };
      const json = path.endsWith('overview-v2') ? { ...totals, reservations_count: 1, payments_count: 1, availableCurrencies: ['EUR'] }
        : path.endsWith('by-package') ? [{ ...totals, package_id: 'synthetic-package', package_name: 'Synthetic trip', reservations_count: 1 }]
        : [{ ...totals, date: '2041-04-23' }];
      await route.fulfill({ json });
    });
    await page.goto('/e2e/finance-forms/reports-locale.html');
    const money = (locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1234567.89).replace(/\s/g, ' ');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Izvještaji');
    await expect(page.getByText(money('bs-BA'), { exact: true }).first()).toBeVisible();
    await expect(page.locator('svg text').filter({ hasText: money('bs-BA') })).toHaveCount(1);
    await expect(page.locator('svg text').filter({ hasText: '23. apr' })).toHaveCount(1);
    const before = requests;
    await page.getByRole('button', { name: 'Jezik', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
    await expect(page.getByText(money('en-GB'), { exact: true }).first()).toBeVisible();
    await expect(page.locator('svg text').filter({ hasText: money('en-GB') })).toHaveCount(1);
    await expect(page.locator('svg text').filter({ hasText: '23 Apr' })).toHaveCount(1);
    await expect(page.getByText(money('bs-BA'), { exact: true })).toHaveCount(0);
    expect(requests).toBe(before);
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
    await expect(page.getByText(money('en-GB'), { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Izvještaji');
    await expect(page.getByText(money('bs-BA'), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(money('en-GB'), { exact: true })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'bs');
  });
}
