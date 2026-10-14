import { expect, test } from '@playwright/test';

test('recovers a saved sale once, preserves passengers and permits payment only after completion', async ({ request }) => {
  const { E2E_API_URL: apiUrl, E2E_SUPABASE_URL: supabaseUrl, E2E_SUPABASE_ANON_KEY: anonKey,
    E2E_MANAGER_EMAIL: email, E2E_MANAGER_PASSWORD: password, E2E_RECOVERY_RESERVATION_ID: id,
    E2E_DEPARTURE_ID: departureId, E2E_CUSTOMER_ID: customerId } = process.env;
  test.skip(!apiUrl || !supabaseUrl || !anonKey || !email || !password || !id, 'BLOCKED: isolated recovery seed required');
  const login = await request.post(supabaseUrl + '/auth/v1/token?grant_type=password', {
    headers: { apikey: anonKey! }, data: { email, password },
  });
  expect(login.status()).toBe(200);
  const headers = { Authorization: 'Bearer ' + (await login.json()).access_token };
  const before = await request.get(apiUrl + '/api/reservations/' + id, { headers });
  expect(before.status()).toBe(200); expect((await before.json()).creationState).toBe('recovery_required');
  const blocked = await request.post(apiUrl + '/api/payments', { headers, data: { reservation_id: id, amount: 20, currency: 'BAM' } });
  expect(blocked.status()).toBe(409); expect((await blocked.json()).code).toBe('SALE_NOT_COMPLETE');
  const payload = {
    departureId, customerId, customerName: 'Recovered Pilot Customer', customerPhone: '+38761000003',
    partySize: 1, reservationAt: new Date().toISOString(), status: 'pending', totalAmount: 180, currency: 'BAM', source: 'agent',
    passengers: [{ full_name: 'Recovered Pilot Passenger' }], installmentCount: 2,
  };
  const retryHeaders = { ...headers, 'Idempotency-Key': 'acceptance-recovery-installments' };
  const responses = await Promise.all([0, 1].map(() => request.post(apiUrl + '/api/reservations', { headers: retryHeaders, data: payload })));
  for (const response of responses) {
    expect([200, 202], await response.text()).toContain(response.status()); expect((await response.json()).id).toBe(id);
  }
  const settled = await request.post(apiUrl + '/api/reservations', { headers: retryHeaders, data: payload });
  expect(settled.status(), await settled.text()).toBe(200); expect((await settled.json()).creationState).toBe('completed');
  const schedule = await request.get(apiUrl + '/api/reservations/' + id + '/installments', { headers });
  expect(schedule.status()).toBe(200); const rows = (await schedule.json()).installments;
  expect(rows).toHaveLength(2); expect(rows.map((row: { amount: number }) => row.amount)).toEqual([90, 90]);
  const manifest = await request.get(apiUrl + '/api/departures/' + departureId + '/passengers', { headers });
  expect(manifest.status()).toBe(200);
  const passengers = (await manifest.json()).manifest;
  expect(passengers.filter((row: { reservationId?: string; reservation_id?: string }) => (row.reservationId || row.reservation_id) === id)).toHaveLength(1);
  const payment = await request.post(apiUrl + '/api/payments', { headers, data: { reservation_id: id, installment_id: rows[0].id, amount: 90, currency: 'BAM', status: 'succeeded' } });
  expect(payment.status(), await payment.text()).toBe(201); expect((await payment.json()).reservation.paidAmount).toBe(90);
});
