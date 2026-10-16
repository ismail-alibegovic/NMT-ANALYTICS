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

const configured = Boolean(
  anonKey && managerEmail && managerPassword && staffEmail && staffPassword && otherTenantEmail && otherTenantPassword,
);

async function signIn(request: APIRequestContext, email?: string, password?: string): Promise<string> {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey!, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(response.status(), `Supabase sign-in failed for ${email}`).toBe(200);
  return (await response.json()).access_token as string;
}

function importCustomers(request: APIRequestContext, token: string, csv: string, query = '') {
  return request.post(`${apiUrl}/api/import/customers${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') } },
  });
}

async function findCustomer(request: APIRequestContext, token: string, phone: string) {
  const response = await request.get(`${apiUrl}/api/customers?search=${encodeURIComponent(phone)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return ((body.data ?? body) as { phone?: string }[]).filter((c) => c.phone === phone);
}

test.describe('Import security (isolated Supabase)', () => {
  test.skip(!configured, 'BLOCKED: isolated acceptance Auth/API environment required');

  test('agent is forbidden; manager imports; other tenant neither sees nor blocks; duplicates and reservations are rejected', async ({ request }) => {
    const phone = `+3876${Date.now().toString().slice(-7)}`;
    const csv = `fullName,phone,email\nImport Probe,${phone},probe@example.test`;

    const agent = await signIn(request, staffEmail, staffPassword);
    const manager = await signIn(request, managerEmail, managerPassword);
    const other = await signIn(request, otherTenantEmail, otherTenantPassword);

    const denied = await importCustomers(request, agent, csv);
    expect(denied.status()).toBe(403);
    expect(await findCustomer(request, manager, phone)).toHaveLength(0);

    const ok = await importCustomers(request, manager, csv);
    expect(ok.status()).toBe(200);
    expect((await ok.json()).results.importedCount).toBe(1);
    expect(await findCustomer(request, manager, phone)).toHaveLength(1);
    expect(await findCustomer(request, other, phone)).toHaveLength(0);

    const again = await importCustomers(request, manager, csv);
    expect(again.status()).toBe(422);
    expect(await findCustomer(request, manager, phone)).toHaveLength(1);

    const otherOk = await importCustomers(request, other, csv);
    expect(otherOk.status()).toBe(200);

    for (const entity of ['reservations', 'departures']) {
      const disabled = await request.post(`${apiUrl}/api/import/${entity}`, {
        headers: { Authorization: `Bearer ${manager}` },
        multipart: { file: { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('a\n1') } },
      });
      expect(disabled.status()).toBe(410);
    }
  });
});
