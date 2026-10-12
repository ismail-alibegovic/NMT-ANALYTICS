import { expect, test, type APIRequestContext } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const departureId = process.env.E2E_DEPARTURE_ID;
const customerId = process.env.E2E_CUSTOMER_ID;
const configured = Boolean(anonKey && managerEmail && managerPassword && departureId && customerId);
const browserConfigured = process.env.E2E_RUN_BROWSER === '1';

async function signIn(request: APIRequestContext) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey! },
    data: { email: managerEmail, password: managerPassword },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

test.describe('Travline browser pilot acceptance', () => {
  test.skip(!browserConfigured, 'BLOCKED: set E2E_RUN_BROWSER=1 with a running admin server');

  test('admin shell is reachable', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page).toHaveTitle(/Travline|NMT/i);
  });
});

test.describe('Travline API pilot acceptance', () => {
  test('New Sale is idempotent for repeated submissions', async ({ request }) => {
    test.skip(!configured, 'BLOCKED: run local Supabase and seed:acceptance first');
    const token = await signIn(request);
    const key = `playwright-${Date.now()}`;
    const payload = {
      departureId, customerId, customerName: 'Pilot Passenger', customerPhone: '+38761000001',
      partySize: 1, reservationAt: new Date().toISOString(), status: 'confirmed',
      totalAmount: 180, currency: 'BAM', source: 'agent', passengers: [{ full_name: 'Pilot Passenger' }],
    };
    const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': key };
    const [first, retry] = await Promise.all([
      request.post(`${apiUrl}/api/reservations`, { headers, data: payload }),
      request.post(`${apiUrl}/api/reservations`, { headers, data: payload }),
    ]);
    expect([200, 201, 202]).toContain(first.status());
    expect([200, 201, 202]).toContain(retry.status());
    const firstBody = await first.json();
    const retryBody = await retry.json();
    expect(firstBody.id).toBe(retryBody.id);
  });
});
