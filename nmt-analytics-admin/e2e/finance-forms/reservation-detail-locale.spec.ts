import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
test.use({ timezoneId: 'America/Los_Angeles' });
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`Reservation Detail locale: ${lang} ${theme} ${width}`, async ({ page }) => {
    const copy = (lang === 'bs' ? bs : en).reservationDetail;
    const other = (lang === 'bs' ? en : bs).reservationDetail;
    const date = lang === 'bs' ? '23.04.2041.' : '23/04/2041';
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')); }, { lang, theme });
    let reads = 0; let contractPayload: unknown;
    await page.route('**/__form-test-api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST' && path.endsWith('/contracts')) {
        contractPayload = route.request().postDataJSON();
        await route.fulfill({ json: { id: 'contract-b', contractNumber: 'SYNTHETIC-NEW', status: 'draft' } }); return;
      }
      let json: unknown = { data: [] };
      if (path.endsWith('/reservations/reservation-a')) { reads++; json = { id: 'reservation-a', customerName: 'Synthetic client', status: 'confirmed', departureId: 'departure-a', currency: 'EUR', totalAmount: 300, paidAmount: 100, reservationAt: '2041-04-23', partySize: 2, options: { booking_snapshot_version: 1, transport_type: 'bus', total_at_booking: 300, selected_addons: [{ provider_name: 'Synthetic insurance', quantity: 1, unit_price: 25, currency: 'EUR' }] } }; }
      else if (path.endsWith('/passengers')) json = { manifest: [{ reservationId: 'reservation-a', fullName: 'Synthetic traveler', id_document_type: 'passport', id_document_number: 'TEST', date_of_birth: '2000-04-23', documentReadinessStatus: 'ready' }, { reservationId: 'other-reservation', fullName: 'Excluded traveler', documentReadinessStatus: 'missing' }] };
      else if (path.endsWith('/accommodation')) json = { accommodationRequirements: [{ hotel: { name: 'Synthetic hotel' }, roomCount: 1, guestsExpected: 2 }] };
      else if (path.endsWith('/installments')) json = { installments: [{ id: 'installment-a', installmentNumber: 1, amount: 200, currency: 'EUR', status: 'pending', dueDate: '2041-04-23' }] };
      else if (path.endsWith('/contracts')) json = { data: [{ id: 'contract-a', contractNumber: 'SYNTHETIC', status: 'signed' }] };
      await route.fulfill({ json });
    });
    await page.goto('/e2e/finance-forms/reservation-detail-locale.html');
    await expect(page.getByText('Synthetic client', { exact: true })).toBeVisible();
    await expect(page.getByText(date, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.partial, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.invoice, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: copy.passengers, exact: true }).click();
    await expect(page.getByText(`${copy.passport}: TEST`, { exact: true })).toBeVisible();
    await expect(page.getByText('Excluded traveler')).toHaveCount(0);
    await page.getByRole('button', { name: copy.payments, exact: true }).click();
    await expect(page.getByText(`${copy.due} ${date}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.recordPayment, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: copy.services, exact: true }).click();
    await expect(page.getByRole('definition').filter({ hasText: 'Synthetic hotel' })).toBeVisible();
    await expect(page.getByText(copy.bus, { exact: true })).toBeVisible();
    await expect(page.getByText(lang === 'bs' ? /^Synthetic insurance · 1 × 25,00\s*€$/ : 'Synthetic insurance · 1 × €25.00', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: lang === 'bs' ? 'Prebaci na engleski' : 'Switch to Bosnian', exact: true }).click();
    await expect(page.getByText(other.soldServices, { exact: true })).toBeVisible();
    await expect(page.getByText(other.bus, { exact: true })).toBeVisible();
    expect(reads).toBe(1);
    await page.getByRole('button', { name: other.documents, exact: true }).click();
    await expect(page.getByRole('button', { name: other.downloadVoucher, exact: true })).toBeVisible();
    await page.getByRole('button', { name: other.contract, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(other.signed, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: other.generate, exact: true }).click();
    await expect(dialog.getByText(other.contractSuccess, { exact: true })).toBeVisible();
    expect(contractPayload).toEqual({ reservationId: 'reservation-a' });
    await dialog.getByRole('button', { name: other.close, exact: true }).filter({ hasText: other.close }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
