import { expect, test, type APIRequestContext } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const staffEmail = process.env.E2E_STAFF_EMAIL;
const staffPassword = process.env.E2E_STAFF_PASSWORD;
const otherTenantEmail = process.env.E2E_OTHER_TENANT_EMAIL;
const otherTenantPassword = process.env.E2E_OTHER_TENANT_PASSWORD;
const departureId = process.env.E2E_DEPARTURE_ID;
const customerId = process.env.E2E_CUSTOMER_ID;
const configured = Boolean(
  anonKey &&
  managerEmail &&
  managerPassword &&
  staffEmail &&
  staffPassword &&
  otherTenantEmail &&
  otherTenantPassword &&
  departureId &&
  customerId,
);
const browserConfigured = process.env.E2E_RUN_BROWSER === '1';

async function signIn(request: APIRequestContext, email = managerEmail, password = managerPassword) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey!, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(response.status(), `Supabase sign-in failed for ${email}`).toBe(200);
  const body = await response.json();
  expect(body.access_token).toEqual(expect.any(String));
  return body.access_token as string;
}

function reservationPayload() {
  return {
    departureId,
    customerId,
    customerName: 'Pilot Passenger',
    customerPhone: '+38761000001',
    partySize: 1,
    reservationAt: new Date().toISOString(),
    status: 'confirmed',
    totalAmount: 180,
    currency: 'BAM',
    source: 'agent',
    passengers: [{ full_name: 'Pilot Passenger' }],
  };
}

async function expectReservation(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect([200, 201, 202]).toContain(response.status());
  const body = await response.json();
  expect(body.id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
  expect(body.error).toBeUndefined();
  return body as { id: string; party_size: number; currency: string; creation_state?: string; creationState?: string };
}

async function expectCompletedReservation(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await expectReservation(response);
  expect(body.creation_state ?? body.creationState).toBe('completed');
  expect(body.recoveryRequired).toBe(false);
  return body;
}

test.describe('Travline browser pilot acceptance', () => {
  test.skip(!browserConfigured, 'BLOCKED: set E2E_RUN_BROWSER=1 with a running admin server');

  test('manager can authenticate through the real staging session', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page).toHaveTitle(/Travline|NMT/i);
    await page.locator('#signin-email').fill(managerEmail!);
    await page.locator('#signin-password').fill(managerPassword!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    await expect(page.locator('body')).not.toContainText(/organization context required|authentication required/i);
  });
});

test.describe('Travline API pilot acceptance', () => {
  test.beforeEach(() => {
    test.skip(!configured, 'BLOCKED: run local Supabase and seed:acceptance first');
  });

  test('New Sale retries are idempotent and concurrency-safe', async ({ request }) => {
    const token = await signIn(request);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const key = `pilot-same-key-${test.info().workerIndex}-${Date.now()}`;
    const payload = reservationPayload();
    const [first, retry] = await Promise.all([
      request.post(`${apiUrl}/api/reservations`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: payload,
      }),
      request.post(`${apiUrl}/api/reservations`, {
        headers: { ...headers, 'Idempotency-Key': key },
        data: payload,
      }),
    ]);
    const firstBody = await expectReservation(first);
    const retryBody = await expectReservation(retry);
    expect(retryBody.id).toBe(firstBody.id);

    const replay = await request.post(`${apiUrl}/api/reservations`, {
      headers: { ...headers, 'Idempotency-Key': key },
      data: payload,
    });
    const replayBody = await expectCompletedReservation(replay);
    expect(replayBody.id).toBe(firstBody.id);
  });

  test('different idempotency keys create independent reservations within capacity', async ({ request }) => {
    const token = await signIn(request, staffEmail, staffPassword);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const [left, right] = await Promise.all(
      ['pilot-independent-left', 'pilot-independent-right'].map((key) =>
        request.post(`${apiUrl}/api/reservations`, {
          headers: { ...headers, 'Idempotency-Key': `${key}-${test.info().workerIndex}-${Date.now()}` },
          data: { ...reservationPayload(), customerName: `Pilot ${key}` },
        }),
      ),
    );
    const leftBody = await expectCompletedReservation(left);
    const rightBody = await expectCompletedReservation(right);
    expect(rightBody.id).not.toBe(leftBody.id);
    expect(leftBody.party_size).toBe(1);
    expect(rightBody.party_size).toBe(1);
    expect(leftBody.currency).toBe('BAM');
    expect(rightBody.currency).toBe('BAM');
  });

  test('tenant isolation rejects a reservation created by another tenant', async ({ request }) => {
    const managerToken = await signIn(request);
    const created = await request.post(`${apiUrl}/api/reservations`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Idempotency-Key': `pilot-tenant-isolation-${test.info().workerIndex}-${Date.now()}`,
      },
      data: reservationPayload(),
    });
    const reservation = await expectCompletedReservation(created);

    const otherTenantToken = await signIn(request, otherTenantEmail, otherTenantPassword);
    const crossTenant = await request.get(`${apiUrl}/api/reservations/${reservation.id}`, {
      headers: { Authorization: `Bearer ${otherTenantToken}` },
    });
    expect(crossTenant.status()).toBe(404);
    expect(crossTenant.status()).not.toBe(401);
    expect(crossTenant.status()).not.toBe(403);
  });
});
