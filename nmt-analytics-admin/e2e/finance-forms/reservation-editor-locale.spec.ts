import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
test.use({ timezoneId: 'America/Los_Angeles' });
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`Reservation editor locale and payload: ${lang} ${theme} ${width}`, async ({ page }) => {
    const copy = (lang === 'bs' ? bs : en).reservationEditor;
    const other = (lang === 'bs' ? en : bs).reservationEditor;
    const currency = lang === 'bs' ? 'BAM' : 'EUR';
    const quoted = theme === 'dark';
    let reads = 0; let attempts = 0; let core: Record<string, unknown> | undefined; let separateMutations = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')); }, { lang, theme });
    await page.route('**/__form-test-api/**', async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      if (method === 'PATCH' && path.endsWith('/reservations/reservation-a')) { attempts++; core = route.request().postDataJSON(); if (attempts === 1) await route.fulfill({ status: 409, json: { code: 'ACCOMMODATION_OVERBOOKED', message: 'Synthetic conflict' } }); else await route.fulfill({ json: { id: 'reservation-a' } }); return; }
      if ((method === 'PUT' || method === 'DELETE') && path.endsWith('/accommodation')) { separateMutations++; await route.fulfill({ status: 500, json: { message: 'Separate writes forbidden' } }); return; }
      let json: unknown = { data: [] };
      if (path.endsWith('/reservations/reservation-a')) { reads++; json = { id: 'reservation-a', customerName: 'Synthetic client', customerPhone: '+38761000000', departureId: 'departure-a', partySize: 2, totalAmount: 1780, currency, status: 'confirmed', quotationId: quoted ? 'quote-a' : null, options: { addons_total_at_booking: 100, selected_addons: [{ service_id: 'addon-a', provider_name: 'Synthetic insurance', currency: currency === 'EUR' ? 'BAM' : 'EUR', unit_price: 25, quantity: 2, line_total: 50 }] } }; }
      else if (path.endsWith('/packages')) json = { data: [{ id: 'package-a', name: 'Synthetic package', destination: 'Mostar' }] };
      else if (path.endsWith('/departures')) json = { data: [{ id: 'departure-a', package_id: 'package-a', depart_at: '2041-04-23', status: 'active', booked: 2, capacity: 8 }] };
      else if (path.endsWith('/accommodation-options')) json = { items: [{ id: 'allocation-a', hotel: { name: 'Synthetic hotel' }, roomLabel: 'Synthetic double', capacityPerRoom: 2, availableRooms: 4, unitSellPrice: 790 }] };
      else if (path.endsWith('/passengers')) json = { manifest: [{ passengerId: 'passenger-a', reservationId: 'reservation-a', fullName: 'Synthetic traveler A' }, { passengerId: 'passenger-b', reservationId: 'reservation-a', fullName: 'Synthetic traveler B' }] };
      else if (path.endsWith('/accommodation')) json = { accommodationRequirements: [{ hotelAllocationId: 'allocation-a', roomCount: 1, guestsExpected: 2, passengerIds: ['passenger-a', 'passenger-b'], notes: 'Original note' }] };
      await route.fulfill({ json });
    });
    await page.goto('/e2e/finance-forms/reservation-editor-locale.html');
    await page.getByRole('button', { name: 'Open fixture' }).click();
    const modal = page.getByRole('dialog', { name: copy.title, exact: true });
    await expect(modal.getByLabel(copy.fullName, { exact: true })).toHaveValue('Synthetic client');
    await expect(modal.getByText(lang === 'bs' ? /790,00\s*KM/ : '€790.00', { exact: true })).toBeVisible();
    // Canonical snapshot total uses reservation currency, regardless of first add-on currency.
    await expect(modal.getByText(lang === 'bs' ? /^100,00\s*KM$/ : '€100.00', { exact: true })).toBeVisible();
    await expect(modal.getByText(lang === 'bs' ? /2 × 25,00\s*€/ : /2 × BAM\s*25\.00/, { exact: true })).toBeVisible();
    await expect(modal.getByLabel(copy.departure, { exact: true }).locator('option:checked')).toHaveText(lang === 'bs' ? '23.04.2041. (2/8)' : '23/04/2041 (2/8)');
    const amount = modal.locator('input[type="number"][min="0"]');
    if (quoted) await expect(amount).toBeDisabled(); else { await expect(modal.getByLabel(copy.amount.replace('{currency}', currency), { exact: true })).toHaveValue('1780'); await amount.fill('1800'); }
    await modal.getByLabel(copy.fullName, { exact: true }).fill('Changed synthetic client');
    await page.evaluate(lang => window.dispatchEvent(new CustomEvent('fixture-language', { detail: lang })), lang === 'bs' ? 'en' : 'bs');
    const switched = page.getByRole('dialog', { name: other.title, exact: true });
    await expect(switched.getByLabel(other.fullName, { exact: true })).toHaveValue('Changed synthetic client');
    expect(reads).toBe(1);
    await expect(switched.getByLabel('Synthetic traveler A')).toBeChecked();
    await switched.getByRole('button', { name: other.save, exact: true }).click();
    await expect(page.getByText(other.errorUpdate, { exact: true })).toBeVisible();
    await expect(switched).toBeVisible();
    await expect(switched.getByLabel(other.fullName, { exact: true })).toHaveValue('Changed synthetic client');
    await switched.getByRole('button', { name: other.save, exact: true }).click();
    await expect(switched).toBeHidden();
    expect(attempts).toBe(2);
    expect(core).toMatchObject({ customerName: 'Changed synthetic client', customerPhone: '+38761000000', partySize: 2, departureId: 'departure-a', status: 'confirmed' });
    if (quoted) expect(core).not.toHaveProperty('totalAmount'); else expect(core).toHaveProperty('totalAmount', 1800);
    expect(core).toMatchObject({ accommodationRequirements: [{ hotelAllocationId: 'allocation-a', roomCount: 1, guestsExpected: 2, notes: 'Original note', passengerIds: ['passenger-a', 'passenger-b'] }] });
    expect(separateMutations).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
