import { expect, test } from '@playwright/test';
import { bs } from '../../src/lib/i18n/bs';
import { en } from '../../src/lib/i18n/en';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`allocation edit and bus vehicle create/edit/reload ${lang} ${theme} ${width}`, async ({ page }, info) => {
        const t = lang === 'bs' ? bs : en;
        const otherT = lang === 'bs' ? en : bs;
        const tx = t.departure.accommodationAllotment;
        const otherTx = otherT.departure.accommodationAllotment;
        const vtx = t.departure.busSeating;
        const otherVtx = otherT.departure.busSeating;

        let allocReadFails = true;
        let allocRooms = 3;
        let allocPatches = 0;

        let vehicleReadFails = true;
        let vehicleState: {
          vehicle: {
            id: string;
            departure_id: string;
            org_id: string;
            vehicle_label: string;
            registration_number: string | null;
            capacity: number;
            layout_type: string;
            created_at: string;
            updated_at: string;
          } | null;
          seats: Array<{
            id: string;
            seat_number: number;
            seat_label: string;
            row_number: number;
            column_index: number;
            side: 'left' | 'right';
            is_active: boolean;
          }>;
        } = { vehicle: null, seats: [] };
        let vehiclePuts = 0;
        let vehicleSaveFailsOnce = true;

        const makeSeats = (count: number) =>
          Array.from({ length: count }, (_, idx) => ({
            id: `seat-${idx + 1}`,
            seat_number: idx + 1,
            seat_label: `Seat ${idx + 1}`,
            row_number: Math.floor(idx / 4) + 1,
            column_index: idx % 4,
            side: (idx % 4 < 2 ? 'left' : 'right') as 'left' | 'right',
            is_active: true,
          }));

        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(
          ({ lang, theme }) => {
            localStorage.setItem('travline_lang', lang);
            localStorage.setItem('theme', theme);
          },
          { lang, theme },
        );

        await page.route('**/__form-test-api/**', async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname.replace('/__form-test-api', '');
          const method = route.request().method();

          if (path === '/departures/dep-bus-1/accommodation-allotments' && method === 'GET') {
            if (allocReadFails) {
              return route.fulfill({ status: 503, json: { error: 'PRIVATE allotment read failure' } });
            }
            return route.fulfill({
              json: {
                departureId: 'dep-bus-1',
                items: [
                  {
                    id: 'alloc-1',
                    departureId: 'dep-bus-1',
                    hotelId: 'hotel-1',
                    packageHotelId: null,
                    roomType: 'double',
                    roomLabel: 'Double',
                    templateRooms: 3,
                    departureRooms: allocRooms,
                    roomsReserved: allocRooms,
                    capacityPerRoom: 2,
                    capacity: allocRooms * 2,
                    allocated: 1,
                    available: Math.max(0, allocRooms - 1),
                    checkIn: '2026-11-01',
                    checkOut: '2026-11-04',
                    netPrice: 80,
                    sellPrice: 110,
                    pricePerNight: 80,
                    sortOrder: 0,
                    hotel: { id: 'hotel-1', name: 'Synthetic Grand Hotel', destination: 'Sarajevo', stars: 4 },
                    createdAt: '2026-11-01T00:00:00Z',
                    updatedAt: '2026-11-01T00:00:00Z',
                  },
                ],
              },
            });
          }

          if (path === '/departures/dep-bus-1/accommodation-allotments/alloc-1' && method === 'PATCH') {
            allocPatches++;
            const body = route.request().postDataJSON();
            if (body.roomCount === 1) {
              return route.fulfill({
                status: 409,
                json: { code: 'ROOM_SLOT_OCCUPIED', message: 'Cannot reduce room inventory because one of the removed room slots is occupied.' },
              });
            }
            allocRooms = body.roomCount;
            return route.fulfill({
              json: {
                id: 'alloc-1',
                departureId: 'dep-bus-1',
                hotelId: 'hotel-1',
                packageHotelId: null,
                roomType: 'double',
                roomLabel: 'Double',
                templateRooms: 3,
                departureRooms: allocRooms,
                roomsReserved: allocRooms,
                capacityPerRoom: 2,
                capacity: allocRooms * 2,
                allocated: 1,
                available: Math.max(0, allocRooms - 1),
                checkIn: '2026-11-01',
                checkOut: '2026-11-04',
                netPrice: 80,
                sellPrice: 110,
                pricePerNight: 80,
                sortOrder: 0,
                hotel: { id: 'hotel-1', name: 'Synthetic Grand Hotel', destination: 'Sarajevo', stars: 4 },
                createdAt: '2026-11-01T00:00:00Z',
                updatedAt: '2026-11-01T00:00:00Z',
              },
            });
          }

          if (path === '/departures/dep-bus-1/vehicle' && method === 'GET') {
            if (vehicleReadFails) {
              return route.fulfill({ status: 503, json: { error: 'PRIVATE vehicle read failure' } });
            }
            return route.fulfill({ json: vehicleState });
          }

          if (path === '/departures/dep-bus-1/vehicle' && method === 'PUT') {
            vehiclePuts++;
            const body = route.request().postDataJSON();
            if (vehicleSaveFailsOnce && vehicleState.vehicle) {
              vehicleSaveFailsOnce = false;
              return route.fulfill({
                status: 409,
                json: { code: 'VEHICLE_CHANGE_CONFLICT', message: 'Cannot reduce vehicle capacity' },
              });
            }
            vehicleState = {
              vehicle: {
                id: 'veh-1',
                departure_id: 'dep-bus-1',
                org_id: 'org-1',
                vehicle_label: body.vehicleLabel || 'Bus dep-bus-1',
                registration_number: body.registrationNumber ?? null,
                capacity: body.capacity,
                layout_type: 'standard_2_plus_2',
                created_at: '2026-11-01T00:00:00Z',
                updated_at: '2026-11-01T00:00:00Z',
              },
              seats: makeSeats(body.capacity),
            };
            return route.fulfill({ json: vehicleState });
          }

          if (path === '/departures/dep-bus-1/passengers') {
            return route.fulfill({ json: { manifest: [] } });
          }

          return route.fulfill({ json: { data: [], total: 0 } });
        });

        // ── 1) Hotel allocation edit/operator → reload ──
        await page.goto('/e2e/finance-forms/allocation-vehicle.html?mode=allotment');
        await expect(page.getByRole('alert')).toHaveText(tx.loadFailed);
        await expect(page.getByText('PRIVATE allotment read failure')).toHaveCount(0);

        allocReadFails = false;
        await page.getByRole('button', { name: tx.retry, exact: true }).click();
        await expect(page.getByText('Synthetic Grand Hotel', { exact: true })).toBeVisible();

        const roomsInput = page.getByLabel(tx.departureRooms, { exact: true });
        await roomsInput.fill('1');
        await page.getByRole('button', { name: tx.save, exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText(tx.roomSlotOccupied);
        await expect(roomsInput).toHaveValue('1');

        // Toggle BS <-> EN while ROOM_SLOT_OCCUPIED banner is visible: alert re-localizes and draft stays intact
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toHaveText(otherTx.roomSlotOccupied);
        await expect(page.getByLabel(otherTx.departureRooms, { exact: true })).toHaveValue('1');
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toHaveText(tx.roomSlotOccupied);
        await expect(roomsInput).toHaveValue('1');

        // Reload confirms server allotment remained 3 after ROOM_SLOT_OCCUPIED
        await page.reload();
        await expect(page.getByLabel(tx.departureRooms, { exact: true })).toHaveValue('3');

        // Valid expansion 3 -> 5 persists across reload
        await page.getByLabel(tx.departureRooms, { exact: true }).fill('5');
        await page.getByRole('button', { name: tx.save, exact: true }).click();
        await expect(page.getByText(tx.saveSuccess, { exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByLabel(tx.departureRooms, { exact: true })).toHaveValue('5');
        expect(allocPatches).toBe(2);

        // ── 2) Bus vehicle create → edit (clear registration + shrink) → reload ──
        await page.goto('/e2e/finance-forms/allocation-vehicle.html?mode=vehicle');
        await expect(page.getByRole('alert')).toHaveText(vtx.vehicleLoadFailed);
        await expect(page.getByRole('button', { name: vtx.saveVehicle, exact: true })).toHaveCount(0);

        vehicleReadFails = false;
        await page.getByRole('button', { name: vtx.retryLoad, exact: true }).click();
        await expect(page.getByLabel(vtx.vehicleLabel, { exact: true })).toBeVisible();

        // Create vehicle
        await page.getByLabel(vtx.vehicleLabel, { exact: true }).fill('Sprinter 1');
        await page.getByLabel(vtx.registrationNumber, { exact: true }).fill('A12-K-345');
        await page.getByLabel(vtx.capacity, { exact: true }).fill('6');
        await page.getByRole('button', { name: vtx.saveVehicle, exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Sprinter 1', exact: true })).toBeVisible();
        await expect(page.getByText('A12-K-345', { exact: true })).toBeVisible();

        // Edit: first attempt fails with conflict, draft stays intact
        await page.getByLabel(vtx.vehicleLabel, { exact: true }).fill('Sprinter Clean');
        await page.getByLabel(vtx.registrationNumber, { exact: true }).fill('');
        await page.getByLabel(vtx.capacity, { exact: true }).fill('4');
        await page.getByRole('button', { name: vtx.saveVehicle, exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(vtx.vehicleChangeConflict);
        await expect(page.getByLabel(vtx.vehicleLabel, { exact: true })).toHaveValue('Sprinter Clean');
        await expect(page.getByLabel(vtx.registrationNumber, { exact: true })).toHaveValue('');

        // Toggle BS <-> EN while VEHICLE_CHANGE_CONFLICT banner is visible: alert re-localizes and draft stays intact
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toContainText(otherVtx.vehicleChangeConflict);
        await expect(page.getByLabel(otherVtx.vehicleLabel, { exact: true })).toHaveValue('Sprinter Clean');
        await expect(page.getByLabel(otherVtx.registrationNumber, { exact: true })).toHaveValue('');
        await expect(page.getByLabel(otherVtx.capacity, { exact: true })).toHaveValue('4');
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toContainText(vtx.vehicleChangeConflict);
        await expect(page.getByLabel(vtx.vehicleLabel, { exact: true })).toHaveValue('Sprinter Clean');

        // Retry edit succeeds, clears registration, shrinks to 4 active seats, and survives reload
        await page.getByRole('button', { name: vtx.saveVehicle, exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Sprinter Clean', exact: true })).toBeVisible();
        await expect(page.getByText('A12-K-345', { exact: true })).toHaveCount(0);

        await page.reload();
        await expect(page.getByRole('heading', { name: 'Sprinter Clean', exact: true })).toBeVisible();
        await expect(page.getByLabel(vtx.registrationNumber, { exact: true })).toHaveValue('');
        await expect(page.getByLabel(vtx.capacity, { exact: true })).toHaveValue('4');
        await expect(page.getByText('A12-K-345', { exact: true })).toHaveCount(0);
        expect(vehiclePuts).toBe(3);

        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        await page.screenshot({ path: info.outputPath('allocation-vehicle-reloaded.png') });
      });
    }
  }
}
