import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
const fill = (s: string, params: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`Reservations list locale and row currencies: ${lang} ${theme} ${width}`, async ({ page }) => {
    const copy = (lang === 'bs' ? bs : en).reservationList;
    const other = (lang === 'bs' ? en : bs).reservationList;
    let reads = 0, batch: unknown;
    const queries: URLSearchParams[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')); }, { lang, theme });
    await page.route('**/__form-test-api/**', async route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') { batch = route.request().postDataJSON(); await route.fulfill({ json: { summary: { succeeded: 1, failed: 0 } } }); return; }
      if (url.pathname.endsWith('/reservations')) {
        reads++; queries.push(url.searchParams);
        await route.fulfill({ json: { data: [
          { id: 'reservation-bam', customerName: 'BAM client', packageName: 'BAM trip', currency: 'BAM', totalAmount: 100, paidAmount: 50, balanceDue: 50, status: 'confirmed', paymentStatus: 'partially_paid' },
          { id: 'reservation-eur', customerName: 'EUR client', packageName: 'EUR trip', currency: 'EUR', totalAmount: 200, paidAmount: 250, balanceDue: -50, status: 'completed', paymentStatus: 'paid' },
        ], total: 21 } }); return;
      }
      await route.fulfill({ json: { data: [] } });
    });
    await page.goto('/e2e/finance-forms/reservations-list-locale.html');
    const eur = page.getByRole('row').filter({ hasText: 'EUR client' });
    await expect(eur.getByText(lang === 'bs' ? /^200,00\s*€$/ : '€200.00', { exact: true })).toBeVisible();
    await expect(eur.getByTitle(copy.creditTitle)).toContainText(lang === 'bs' ? '50,00' : '€50.00');
    await expect(eur.getByText(copy.credit, { exact: true })).toBeVisible();
    await expect(eur.getByRole('button', { name: copy.payments, exact: true })).toHaveCount(0);
    await expect(eur.getByRole('button', { name: copy.invoice, exact: true })).toHaveCount(0);
    await page.getByLabel(fill(copy.selectRow, { name: 'EUR client' }), { exact: true }).check();
    await page.getByLabel(copy.from, { exact: true }).fill('2041-04-23');
    const before = reads;
    await page.getByRole('button', { name: lang === 'bs' ? 'Prebaci na engleski' : 'Switch to Bosnian', exact: true }).click();
    await expect(page.getByLabel(fill(other.selectRow, { name: 'EUR client' }), { exact: true })).toBeChecked();
    await expect(page.getByLabel(other.from, { exact: true })).toHaveValue('2041-04-23');
    await expect(page.getByText(fill(other.selected, { count: 1 }), { exact: true })).toBeVisible();
    expect(reads).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: other.confirm, exact: true }).click();
    await expect.poll(() => batch !== undefined).toBe(true);
    expect(batch).toEqual({ ids: ['reservation-eur'], status: 'confirmed' });
    const pager = lang === 'bs' ? en.pagination : bs.pagination;
    await page.getByRole('button', { name: pager.next, exact: true }).click();
    await expect.poll(() => queries.some(query => query.get('page') === '2' && query.get('dateFrom') === '2041-04-23')).toBe(true);
  });
}
