import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Los_Angeles' });
const customer = { id: 'customer-a', full_name: 'Synthetic client', email: '', phone: '+38761000000', status: 'active', created_at: '2041-04-23T12:00:00Z' };
const rows = [
  { id: 'bam', packageName: 'BAM trip', departureName: 'BAM departure', totalAmount: 100, paidAmount: 40, balanceDue: 60, currency: 'BAM', status: 'confirmed', bookingDate: '2041-04-23' },
  { id: 'eur', packageName: 'EUR trip', departureName: 'EUR departure', totalAmount: 200, paidAmount: 150, balanceDue: 50, currency: 'EUR', status: 'confirmed', bookingDate: '2041-04-23' },
];
for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`Customer Detail BS/EN and currency integrity: ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', 'en');
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
    }, theme);
    let requests = 0;
    await page.route('**/__form-test-api/**', async route => {
      requests++;
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ json: path.endsWith('/timeline') ? [{ id: 'event-eur', type: 'reservation', action: 'reservation_created', createdAt: '2041-04-23T12:00:00Z', details: { totalAmount: 200, currency: 'EUR', status: 'confirmed' } }]
        : path.endsWith('/reservations') ? { data: rows, total: 62 } : customer });
    });
    await page.goto('/e2e/finance-forms/customer-detail-locale.html');
    await expect(page.getByRole('heading', { name: 'Synthetic client' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'BAM', exact: true }).getByText(/BAM\s*100\.00/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'EUR', exact: true }).getByText('€200.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/BAM\s*300\.00/)).toHaveCount(0);
    await expect(page.getByText('Loaded reservations: 2 of 62. Monetary subtotals cover loaded records only.')).toBeVisible();
    const before = requests;
    await page.getByRole('button', { name: 'Switch to Bosnian' }).click();
    await expect(page.getByText('Pregled klijenta', { exact: true })).toBeVisible();
    await expect(page.getByText('Telefon', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'BAM', exact: true }).getByText(/100,00\s*KM/)).toBeVisible();
    await page.getByRole('button', { name: /^Rezervacije/ }).click();
    await expect(page.getByRole('cell', { name: '23.04.2041.', exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: /^Aktivnost/ }).click();
    await expect(page.getByText('Rezervacija kreirana', { exact: true })).toBeVisible();
    await expect(page.getByText(/200,00\s*€/)).toBeVisible();
    await page.getByRole('button', { name: 'Prebaci na engleski' }).click();
    await expect(page.getByText('Reservation created', { exact: true })).toBeVisible();
    await expect(page.getByText(/€200\.00/)).toBeVisible();
    expect(requests).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByText('Customer Summary', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
}

test('Customer Detail read failure is localized and retry recovers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('travline_lang', 'bs'));
  let fail = true;
  await page.route('**/__form-test-api/**', async route => {
    if (fail) { await route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }); return; }
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/timeline') ? [] : path.endsWith('/reservations') ? { data: rows, total: 2 } : customer });
  });
  await page.goto('/e2e/finance-forms/customer-detail-locale.html');
  await expect(page.getByRole('alert')).toHaveText('Detalji klijenta nisu učitani. Pokušajte ponovo.');
  await expect(page.getByText('Klijent nije pronađen', { exact: true })).toHaveCount(0);
  fail = false; await page.getByRole('button', { name: 'Pokušaj ponovo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic client' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
