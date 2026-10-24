import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`reservation filter/read failures/retry: ${lang} ${theme} ${width}`, async ({ page }) => {
    const list = (lang === 'bs' ? bs : en).reservationList, detail = (lang === 'bs' ? bs : en).reservationDetail;
    const rows = [
      { id: 'reservation-a', customerName: 'Pending synthetic', status: 'pending', reservationAt: '2041-04-23', currency: 'EUR', totalAmount: 300, paidAmount: 100, balanceDue: 200, paymentStatus: 'partially_paid' },
      { id: 'reservation-b', customerName: 'Confirmed synthetic', status: 'confirmed', reservationAt: '2041-04-26', currency: 'BAM', totalAmount: 400, paidAmount: 0, balanceDue: 400, paymentStatus: 'unpaid' },
    ];
    let failList = true, mutations = 0;
    const failures = new Set(['passengers', 'accommodation', 'installments', 'contracts']), queries: URLSearchParams[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')); }, { lang, theme });
    await page.route('**/__form-test-api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname, section = path.split('/').pop()!;
      if (route.request().method() !== 'GET') { mutations++; await route.fulfill({ status: 500, json: { error: 'Unexpected fixture mutation' } }); return; }
      if ((path.endsWith('/reservations') && failList) || failures.has(section)) {
        if (path.endsWith('/reservations')) failList = false; failures.delete(section);
        await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_READ_FAILURE' } }); return;
      }
      let json: unknown = { data: [] };
      if (path.endsWith('/reservations')) {
        queries.push(url.searchParams);
        const filtered = rows.filter(row => (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) && (!url.searchParams.get('dateFrom') || row.reservationAt >= url.searchParams.get('dateFrom')!) && (!url.searchParams.get('search') || row.customerName.includes(url.searchParams.get('search')!)));
        json = { data: filtered, total: filtered.length };
      } else if (path.endsWith('/reservations/reservation-a')) json = { ...rows[0], departureId: 'departure-a', partySize: 1, options: {} };
      else if (section === 'passengers') json = { manifest: [{ reservationId: 'reservation-a', fullName: 'Synthetic traveler' }] };
      else if (section === 'accommodation') json = { accommodationRequirements: [{ hotel: { name: 'Synthetic hotel' }, roomCount: 1, guestsExpected: 1 }] };
      else if (section === 'installments') json = { installments: [{ id: 'installment-a', installmentNumber: 1, amount: 200, currency: 'EUR', status: 'pending' }] };
      else if (section === 'contracts') json = { data: [{ id: 'contract-a', contractNumber: 'SYNTHETIC-CONTRACT', status: 'signed' }] };
      await route.fulfill({ json });
    });
    await page.goto('/e2e/finance-forms/reservation-reliability.html');
    await expect(page.getByRole('alert')).toContainText(list.errorLoad);
    await expect(page.getByText(list.noReservations, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: list.retry, exact: true }).click();
    await expect(page.getByText('Confirmed synthetic', { exact: true })).toBeVisible();
    await page.getByLabel(list.status, { exact: true }).selectOption('pending');
    await expect(page.getByText('Confirmed synthetic', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Pending synthetic', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: list.clearFilters, exact: true }).click();
    await expect(page.getByText('Confirmed synthetic', { exact: true })).toBeVisible();
    await page.getByLabel(list.from, { exact: true }).fill('2041-04-26');
    await expect(page.getByText('Pending synthetic', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Confirmed synthetic', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: list.clearFilters, exact: true }).click();
    await page.getByPlaceholder(list.search).fill('Pending');
    await expect(page.getByText('Confirmed synthetic', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Pending synthetic', { exact: true })).toBeVisible();
    const previous = queries.length;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('travline:data_invalidated', { detail: { entity: 'reservations' } })));
    await expect.poll(() => queries.length).toBeGreaterThan(previous);
    expect(queries[queries.length - 1].get('search')).toBe('Pending');
    await page.goto('/e2e/finance-forms/reservation-reliability.html?detail=1');
    await expect(page.getByText('Pending synthetic', { exact: true })).toBeVisible();
    for (const [tab, empty] of [[detail.passengers, detail.noPassengers], [detail.services, detail.noServices]] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByText(empty, { exact: true })).toHaveCount(0);
      await page.getByRole('alert').getByRole('button', { name: detail.retry, exact: true }).click();
      await expect(page.getByText(tab === detail.passengers ? 'Synthetic traveler' : 'Synthetic hotel', { exact: false })).toBeVisible();
    }
    await page.getByRole('button', { name: detail.payments, exact: true }).click();
    await expect(page.getByRole('button', { name: detail.recordPayment, exact: true })).toBeDisabled();
    await expect(page.getByText(detail.noSchedule, { exact: true })).toHaveCount(0);
    await page.getByRole('alert').getByRole('button', { name: detail.retry, exact: true }).click();
    await expect(page.getByRole('button', { name: detail.recordPayment, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: detail.contract, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: detail.generate, exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: detail.retry, exact: true }).click();
    await expect(dialog.getByRole('button', { name: detail.generate, exact: true })).toBeEnabled();
    await expect(dialog.getByText('SYNTHETIC-CONTRACT', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(mutations).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
