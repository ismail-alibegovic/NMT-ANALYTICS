import { expect, test } from '@playwright/test';
import { bs } from '../../src/lib/i18n/bs';
import { en } from '../../src/lib/i18n/en';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`operations locale & read recovery ${lang} ${theme} ${width}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        const t = lang === 'bs' ? bs : en;
        let failRules = true;
        let failDepartures = true;

        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(
          ({ lang, theme }) => {
            localStorage.setItem('travline_lang', lang);
            localStorage.setItem('theme', theme);
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.classList.toggle('dark', theme === 'dark');
            });
          },
          { lang, theme },
        );

        await page.route('**/__form-test-api/**', async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname.replace('/__form-test-api', '');
          if (path.startsWith('/reservations')) {
            return route.fulfill({
              json: {
                data: [{ id: 'res-1', customerName: 'Synthetic Client', packageName: 'Mostar Tour', partySize: 2 }],
                total: 1,
              },
            });
          }
          if (path.startsWith('/excursions')) {
            return route.fulfill({
              json: {
                data: [{ id: 'ex-1', reservationId: 'res-1', fullName: 'Selma Excursion', phone: '+38761000111', idDocument: 'A123', seatNumber: 3, paidAmount: 120, totalAmount: 150, debtAmount: 30 }],
                total: 1,
              },
            });
          }
          if (path === '/commission-rules') {
            if (failRules) return route.fulfill({ status: 503, json: { error: 'PRIVATE COMMISSION ERROR' } });
            return route.fulfill({
              json: { data: [{ id: 'cr-1', partnerType: 'gold', serviceType: 'hotel', commissionPct: 10, markupPct: 4, isActive: true, priority: 5 }] },
            });
          }
          if (path.startsWith('/packages')) {
            return route.fulfill({ json: { data: [{ id: 'pkg-1', name: 'Mostar Tour', destination: 'Mostar', currency: 'BAM' }], total: 1 } });
          }
          if (path.startsWith('/departures')) {
            if (failDepartures) return route.fulfill({ status: 503, json: { error: 'PRIVATE DEP ERROR' } });
            return route.fulfill({
              json: {
                data: [{ id: 'dep-1', package_id: 'pkg-1', packageName: 'Mostar Tour', destination: 'Mostar', depart_at: '2026-06-15T08:00:00Z', return_at: '2026-06-18T18:00:00Z', capacity: 30, booked: 10, status: 'active', transport_type: 'bus' }],
                total: 1,
              },
            });
          }
          return route.fulfill({ json: { data: [], total: 0 } });
        });

        await page.goto('/e2e/finance-forms/operations-locale.html?tab=excursions');
        await expect(page.getByRole('heading', { name: t.operations.excursions.title })).toBeVisible();
        await page.getByLabel(t.operations.excursions.selectReservation).selectOption('res-1');
        await expect(page.getByText('Selma Excursion')).toBeVisible();
        await expect(page.getByText(t.operations.excursions.passengerConsent)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

        await page.getByRole('button', { name: 'tab-commission' }).click();
        await expect(page.getByRole('alert')).toHaveText(t.operations.commissionRules.loadError);
        failRules = false;
        await page.getByRole('button', { name: t.operations.commissionRules.retryLoad }).click();
        await expect(page.getByText(t.operations.commissionRules.active, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

        await page.getByRole('button', { name: 'tab-departures' }).click();
        await expect(page.getByRole('alert')).toHaveText(t.departures.loadError);
        failDepartures = false;
        await page.getByRole('button', { name: t.departures.retryLoad }).click();
        await expect(page.getByRole('button', { name: 'Mostar Tour' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

        await page.getByRole('button', { name: 'tab-seatmap' }).click();
        await expect(page.getByText(t.departure.seatMap.frontDriver)).toBeVisible();
        await expect(page.getByText(t.departure.seatMap.unassigned)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
