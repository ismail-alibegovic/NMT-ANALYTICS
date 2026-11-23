import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = process.env.E2E_API_URL || '';
const auth = process.env.E2E_SUPABASE_URL || '';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('allotment edit rollback on occupied slot and bus vehicle create/edit/clear/reload through real Auth', async ({ request }) => {
  test.skip(process.env.E2E_RUN_BROWSER !== '1', 'Requires disposable authenticated acceptance');
  test.setTimeout(90_000);
  expect([api, auth].every((url) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))).toBe(true);

  const login = async (email: string, password: string) => {
    const r = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
      data: { email, password },
    });
    expect(r.status()).toBe(200);
    return { Authorization: `Bearer ${(await r.json()).access_token}` };
  };

  const headers = await login(process.env.E2E_FLIGHT_MANAGER_EMAIL!, process.env.E2E_FLIGHT_MANAGER_PASSWORD!);
  const foreign = await login(process.env.E2E_OTHER_TENANT_EMAIL!, process.env.E2E_OTHER_TENANT_PASSWORD!);
  const marker = `Synthetic alloc-vehicle ${randomUUID()}`;

  const pkg = await request.post(`${api}/api/packages`, {
    headers,
    data: { name: marker, destination: 'Synthetic', price: 100, currency: 'EUR', active: true, transportType: 'bus', maxParticipants: 4 },
  });
  expect(pkg.status()).toBe(201);
  const packageId = (await pkg.json()).id;

  const dep = await request.post(`${api}/api/departures`, {
    headers,
    data: {
      packageId,
      departAt: '2042-07-10T08:00:00Z',
      returnAt: '2042-07-14T18:00:00Z',
      capacity: 4,
      status: 'active',
      transportType: 'bus',
    },
  });
  expect(dep.status()).toBe(201);
  const departureId = (await dep.json()).id;

  const hotel = await request.post(`${api}/api/hotels`, {
    headers,
    data: { name: marker, destination: 'Synthetic', totalRooms: 0 },
  });
  expect(hotel.status()).toBe(201);
  const hotelId = (await hotel.json()).id;

  const allocRes = await request.post(`${api}/api/departures/${departureId}/allocations`, {
    headers,
    data: {
      hotelId,
      roomType: 'double',
      roomsReserved: 3,
      capacityPerRoom: 2,
      checkIn: '2042-07-10',
      checkOut: '2042-07-14',
      netPrice: 80,
      sellPrice: 110,
    },
  });
  expect(allocRes.status()).toBe(201);
  const allocationId = (await allocRes.json()).id;

  // Sync slots (creates 3 slots) and create a reservation + passenger assigned to slot 3.
  const slotsRes = await request.get(`${api}/api/departures/${departureId}/room-slots`, { headers });
  expect(slotsRes.status()).toBe(200);
  const slots = (await slotsRes.json()).slots;
  expect(slots).toHaveLength(3);
  const slot3 = slots.find((s: { slotNumber: number }) => s.slotNumber === 3);
  expect(slot3).toBeTruthy();

  const resCreate = await request.post(`${api}/api/reservations`, {
    headers,
    data: {
      departureId,
      customerName: 'Synthetic Slot Guest',
      partySize: 1,
      totalAmount: 100,
      status: 'confirmed',
    },
  });
  expect(resCreate.status()).toBe(201);
  const reservationId = (await resCreate.json()).id;

  const paxCreate = await request.post(`${api}/api/departure-passengers`, {
    headers,
    data: { reservation_id: reservationId, departure_id: departureId, full_name: 'Synthetic Slot Guest' },
  });
  expect(paxCreate.status()).toBe(201);
  const passengerId = (await paxCreate.json()).id;

  const assignRes = await request.post(`${api}/api/room-slots/${slot3.id}/assign`, {
    headers,
    data: { passengerId },
  });
  expect(assignRes.status()).toBe(201);
  const assignmentId = (await assignRes.json()).id;

  // Shrink 3 -> 1 must fail with 409 ROOM_SLOT_OCCUPIED AND leave rooms_reserved = 3 on reload.
  const conflictPatch = await request.patch(`${api}/api/departures/${departureId}/accommodation-allotments/${allocationId}`, {
    headers,
    data: { roomCount: 1 },
  });
  expect(conflictPatch.status()).toBe(409);
  expect((await conflictPatch.json()).code).toBe('ROOM_SLOT_OCCUPIED');

  const afterConflict = await request.get(`${api}/api/departures/${departureId}/accommodation-allotments`, { headers });
  expect(afterConflict.status()).toBe(200);
  expect((await afterConflict.json()).items.find((i: { id: string }) => i.id === allocationId).departureRooms).toBe(3);

  // Unassign slot 3 -> shrink 3 -> 2 succeeds and syncs room slots to 2.
  expect((await request.delete(`${api}/api/room-slot-assignments/${assignmentId}`, { headers })).status()).toBe(204);
  const shrinkOk = await request.patch(`${api}/api/departures/${departureId}/accommodation-allotments/${allocationId}`, {
    headers,
    data: { roomCount: 2 },
  });
  expect(shrinkOk.status()).toBe(200);
  expect((await shrinkOk.json()).departureRooms).toBe(2);

  const slotsAfterShrink = await request.get(`${api}/api/departures/${departureId}/room-slots`, { headers });
  expect(slotsAfterShrink.status()).toBe(200);
  expect((await slotsAfterShrink.json()).slots).toHaveLength(2);

  // Cross-tenant allotment edit denied.
  expect(
    (await request.patch(`${api}/api/departures/${departureId}/accommodation-allotments/${allocationId}`, {
      headers: foreign,
      data: { roomCount: 4 },
    })).status(),
  ).toBe(404);

  // Bus vehicle create -> edit (clear registration + shrink capacity 6 -> 4) -> reload.
  const vehCreate = await request.put(`${api}/api/departures/${departureId}/vehicle`, {
    headers,
    data: { vehicleLabel: 'Sprinter 1', registrationNumber: 'A12-K-345', capacity: 6 },
  });
  expect(vehCreate.status()).toBe(200);
  expect((await vehCreate.json()).seats).toHaveLength(6);

  const vehEdit = await request.put(`${api}/api/departures/${departureId}/vehicle`, {
    headers,
    data: { vehicleLabel: 'Sprinter Clean', registrationNumber: null, capacity: 4 },
  });
  expect(vehEdit.status()).toBe(200);
  const edited = await vehEdit.json();
  expect(edited.vehicle.vehicle_label).toBe('Sprinter Clean');
  expect(edited.vehicle.registration_number).toBeNull();
  expect(edited.seats).toHaveLength(4);

  const vehReload = await request.get(`${api}/api/departures/${departureId}/vehicle`, { headers });
  expect(vehReload.status()).toBe(200);
  const reloaded = await vehReload.json();
  expect(reloaded.vehicle.vehicle_label).toBe('Sprinter Clean');
  expect(reloaded.vehicle.registration_number).toBeNull();
  expect(reloaded.seats).toHaveLength(4);
  expect(reloaded.seats.every((s: { is_active: boolean }) => s.is_active === true)).toBe(true);

  // Cross-tenant vehicle read/write denied.
  expect((await request.get(`${api}/api/departures/${departureId}/vehicle`, { headers: foreign })).status()).toBe(404);
  expect((await request.put(`${api}/api/departures/${departureId}/vehicle`, { headers: foreign, data: { capacity: 4 } })).status()).toBe(404);
});
