import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const otherTenantEmail = process.env.E2E_OTHER_TENANT_EMAIL;
const otherTenantPassword = process.env.E2E_OTHER_TENANT_PASSWORD;

const configured = Boolean(
  anonKey &&
  managerEmail &&
  managerPassword &&
  otherTenantEmail &&
  otherTenantPassword,
);

type Token = string;

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
  expect(statuses, `Unexpected response from ${response.url()}: ${await response.text()}`).toContain(response.status());
}

function unique(label: string) {
  return `scenario-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('Complete Business Scenarios (M13, M15, M19, M20, M24)', () => {
  test('executes complete flight tour scenario with manifest documents and traveler passports', async ({ request }) => {
    test.skip(!configured, 'BLOCKED: Isolated Auth/API environment required');

    const token = await signIn(request);

    // 1. Create Flight Package
    const pkgRes = await request.post(`${apiUrl}/api/packages`, {
      headers: headers(token),
      data: {
        name: unique('Flight Istanbul'),
        destination: 'Istanbul',
        price: 850,
        currency: 'BAM',
        durationDays: 5,
        maxParticipants: 20,
        active: true,
        transportType: 'flight',
      },
    });
    await expectStatus(pkgRes, [201]);
    const pkg = await json<{ id: string }>(pkgRes);

    // 2. Create Departure
    const depRes = await request.post(`${apiUrl}/api/departures`, {
      headers: headers(token),
      data: {
        packageId: pkg.id,
        departAt: '2027-09-10T08:00:00Z',
        returnAt: '2027-09-15T18:00:00Z',
        capacity: 20,
        booked: 0,
        status: 'active',
        transportType: 'flight',
      },
    });
    await expectStatus(depRes, [201]);
    const departure = await json<{ id: string }>(depRes);

    // 3. Create and Attach Flights (outbound & return)
    const flightOutRes = await request.post(`${apiUrl}/api/flights`, {
      headers: headers(token),
      data: {
        airline: 'Turkish Airlines',
        flightNumber: 'TK101',
        departureAirport: 'SJJ',
        arrivalAirport: 'IST',
        departureTime: '2027-09-10T08:30:00Z',
        arrivalTime: '2027-09-10T12:00:00Z',
        capacity: 180,
        basePrice: 350,
        currency: 'BAM',
      },
    });
    await expectStatus(flightOutRes, [201]);
    const flightOut = await json<{ id: string }>(flightOutRes);

    const flightRetRes = await request.post(`${apiUrl}/api/flights`, {
      headers: headers(token),
      data: {
        airline: 'Turkish Airlines',
        flightNumber: 'TK102',
        departureAirport: 'IST',
        arrivalAirport: 'SJJ',
        departureTime: '2027-09-15T15:00:00Z',
        arrivalTime: '2027-09-15T16:30:00Z',
        capacity: 180,
        basePrice: 350,
        currency: 'BAM',
      },
    });
    await expectStatus(flightRetRes, [201]);
    const flightRet = await json<{ id: string }>(flightRetRes);

    const attachOut = await request.post(`${apiUrl}/api/departures/${departure.id}/flights`, {
      headers: headers(token),
      data: { flightId: flightOut.id, direction: 'outbound' },
    });
    await expectStatus(attachOut, [201]);

    const attachRet = await request.post(`${apiUrl}/api/departures/${departure.id}/flights`, {
      headers: headers(token),
      data: { flightId: flightRet.id, direction: 'return' },
    });
    await expectStatus(attachRet, [201]);

    // 4. Create Reservation with Passengers containing passport numbers
    const resRes = await request.post(`${apiUrl}/api/reservations`, {
      headers: headers(token),
      data: {
        departureId: departure.id,
        customerName: 'Adnan Cengic',
        customerPhone: '+38761111222',
        partySize: 2,
        reservationAt: new Date().toISOString(),
        totalAmount: 1700,
        currency: 'BAM',
        status: 'confirmed',
        passengers: [
          {
            full_name: 'Adnan Cengic',
            phone: '+38761111222',
            email: 'adnan@example.ba',
            id_document_type: 'passport',
            id_document_number: 'B1234567',
            id_document_expiry: '2029-05-20',
            nationality: 'BIH',
            date_of_birth: '1988-04-12',
          },
          {
            full_name: 'Lejla Cengic',
            phone: '+38761111223',
            email: 'lejla@example.ba',
            id_document_type: 'passport',
            id_document_number: 'B7654321',
            id_document_expiry: '2028-11-15',
            nationality: 'BIH',
            date_of_birth: '1990-09-24',
          },
        ],
      },
    });
    await expectStatus(resRes, [201]);
    const reservation = await json<{ id: string }>(resRes);

    // 5. Verify Passenger Manifest returns travel document details
    const maniRes = await request.get(`${apiUrl}/api/departures/${departure.id}/passengers`, {
      headers: headers(token),
    });
    await expectStatus(maniRes, [200]);
    const mani = await json<{ manifest: Array<{ fullName: string; id_document_number: string; nationality: string }> }>(maniRes);
    expect(mani.manifest.length).toBe(2);
    const p1 = mani.manifest.find((p) => p.fullName === 'Adnan Cengic');
    expect(p1?.id_document_number).toBe('B1234567');
    expect(p1?.nationality).toBe('BIH');

    // 6. Verify Manifest PDF generation
    const pdfRes = await request.get(`${apiUrl}/api/departures/${departure.id}/manifest.pdf`, {
      headers: headers(token),
    });
    await expectStatus(pdfRes, [200]);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');

    // 7. Verify Reservation Voucher PDF generation
    const voucherRes = await request.get(`${apiUrl}/api/reservations/${reservation.id}/voucher.pdf`, {
      headers: headers(token),
    });
    await expectStatus(voucherRes, [200]);
    expect(voucherRes.headers()['content-type']).toContain('application/pdf');
  });

  test('executes tailor-made DMC workflow with supplier costs, profitability and cancellation capacity release', async ({ request }) => {
    test.skip(!configured, 'BLOCKED: Isolated Auth/API environment required');

    const token = await signIn(request);

    // 1. Create Tailor-made Itinerary & Day items
    const marker = unique('DMC Tour');
    const itinRes = await request.post(`${apiUrl}/api/itineraries`, {
      headers: headers(token),
      data: {
        title: marker,
        tripType: 'tailor_made',
        travelStart: '2027-10-01',
        travelEnd: '2027-10-06',
        travelers: 2,
        currency: 'EUR',
        destination: 'Sarajevo & Mostar',
      },
    });
    await expectStatus(itinRes, [201]);
    const itinerary = await json<{ id: string; versions: Array<{ id: string }> }>(itinRes);

    const itemRes = await request.post(`${apiUrl}/api/itineraries/${itinerary.id}/items`, {
      headers: headers(token),
      data: {
        title: 'Boutique Hotel & Guided Tour',
        dayNumber: 1,
        quantity: 2,
        unit: 'per_day',
        netUnitPrice: 100,
        markupPercent: 20,
        currency: 'EUR',
      },
    });
    await expectStatus(itemRes, [201]);

    // 2. Create Package and Departure
    const pkgRes = await request.post(`${apiUrl}/api/packages`, {
      headers: headers(token),
      data: {
        name: marker,
        destination: 'Sarajevo & Mostar',
        price: 240,
        currency: 'EUR',
        itineraryId: itinerary.id,
        active: true,
        transportType: 'none',
        maxParticipants: 4,
      },
    });
    await expectStatus(pkgRes, [201]);
    const pkg = await json<{ id: string }>(pkgRes);

    const depRes = await request.post(`${apiUrl}/api/departures`, {
      headers: headers(token),
      data: {
        packageId: pkg.id,
        departAt: '2027-10-01T10:00:00Z',
        returnAt: '2027-10-06T12:00:00Z',
        capacity: 4,
        booked: 0,
        status: 'active',
        transportType: 'none',
      },
    });
    await expectStatus(depRes, [201]);
    const departure = await json<{ id: string; booked: number; capacity: number }>(depRes);

    // 3. Create Quotation and Accept
    const quoteRes = await request.post(`${apiUrl}/api/quotations`, {
      headers: headers(token),
      data: {
        title: marker,
        itineraryId: itinerary.id,
        itineraryVersionId: itinerary.versions[0].id,
      },
    });
    await expectStatus(quoteRes, [201]);
    const quotation = await json<{ id: string }>(quoteRes);

    const acceptRes = await request.patch(`${apiUrl}/api/quotations/${quotation.id}`, {
      headers: headers(token),
      data: { status: 'accepted' },
    });
    await expectStatus(acceptRes, [200]);

    // 4. Convert Accepted Quotation to Booking
    const bookRes = await request.post(`${apiUrl}/api/quotations/${quotation.id}/booking`, {
      headers: headers(token),
      data: {
        departureId: departure.id,
        customerName: 'Elena Rostova',
        customerPhone: '+43699111222',
        passengers: [
          { full_name: 'Elena Rostova' },
          { full_name: 'Dmitri Rostov' },
        ],
      },
    });
    await expectStatus(bookRes, [201]);
    const booking = await json<{ reservation: { id: string } }>(bookRes);

    // Verify departure capacity consumed
    const depAfterBook = await json<{ booked: number }>(
      await request.get(`${apiUrl}/api/departures/${departure.id}`, { headers: headers(token) })
    );
    expect(depAfterBook.booked).toBe(2);

    // 5. Attach Supplier Cost Item
    const costRes = await request.post(`${apiUrl}/api/departures/${departure.id}/cost-items`, {
      headers: headers(token),
      data: {
        category: 'hotel',
        label: 'Local DMC Partner Accommodation',
        quantity: 1,
        unitCost: 150,
        currency: 'EUR',
      },
    });
    await expectStatus(costRes, [201]);

    // 6. Check Profitability
    const profRes = await request.get(`${apiUrl}/api/departures/${departure.id}/profitability`, {
      headers: headers(token),
    });
    await expectStatus(profRes, [200]);
    const prof = await json<{ currency: string; supplierCosts: number; revenue: number }>(profRes);
    expect(prof.currency).toBe('EUR');
    expect(prof.supplierCosts).toBe(150);

    // 7. Test Quotation Booking Deletion Protection (HTTP 409)
    const delRes = await request.delete(`${apiUrl}/api/reservations/${booking.reservation.id}`, {
      headers: headers(token),
    });
    await expectStatus(delRes, [409]);

    // 8. Cancel Reservation & Verify Capacity Release
    const cancelRes = await request.patch(`${apiUrl}/api/reservations/${booking.reservation.id}/status`, {
      headers: headers(token),
      data: { status: 'cancelled' },
    });
    await expectStatus(cancelRes, [200]);

    const depAfterCancel = await json<{ booked: number }>(
      await request.get(`${apiUrl}/api/departures/${departure.id}`, { headers: headers(token) })
    );
    expect(depAfterCancel.booked).toBe(0);
  });
});
