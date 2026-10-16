import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const auth = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const enabled = /^http:\/\/(127\.0\.0\.1|localhost):/.test(api) && /^http:\/\/(127\.0\.0\.1|localhost):/.test(auth) && Boolean(process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD && process.env.E2E_DEPARTURE_ID && process.env.E2E_CUSTOMER_ID);
test('concurrent payment retries create one ledger entry and preserve tenant isolation', async ({ request }) => {
  test.skip(!enabled, 'Requires disposable seeded Supabase');
  const login = async (email: string, password: string) => {
    const response = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! }, data: { email, password },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).access_token;
  };
  const token = await login(process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!);
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post(`${api}/api/reservations`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: {
    departureId: process.env.E2E_DEPARTURE_ID, customerId: process.env.E2E_CUSTOMER_ID,
    customerName: 'Idempotency Pilot', customerPhone: '+38761000001', partySize: 1,
    reservationAt: new Date().toISOString(), status: 'confirmed', totalAmount: 180, currency: 'BAM', source: 'agent',
    passengers: [{ full_name: 'Idempotency Pilot' }],
  } });
  expect([200, 201]).toContain(created.status());
  const reservation = await created.json();
  const payload = { reservation_id: reservation.id, amount: 180, currency: 'BAM', idempotency_key: randomUUID() };
  const responses = await Promise.all(Array.from({ length: 4 }, () => request.post(`${api}/api/payments`, { headers, data: payload })));
  expect(responses.map(r => r.status()).sort()).toEqual([200, 200, 200, 201]);
  const bodies = await Promise.all(responses.map(r => r.json()));
  expect(new Set(bodies.map(b => b.payment.id)).size).toBe(1);
  const list = await request.get(`${api}/api/payments?reservation_id=${reservation.id}`, { headers });
  expect(list.status()).toBe(200);
  expect((await list.json()).data.filter((p: { status: string }) => p.status === 'succeeded')).toHaveLength(1);
  const replay = await request.post(`${api}/api/payments`, { headers, data: payload });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).reservation.paidAmount).toBe(180);
  const conflict = await request.post(`${api}/api/payments`, { headers, data: { ...payload, amount: 179 } });
  expect(conflict.status()).toBe(409);
  const otherToken = await login(process.env.E2E_OTHER_TENANT_EMAIL!, process.env.E2E_OTHER_TENANT_PASSWORD!);
  expect((await request.post(`${api}/api/payments`, { headers: { Authorization: `Bearer ${otherToken}` }, data: payload })).status()).toBe(404);
});
