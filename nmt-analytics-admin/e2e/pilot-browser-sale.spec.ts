import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const configured = Boolean(process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD && process.env.E2E_SUPABASE_ANON_KEY);

for (const theme of ['light', 'dark']) for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`completes a real New Sale and verifies its documents in ${theme} at ${viewport.width}px`, async ({ page, request }, testInfo) => {
    test.skip(!configured, 'BLOCKED: isolated acceptance Auth/API environment required');
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    // Seed once; subsequent reload checks must prove actual theme persistence.
    await page.goto('/auth/signin');
    await page.evaluate(theme => { localStorage.setItem('theme', theme); localStorage.setItem('travline_lang', 'en'); }, theme);
    const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      data: { email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD },
    });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
    const marker = `Browser ${theme} ${viewport.width} ${Date.now()}`;
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
    await page.getByRole('button', { name: '+ New reservation', exact: true }).click();
    const wizard = page.locator('.modal');
    await expect(wizard.getByText("New sale", { exact: true })).toBeVisible();
    await expect(wizard.getByRole('button').filter({ hasText: marker })).toBeVisible();
    // Drive the actual selection rather than racing asynchronous URL preselection.
    await wizard.getByRole('button').filter({ hasText: marker }).click();
    const departureChoice = wizard.getByRole('button').filter({ hasText: '15/07/2027 → 15/07/2027' });
    await expect(departureChoice).toBeVisible();
    await departureChoice.click();
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await expect(wizard.getByText("Enter the client name.", { exact: true })).toBeVisible();
    await wizard.getByPlaceholder("e.g. Ahmed Hodžić").fill(marker);
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await expect(wizard.getByText("Enter the phone number.", { exact: true })).toBeVisible();
    await wizard.getByPlaceholder('+387 61 234 567').fill('+38761000002');
    await wizard.getByRole('spinbutton').fill('2');
    await wizard.getByPlaceholder('Traveler 1 - full name').fill(`${marker} A`);
    await wizard.getByPlaceholder('Traveler 2 - full name').fill(`${marker} B`);
    // The wizard intentionally rejects progression until package services resolve.
    await expect(wizard.getByText("Package services are still loading...", { exact: true })).toBeHidden({ timeout: 15_000 });
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await expect(wizard.getByText("Payment plan", { exact: true })).toBeVisible();
    await wizard.getByRole('button', { name: "Back", exact: true }).click();
    await expect(wizard.getByPlaceholder("e.g. Ahmed Hodžić")).toHaveValue(marker);
    await expect(wizard.getByPlaceholder('+387 61 234 567')).toHaveValue('+38761000002');
    await expect(wizard.getByPlaceholder('Traveler 2 - full name')).toHaveValue(`${marker} B`);
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await wizard.getByPlaceholder('0.00').fill('360');
    await wizard.getByRole('button', { name: "Next", exact: true }).click();
    await expect(wizard.getByText("Sale review", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
    await page.screenshot({ path: testInfo.outputPath('sale-review.png'), fullPage: true });
    let releasePost!: () => void;
    let createRequests = 0;
    const postGate = new Promise<void>(resolve => { releasePost = resolve; });
    await page.route('**/api/reservations', async route => {
      if (route.request().method() === 'POST') {
        createRequests++;
        await postGate;
      }
      await route.continue();
    });
    const saleResponse = page.waitForResponse(response => response.url().endsWith('/api/reservations') && response.request().method() === 'POST');
    await wizard.getByRole('button', { name: "Confirm sale", exact: true }).click();
    try {
      await expect.poll(() => createRequests).toBe(1);
      // A real pending HTTP request keeps the submit control disabled.
      // No synthetic response replaces the API or database operation.
      await expect(wizard.getByRole('button', { name: "Creating...", exact: true })).toBeDisabled();
    } finally {
      releasePost();
    }
    const sale = await saleResponse;
    expect(sale.status(), await sale.text()).toBe(201);
    const reservation = await sale.json();
    expect(reservation.creationState ?? reservation.creation_state).toBe('completed');
    await expect(wizard).toBeHidden();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
    expect(createRequests).toBe(1);
    await page.reload();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);

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
