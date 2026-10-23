import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';

const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
test.use({ timezoneId: 'America/Los_Angeles' });
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`full New Sale localization and payload: ${lang} ${theme} ${width}`, async ({ page }) => {
    const copy = (lang === 'bs' ? bs : en).newSaleWizard;
    const otherLang = lang === 'bs' ? 'en' : 'bs';
    const other = (lang === 'bs' ? en : bs).newSaleWizard;
    const currency = lang === 'bs' ? 'BAM' : 'EUR';
    const money = (amount: number) => new Intl.NumberFormat(lang === 'bs' ? 'bs-BA' : 'en-GB', { style: 'currency', currency }).format(amount).replace(/\s/g, ' ');
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => {
      localStorage.setItem('travline_lang', lang);
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
    }, { lang, theme });
    let saved: Record<string, any> | null = null;
    let requests = 0;
    await page.route('**/__form-test-api/**', async route => {
      requests++;
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/reservations') && route.request().method() === 'POST') {
        saved = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { id: 'synthetic-reservation', creationState: 'completed' } });
        return;
      }
      const json = path.endsWith('/packages') ? { data: [{ id: 'package-1', name: 'Synthetic package', destination: 'Mostar', price: 100, currency, variants: [] }] }
        : path.endsWith('/departures') ? { data: [{ id: 'departure-1', package_id: 'package-1', depart_at: '2027-07-15T09:00:00Z', return_at: '2027-07-15T20:00:00Z', status: 'active', transport_type: 'bus', capacity: 8, booked: 0, resolvedTravelerRequirements: { documentType: 'passport', allowFillLater: false, requireExpiry: true, requireNationality: true, requireDateOfBirth: true } }] }
        : path.endsWith('/accommodation-options') ? { departureId: 'departure-1', items: [{ id: 'allocation-1', departureId: 'departure-1', roomType: 'double', roomLabel: 'Synthetic double', availableRooms: 4, capacityPerRoom: 2, availableGuestCapacity: 8, unitSellPrice: 200, unitNetPrice: 180, hotel: { id: 'hotel-1', name: 'Synthetic hotel', destination: 'Mostar' } }] }
        : path.endsWith('/package-services') ? { data: [{ id: 'insurance', packageId: 'package-1', serviceType: 'insurance', providerName: 'Synthetic Insurance', quantity: 1, unitPrice: 25, currency, isOptional: true }] }
        : { data: [] };
      await route.fulfill({ json });
    });
    await page.goto('/e2e/finance-forms/new-sale-locale.html');
    await page.getByRole('button', { name: 'Open sale fixture' }).click();
    const wizard = page.getByRole('dialog', { name: copy.title, exact: true });
    await expect(wizard).toBeVisible();
    await expect(wizard.getByText('Synthetic package', { exact: true })).toBeVisible();
    await expect(wizard.getByText(money(100), { exact: true })).toBeVisible();
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await wizard.getByPlaceholder(copy.customerNamePlaceholder).fill('Synthetic client');
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(wizard.getByRole('alert')).toHaveText(copy.errorPhone);
    const beforeSwitch = requests;
    await page.evaluate(lang => window.dispatchEvent(new CustomEvent('fixture-language', { detail: lang })), otherLang);
    const switched = page.getByRole('dialog', { name: other.title, exact: true });
    await expect(switched.getByRole('alert')).toHaveText(other.errorPhone);
    await expect(switched.getByPlaceholder(other.customerNamePlaceholder)).toHaveValue('Synthetic client');
    await page.evaluate(lang => window.dispatchEvent(new CustomEvent('fixture-language', { detail: lang })), lang);
    await expect(wizard.getByRole('alert')).toHaveText(copy.errorPhone);
    expect(requests).toBe(beforeSwitch);
    await wizard.getByPlaceholder('+387 61 234 567').fill('+38761000000');
    await wizard.getByPlaceholder(fill(copy.passengerPlaceholder, { index: 1 })).fill('Synthetic traveler');
    await wizard.getByLabel(fill(copy.documentForTraveler, { document: copy.passportNumber, index: 1 })).fill('SYNTHETIC-PASSPORT');
    await wizard.getByLabel(fill(copy.expiryForTraveler, { index: 1 })).fill('2045-12-31');
    await wizard.getByLabel(fill(copy.nationalityForTraveler, { index: 1 })).fill('BA');
    await wizard.getByLabel(fill(copy.birthForTraveler, { index: 1 })).fill('1990-01-01');
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(wizard.getByRole('heading', { name: copy.accommodation, exact: true })).toBeVisible();
    await expect(wizard.getByText('Synthetic hotel', { exact: true }).first()).toBeVisible();
    await wizard.getByRole('button').filter({ hasText: 'Synthetic hotel' }).click();
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(wizard.getByRole('heading', { name: copy.addons, exact: true })).toBeVisible();
    await wizard.getByRole('checkbox', { name: fill(copy.chooseProvider, { provider: 'Synthetic Insurance' }) }).check();
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(wizard.getByText(copy.paymentPlan, { exact: true })).toBeVisible();
    await expect(wizard.getByText(money(325), { exact: true })).toBeVisible();
    await wizard.getByRole('button', { name: copy.next, exact: true }).click();
    await expect(wizard.getByRole('heading', { name: copy.saleReview, exact: true })).toBeVisible();
    await expect(wizard.getByText(money(325), { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await wizard.getByRole('button', { name: copy.confirm, exact: true }).click();
    await expect.poll(() => saved !== null).toBe(true);
    expect(saved).toMatchObject({
      customerName: 'Synthetic client', partySize: 1, totalAmount: 325, source: 'agent', status: 'pending',
      selectedAddons: [{ serviceId: 'insurance', quantity: 1 }],
      accommodationRequirements: [{ hotelAllocationId: 'allocation-1', roomCount: 1, guestsExpected: 1, passengerIndexes: [0] }],
      passengers: [{ full_name: 'Synthetic traveler', id_document_type: 'passport', id_document_number: 'SYNTHETIC-PASSPORT', id_document_expiry: '2045-12-31', nationality: 'BA', date_of_birth: '1990-01-01' }],
      options: { package_id: 'package-1', transport_type: 'bus', payment_plan: 'full', base_total_at_booking: 100, accommodation_total_at_booking: 200, addons_total_at_booking: 25, total_at_booking: 325 },
    });
    await expect(wizard).toBeHidden();
  });
}
