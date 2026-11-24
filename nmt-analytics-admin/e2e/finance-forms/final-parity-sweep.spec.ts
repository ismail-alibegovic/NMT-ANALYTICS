import { test, expect } from '@playwright/test';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1440] as const) {
      test(`zero mixed BS/EN strings across Rooming, Calendar, and CreateReservationModal: ${lang} ${theme} ${width}`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ lang, theme }) => {
          if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', lang);
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          });
        }, { lang, theme });

        await page.route('**/__form-test-api/**', async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith('/room-slots')) {
            return route.fulfill({
              json: {
                departureId: 'dep-1',
                slots: [{
                  id: 'slot-1',
                  orgId: 'org-1',
                  departureId: 'dep-1',
                  hotelId: 'hotel-1',
                  hotelAllocationId: 'alloc-1',
                  roomType: 'double',
                  slotIndex: 1,
                  displayLabel: 'Double 01',
                  actualHotelRoomNumber: null,
                  capacity: 2,
                  hotel: { id: 'hotel-1', name: 'Hotel Azure' },
                  assignments: [{ id: 'a-1', passengerId: 'pax-1', passengerName: 'Amina Hadžić', locked: false }],
                }],
              },
            });
          }
          if (path.includes('/calendar')) return route.fulfill({ json: { events: [] } });
          if (path.includes('/packages')) return route.fulfill({ json: { data: [{ id: 'pkg-1', name: 'Mostar', destination: 'BiH', price: 250 }], total: 1 } });
          if (path.includes('/customers')) return route.fulfill({ json: { data: [], total: 0 } });
          return route.fulfill({ json: { data: [] } });
        });

        await page.goto('/e2e/finance-forms/final-parity-sweep.html');

        if (lang === 'bs') {
          await expect(page.getByText('Neraspoređeni putnici')).toBeVisible();
          await expect(page.getByText('Generiši prijedlog rasporeda')).toBeVisible();
          await expect(page.getByText('Slobodno', { exact: true })).toBeVisible();
          await expect(page.getByText('Unassigned passengers')).toHaveCount(0);
          await expect(page.getByText('Generate Rooming Proposal')).toHaveCount(0);

          await page.getByRole('button', { name: 'Nova rezervacija', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Kreiraj rezervaciju', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Create reservation', exact: true })).toHaveCount(0);
          await page.getByRole('button', { name: 'Odustani', exact: true }).click();

          await page.getByRole('button', { name: 'Jezik', exact: true }).click();
          await expect(page.getByText('Unassigned passengers')).toBeVisible();
          await expect(page.getByText('Generate Rooming Proposal')).toBeVisible();
          await expect(page.getByText('Neraspoređeni putnici')).toHaveCount(0);

          await page.getByRole('button', { name: 'New Reservation', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Create reservation', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Kreiraj rezervaciju', exact: true })).toHaveCount(0);
        } else {
          await expect(page.getByText('Unassigned passengers')).toBeVisible();
          await expect(page.getByText('Generate Rooming Proposal')).toBeVisible();
          await expect(page.getByText('Neraspoređeni putnici')).toHaveCount(0);

          await page.getByRole('button', { name: 'New Reservation', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Create reservation', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Kreiraj rezervaciju', exact: true })).toHaveCount(0);
          await page.getByRole('button', { name: 'Cancel', exact: true }).click();

          await page.getByRole('button', { name: 'Language', exact: true }).click();
          await expect(page.getByText('Neraspoređeni putnici')).toBeVisible();
          await expect(page.getByText('Generiši prijedlog rasporeda')).toBeVisible();
          await expect(page.getByText('Unassigned passengers')).toHaveCount(0);

          await page.getByRole('button', { name: 'Nova rezervacija', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Kreiraj rezervaciju', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Create reservation', exact: true })).toHaveCount(0);
        }

        expect(pageErrors).toEqual([]);
      });
    }
  }
}
