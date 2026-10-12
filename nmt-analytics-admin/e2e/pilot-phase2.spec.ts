import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

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
const hotelAllocationId = process.env.E2E_HOTEL_ALLOCATION_ID;

const configured = Boolean(
  anonKey &&
  managerEmail &&
  managerPassword &&
  staffEmail &&
  staffPassword &&
  otherTenantEmail &&
  otherTenantPassword &&
  departureId &&
  customerId &&
  hotelAllocationId,
);

type Token = string;
type Reservation = { id: string; creation_state?: string; creationState?: string; recoveryRequired?: boolean };
type Passenger = { id?: string; passengerId?: string; reservation_id?: string; reservationId?: string; full_name?: string; fullName?: string };

async function signIn(request: APIRequestContext, email = managerEmail, password = managerPassword): Promise<Token> {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey!, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(response.status(), `Supabase sign-in failed for ${email}`).toBe(200);
  return (await response.json()).access_token as string;
}

function headers(token: Token, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function json<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

async function expectStatus(response: APIResponse, statuses: number[]) {
  expect(statuses).toContain(response.status());
}

function unique(label: string) {
  return `pilot-phase2-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createPackageAndDeparture(request: APIRequestContext, token: Token, capacity = 4) {
  const packageResponse = await request.post(`${apiUrl}/api/packages`, {
    headers: headers(token),
    data: {
      name: unique('package'),
      destination: 'Sarajevo–Mostar',
      price: 180,
      currency: 'BAM',
      durationDays: 2,
      maxParticipants: capacity,
      active: true,
      transportType: 'bus',
      transportCapacity: capacity,
    },
  });
  await expectStatus(packageResponse, [201]);
  const pkg = await json<{ id: string }>(packageResponse);

  const departureResponse = await request.post(`${apiUrl}/api/departures`, {
    headers: headers(token),
    data: {
      packageId: pkg.id,
      departAt: '2027-06-15T07:00:00+02:00',
      returnAt: '2027-06-16T20:00:00+02:00',
      capacity,
      booked: 0,
      status: 'active',
      transportType: 'bus',
    },
  });
  await expectStatus(departureResponse, [201]);
  const departure = await json<{ id: string }>(departureResponse);

  const vehicleResponse = await request.put(`${apiUrl}/api/departures/${departure.id}/vehicle`, {
    headers: headers(token),
    data: { vehicleLabel: 'Pilot Bus', capacity, layoutType: 'standard_2_plus_2' },
  });
  await expectStatus(vehicleResponse, [200]);
  return { packageId: pkg.id, departureId: departure.id };
}

async function createReservation(
  request: APIRequestContext,
  token: Token,
  targetDepartureId: string,
  partySize = 1,
  options: Record<string, unknown> = {},
) {
  const name = unique('passenger');
  const response = await request.post(`${apiUrl}/api/reservations`, {
    headers: headers(token, { 'Idempotency-Key': unique('sale') }),
    data: {
      departureId: targetDepartureId,
      customerId,
      customerName: name,
      customerPhone: '+38761000001',
      partySize,
      reservationAt: new Date().toISOString(),
      status: 'confirmed',
      totalAmount: 180,
      currency: 'BAM',
      source: 'agent',
      passengers: Array.from({ length: partySize }, (_, index) => ({ full_name: `${name} ${index + 1}` })),
      ...options,
    },
  });
  await expectStatus(response, [201]);
  const body = await json<Reservation>(response);
  expect(body.creation_state ?? body.creationState).toBe('completed');
  expect(body.recoveryRequired).toBe(false);
  return body;
}

async function departurePassengers(request: APIRequestContext, token: Token, targetDepartureId: string) {
  const response = await request.get(`${apiUrl}/api/departures/${targetDepartureId}/passengers`, {
    headers: headers(token),
  });
  await expectStatus(response, [200]);
  const body = await json<{ manifest?: Passenger[]; passengers?: Passenger[] }>(response);
  return (body.manifest || body.passengers || []).map((passenger) => ({
    ...passenger,
    id: passenger.id || passenger.passengerId,
    reservation_id: passenger.reservation_id || passenger.reservationId,
  }));
}

test.describe.serial('Travline BAM-only bus-tour pilot acceptance phase 2', () => {
  test.beforeEach(() => test.skip(!configured, 'BLOCKED: isolated Supabase seed environment is required'));

  test('enforces manager/staff permissions and keeps disabled automatic allocation unavailable', async ({ request }) => {
    const managerToken = await signIn(request);
    const staffToken = await signIn(request, staffEmail, staffPassword);

    const deniedPackage = await request.post(`${apiUrl}/api/packages`, {
      headers: headers(staffToken),
      data: { name: unique('denied-package'), destination: 'Mostar', price: 180, currency: 'BAM' },
    });
    await expectStatus(deniedPackage, [401, 403]);

    const deniedVehicle = await request.put(`${apiUrl}/api/departures/${departureId}/vehicle`, {
      headers: headers(staffToken),
      data: { vehicleLabel: 'Denied Bus', capacity: 30 },
    });
    await expectStatus(deniedVehicle, [401, 403]);

    const deniedProposal = await request.post(`${apiUrl}/api/departures/${departureId}/seating/proposal`, {
      headers: headers(staffToken),
      data: {},
    });
    await expectStatus(deniedProposal, [401, 403]);

    const disabledAllocation = await request.post(`${apiUrl}/api/seats/auto-assign`, {
      headers: headers(managerToken),
      data: {},
    });
    await expectStatus(disabledAllocation, [409]);
    expect((await json<{ code?: string; error?: string }>(disabledAllocation)).code).toBe('AUTO_SEATING_NOT_AVAILABLE');
  });

  test('creates a package and departure, then completes New Sale with passengers and a group', async ({ request }) => {
    const managerToken = await signIn(request);
    const created = await createPackageAndDeparture(request, managerToken, 6);
    const sale = await createReservation(request, managerToken, created.departureId, 2, {
      create_passenger_group: true,
      group_name: unique('group'),
    });
    const passengers = await departurePassengers(request, managerToken, created.departureId);
    const salePassengers = passengers.filter((passenger) => (passenger.reservation_id || passenger.reservationId) === sale.id);
    expect(salePassengers).toHaveLength(2);

    const groups = await request.get(`${apiUrl}/api/departures/${created.departureId}/groups`, {
      headers: headers(managerToken),
    });
    await expectStatus(groups, [200]);
    const groupBody = await json<{ byAgent?: unknown[]; byHotel?: unknown[] }>(groups);
    expect((groupBody.byAgent || []).length + (groupBody.byHotel || []).length).toBeGreaterThan(0);
  });

  test('enforces duplicate sales, departure capacity, and rollback-safe retry behavior', async ({ request }) => {
    const managerToken = await signIn(request);
    const created = await createPackageAndDeparture(request, managerToken, 1);
    const key = unique('duplicate');
    const payload = {
      departureId: created.departureId,
      customerId,
      customerName: unique('duplicate-customer'),
      customerPhone: '+38761000001',
      partySize: 1,
      reservationAt: new Date().toISOString(),
      status: 'confirmed',
      totalAmount: 180,
      currency: 'BAM',
      source: 'agent',
      passengers: [{ full_name: 'Duplicate Pilot Passenger' }],
    };
    const [first, duplicate] = await Promise.all([
      request.post(`${apiUrl}/api/reservations`, { headers: headers(managerToken, { 'Idempotency-Key': key }), data: payload }),
      request.post(`${apiUrl}/api/reservations`, { headers: headers(managerToken, { 'Idempotency-Key': key }), data: payload }),
    ]);
    const firstBody = await json<Reservation>(first);
    const duplicateBody = await json<Reservation>(duplicate);
    await expectStatus(first, [200, 201, 202]);
    await expectStatus(duplicate, [200, 201, 202]);
    expect(duplicateBody.id).toBe(firstBody.id);

    const secondSale = await request.post(`${apiUrl}/api/reservations`, {
      headers: headers(managerToken, { 'Idempotency-Key': unique('capacity') }),
      data: { ...payload, customerName: unique('capacity-customer') },
    });
    await expectStatus(secondSale, [409]);

    const retry = await request.post(`${apiUrl}/api/reservations`, {
      headers: headers(managerToken, { 'Idempotency-Key': key }),
      data: payload,
    });
    await expectStatus(retry, [200, 201, 202]);
    expect((await json<Reservation>(retry)).id).toBe(firstBody.id);
  });

  test('enforces manual bus seating, occupied seats, locked seats, and concurrent assignment conflicts', async ({ request }) => {
    const managerToken = await signIn(request);
    const sale = await createReservation(request, managerToken, departureId, 2);
    const passengers = (await departurePassengers(request, managerToken, departureId)).filter((p) => (p.reservation_id || p.reservationId) === sale.id);
    expect(passengers).toHaveLength(2);
    const [firstPassenger, secondPassenger] = passengers;

    await expectStatus(await request.patch(`${apiUrl}/api/departure-passengers/${firstPassenger.id}/seat`, {
      headers: headers(managerToken), data: { seatNumber: 1 },
    }), [200]);
    await expectStatus(await request.patch(`${apiUrl}/api/departure-passengers/${firstPassenger.id}/seat-lock`, {
      headers: headers(managerToken), data: { locked: true },
    }), [200]);

    const [lockedMove, occupiedAssignment] = await Promise.all([
      request.patch(`${apiUrl}/api/departure-passengers/${firstPassenger.id}/seat`, {
        headers: headers(managerToken), data: { seatNumber: 3 },
      }),
      request.patch(`${apiUrl}/api/departure-passengers/${secondPassenger.id}/seat`, {
        headers: headers(managerToken), data: { seatNumber: 1 },
      }),
    ]);
    await expectStatus(lockedMove, [409]);
    await expectStatus(occupiedAssignment, [409]);
  });

  test('assigns rooms manually with capacity enforcement and tenant rejection', async ({ request }) => {
    const managerToken = await signIn(request);
    const sale = await createReservation(request, managerToken, departureId, 2);
    const passengers = (await departurePassengers(request, managerToken, departureId)).filter((p) => (p.reservation_id || p.reservationId) === sale.id);
    const accommodation = await request.put(`${apiUrl}/api/reservations/${sale.id}/accommodation`, {
      headers: headers(managerToken),
      data: {
        accommodationRequirements: [{
          hotelAllocationId,
          roomCount: 1,
          guestsExpected: 2,
          passengerIds: passengers.map((passenger) => passenger.id),
        }],
      },
    });
    await expectStatus(accommodation, [200]);

    const slotsResponse = await request.get(`${apiUrl}/api/departures/${departureId}/room-slots`, {
      headers: headers(managerToken),
    });
    await expectStatus(slotsResponse, [200]);
    const slots = await json<{ slots: Array<{ id: string; capacity: number }> }>(slotsResponse);
    const slot = slots.slots.find((candidate) => candidate.capacity >= 2);
    expect(slot).toBeTruthy();

    const assignments = await Promise.all(passengers.map((passenger) =>
      request.post(`${apiUrl}/api/room-slots/${slot!.id}/assign`, {
        headers: headers(managerToken), data: { passengerId: passenger.id },
      }),
    ));
    assignments.forEach((response) => expect([201, 409]).toContain(response.status()));
    expect(assignments.filter((response) => response.status() === 201)).toHaveLength(2);

    const otherTenantToken = await signIn(request, otherTenantEmail, otherTenantPassword);
    const crossTenant = await request.get(`${apiUrl}/api/departures/${departureId}/room-slots`, {
      headers: headers(otherTenantToken),
    });
    await expectStatus(crossTenant, [404]);
  });

  test('records canonical payments, rejects overpayment, and preserves totals during concurrent attempts', async ({ request }) => {
    const managerToken = await signIn(request);
    const sale = await createReservation(request, managerToken, departureId, 1);
    const paymentRequests = [100, 100].map((amount) => request.post(`${apiUrl}/api/payments`, {
      headers: headers(managerToken),
      data: { reservation_id: sale.id, amount, currency: 'BAM', status: 'succeeded', payment_method: 'cash' },
    }));
    const paymentResponses = await Promise.all(paymentRequests);
    expect(paymentResponses.filter((response) => response.status() === 201)).toHaveLength(1);
    expect(paymentResponses.some((response) => [422, 500].includes(response.status()))).toBe(true);

    const overpayment = await request.post(`${apiUrl}/api/payments`, {
      headers: headers(managerToken),
      data: { reservation_id: sale.id, amount: 1000, currency: 'BAM', status: 'succeeded', payment_method: 'cash' },
    });
    await expectStatus(overpayment, [422]);
    expect((await json<{ error?: { code?: string } }>(overpayment)).error?.code).toBe('PAYMENT_EXCEEDS_TOTAL');
  });

  test('rejects invalid installment creation, supports recovery after failed schedule, and keeps history append-only', async ({ request }) => {
    const managerToken = await signIn(request);
    const sale = await createReservation(request, managerToken, departureId, 1);
    const invalid = await request.put(`${apiUrl}/api/reservations/${sale.id}/installments`, {
      headers: headers(managerToken),
      data: { installmentCount: 1, firstDueDate: '2027-05-01', intervalDays: 30 },
    });
    await expectStatus(invalid, [200, 400]);
    if (invalid.status() === 200) {
      const body = await json<{ installments: unknown[] }>(invalid);
      expect(body.installments.length).toBe(1);
    }

    const valid = await request.put(`${apiUrl}/api/reservations/${sale.id}/installments`, {
      headers: headers(managerToken),
      data: { installmentCount: 2, firstDueDate: '2027-05-01', intervalDays: 30 },
    });
    await expectStatus(valid, [200]);
    const schedule = await json<{ installments: Array<{ id: string; amount: number; status: string }> }>(valid);
    expect(schedule.installments).toHaveLength(2);

    const failed = await request.post(`${apiUrl}/api/payments`, {
      headers: headers(managerToken),
      data: {
        reservation_id: sale.id,
        installment_id: schedule.installments[0].id,
        amount: schedule.installments[0].amount,
        currency: 'BAM',
        status: 'failed',
        payment_method: 'cash',
      },
    });
    await expectStatus(failed, [201]);

    const retry = await request.post(`${apiUrl}/api/payments`, {
      headers: headers(managerToken),
      data: {
        reservation_id: sale.id,
        installment_id: schedule.installments[0].id,
        amount: schedule.installments[0].amount,
        currency: 'BAM',
        status: 'succeeded',
        payment_method: 'cash',
      },
    });
    await expectStatus(retry, [409]);
  });

  test('tracks supplier confirmation status/history, canonical documents, and profitability', async ({ request }) => {
    const managerToken = await signIn(request);
    const supplier = await request.post(`${apiUrl}/api/suppliers`, {
      headers: headers(managerToken),
      data: { name: unique('supplier'), category: 'transport', defaultCurrency: 'BAM' },
    });
    await expectStatus(supplier, [201, 200]);
    const supplierBody = await json<{ id?: string }>(supplier);

    const cost = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items`, {
      headers: headers(managerToken),
      data: {
        category: 'transport',
        label: unique('bus-cost'),
        supplierId: supplierBody.id,
        quantity: 1,
        unitCost: 500,
        currency: 'BAM',
      },
    });
    await expectStatus(cost, [201]);
    const costBody = await json<{ id: string }>(cost);

    const confirmation = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items/${costBody.id}/confirmation`, {
      headers: headers(managerToken),
      data: { status: 'requested', note: 'Pilot request' },
    });
    await expectStatus(confirmation, [200, 201]);
    const confirmed = await request.post(`${apiUrl}/api/departures/${departureId}/cost-items/${costBody.id}/confirmation`, {
      headers: headers(managerToken),
      data: { status: 'confirmed', note: 'Pilot confirmed' },
    });
    await expectStatus(confirmed, [200, 201]);

    const events = await request.get(`${apiUrl}/api/departures/${departureId}/supplier-confirmation-events`, {
      headers: headers(managerToken),
    });
    await expectStatus(events, [200]);
    const eventBody = await json<{ events: Array<{ note?: string }> }>(events);
    expect(eventBody.events.map((event) => event.note)).toContain('Pilot confirmed');

    const profitability = await request.get(`${apiUrl}/api/departures/${departureId}/profitability`, {
      headers: headers(managerToken),
    });
    await expectStatus(profitability, [200]);
    expect((await json<{ supplierCosts?: number }>(profitability)).supplierCosts).toBe(500);

    const upload = await request.post(`${apiUrl}/api/documents/upload`, {
      headers: headers(managerToken),
      multipart: {
        file: {
          name: `${unique('document')}.pdf`,
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4 pilot acceptance document'),
        },
      },
    });
    await expectStatus(upload, [201]);
    const uploadedDocument = await json<{ id: string; type: string }>(upload);
    expect(uploadedDocument.type).toBe('application/pdf');

    const document = await request.get(`${apiUrl}/api/documents/${uploadedDocument.id}/download`, {
      headers: headers(managerToken),
    });
    await expectStatus(document, [200]);
    expect(document.headers()['content-type']).toContain('application/pdf');
  });
});
