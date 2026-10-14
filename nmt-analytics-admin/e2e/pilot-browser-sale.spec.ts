import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = Boolean(process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD && process.env.E2E_SUPABASE_ANON_KEY);

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`completes a real New Sale and verifies its documents at ${viewport.width}px`, async ({ page, request }) => {
    test.skip(!configured, 'BLOCKED: isolated acceptance Auth/API environment required');
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      data: { email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
    const marker = `Browser ${viewport.width} ${Date.now()}`;
    const pkg = await request.post(`${apiUrl}/api/packages`, {
      headers,
      data: { name: marker, destination: 'Mostar', price: 180, currency: 'BAM', durationDays: 1, maxParticipants: 8, active: true, transportType: 'bus', transportCapacity: 8 },
    });
    expect(pkg.status(), await pkg.text()).toBe(201);
    const packageId = (await pkg.json()).id;
    const departure = await request.post(`${apiUrl}/api/departures`, {
      headers,
      data: { packageId, departAt: '2027-07-15T07:00:00+02:00', returnAt: '2027-07-15T20:00:00+02:00', capacity: 8, booked: 0, status: 'active', transportType: 'bus' },
    });
    expect(departure.status(), await departure.text()).toBe(201);
    const departureId = (await departure.json()).id;

    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await page.goto(`/reservations?departureId=${departureId}`);
    await page.getByRole('button', { name: '+ Nova rezervacija', exact: true }).click();
    const wizard = page.locator('.modal');
    await expect(wizard.getByText('Nova prodaja', { exact: true })).toBeVisible();
    await expect(wizard.getByRole('button').filter({ hasText: marker })).toBeVisible();
    await wizard.getByRole('button', { name: 'Dalje', exact: true }).click();
    await wizard.getByPlaceholder('Npr. Ahmed Hodžić').fill(marker);
    await wizard.getByPlaceholder('+387 61 234 567').fill('+38761000002');
    await wizard.getByRole('spinbutton').fill('2');
    await wizard.getByPlaceholder('Putnik 1 - puno ime').fill(`${marker} A`);
    await wizard.getByPlaceholder('Putnik 2 - puno ime').fill(`${marker} B`);
    // The wizard intentionally rejects progression until package services resolve.
    await expect(wizard.getByText('Dodatne usluge se još učitavaju...', { exact: true })).toBeHidden({ timeout: 15_000 });
    await wizard.getByRole('button', { name: 'Dalje', exact: true }).click();
    await expect(wizard.getByText('Način plaćanja', { exact: true })).toBeVisible();
    await wizard.getByPlaceholder('0.00').fill('360');
    await wizard.getByRole('button', { name: 'Dalje', exact: true }).click();
    await expect(wizard.getByText('Pregled prodaje', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const saleResponse = page.waitForResponse(response => response.url().endsWith('/api/reservations') && response.request().method() === 'POST');
    await wizard.getByRole('button', { name: 'Potvrdi prodaju', exact: true }).click();
    const sale = await saleResponse;
    expect(sale.status(), await sale.text()).toBe(201);
    const reservation = await sale.json();
    expect(reservation.creationState ?? reservation.creation_state).toBe('completed');
    await expect(wizard).toBeHidden();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();

    const manifest = await request.get(`${apiUrl}/api/departures/${departureId}/passengers`, { headers });
    expect(manifest.status()).toBe(200);
    const manifestBody = await manifest.json();
    const passengers = manifestBody.manifest || manifestBody.passengers || [];
    expect(passengers.filter((p: { reservationId?: string; reservation_id?: string }) => (p.reservationId || p.reservation_id) === reservation.id)).toHaveLength(2);
    const contractResponse = await request.post(`${apiUrl}/api/contracts`, { headers, data: { reservationId: reservation.id } });
    expect(contractResponse.status(), await contractResponse.text()).toBe(201);
    const contract = await contractResponse.json();
    expect(contract.currency).toBe('BAM');
    expect(contract.totalAmount).toBe(360);
    expect(contract.partySize).toBe(2);
    const pdf = await request.get(`${apiUrl}/api/contracts/${contract.id}/pdf`, { headers });
    expect(pdf.status(), await pdf.text()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
}
