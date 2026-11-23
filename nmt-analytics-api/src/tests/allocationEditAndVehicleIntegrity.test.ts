import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const DEP_BUS = '33333333-3333-4333-8333-333333333333';
const HOTEL_A = '55555555-5555-4555-8555-555555555555';
const ALLOC_A = '66666666-6666-4666-8666-666666666666';
const ALLOC_B = '77777777-7777-4777-8777-777777777777';
const VEHICLE_A = '88888888-8888-4888-8888-888888888888';

let currentOrgId = ORG_A;
let currentRole = 'manager';
let simulateMissingAllotmentRpc = false;
let departures: any[] = [];
let hotelAllocations: any[] = [];
let roomSlots: any[] = [];
let slotAssignments: any[] = [];
let reservations: any[] = [];
let reservationRequirements: any[] = [];
let vehicles: any[] = [];
let vehicleSeats: any[] = [];
let seatQueryFilters: Array<Record<string, unknown>> = [];
let lastVehicleRpcArgs: Record<string, unknown> | null = null;
const logActionMock = vi.fn(async () => {});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function withHotel(row: any) {
  return {
    ...row,
    hotels: { id: row.hotel_id, name: 'Synthetic Hotel', destination: 'Sarajevo', stars: 4 },
  };
}

function runSyncRoomSlots(orgId: string, departureId: string, allocationId: string | null) {
  const targets = hotelAllocations.filter(
    (a) => a.org_id === orgId && a.departure_id === departureId && (!allocationId || a.id === allocationId),
  );
  for (const alloc of targets) {
    const existingSlots = roomSlots.filter(
      (s) => s.org_id === orgId && s.departure_id === departureId && s.hotel_allocation_id === alloc.id,
    );
    const maxSlot = existingSlots.reduce((m, s) => Math.max(m, s.slot_number), 0);
    if (maxSlot < alloc.rooms_reserved) {
      for (let seq = maxSlot + 1; seq <= alloc.rooms_reserved; seq++) {
        roomSlots.push({
          id: `slot-${alloc.id}-${seq}`,
          org_id: orgId,
          departure_id: departureId,
          hotel_allocation_id: alloc.id,
          hotel_id: alloc.hotel_id,
          room_type: alloc.room_type,
          slot_number: seq,
          capacity: alloc.capacity_per_room,
        });
      }
    } else if (maxSlot > alloc.rooms_reserved) {
      const removedIds = new Set(
        existingSlots.filter((s) => s.slot_number > alloc.rooms_reserved).map((s) => s.id),
      );
      const occupied = slotAssignments.some((a) => removedIds.has(a.room_slot_id));
      if (occupied) {
        return { data: null, error: { message: 'ROOM_SLOT_OCCUPIED' } };
      }
      roomSlots = roomSlots.filter((s) => !removedIds.has(s.id));
    }
  }
  return { data: [{ slot_count: roomSlots.length }], error: null };
}

function runUpdateAllotmentAtomic(args: Record<string, any>) {
  if (simulateMissingAllotmentRpc) {
    return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  }
  const { p_org_id: orgId, p_departure_id: departureId, p_item_id: itemId, p_room_count: roomCount } = args;
  if (!Number.isInteger(roomCount) || roomCount < 0 || roomCount > 1000) {
    return { data: null, error: { code: '22023', message: 'INVALID_ALLOTMENT_ROOM_COUNT' } };
  }
  const allocIndex = hotelAllocations.findIndex(
    (a) => a.id === itemId && a.departure_id === departureId && a.org_id === orgId,
  );
  if (allocIndex === -1) {
    return { data: null, error: { code: 'P0002', message: 'ALLOTMENT_NOT_FOUND' } };
  }
  const soldRooms = reservationRequirements
    .filter((req) => {
      if (req.org_id !== orgId || req.hotel_allocation_id !== itemId) return false;
      const res = reservations.find((r) => r.id === req.reservation_id && r.org_id === orgId);
      return res && res.status !== 'cancelled';
    })
    .reduce((sum, req) => sum + req.room_count, 0);

  if (roomCount < soldRooms) {
    return {
      data: null,
      error: { code: 'P0001', message: `ALLOTMENT_BELOW_RESERVED:${soldRooms}` },
    };
  }

  // Transactional snapshot: roll back both hotelAllocations and roomSlots on error.
  const prevAlloc = clone(hotelAllocations);
  const prevSlots = clone(roomSlots);
  hotelAllocations[allocIndex].rooms_reserved = roomCount;
  const syncRes = runSyncRoomSlots(orgId, departureId, itemId);
  if (syncRes.error) {
    hotelAllocations = prevAlloc;
    roomSlots = prevSlots;
    return syncRes;
  }
  return { data: clone(hotelAllocations[allocIndex]), error: null };
}

function runUpdateVehicleAtomic(args: Record<string, any>) {
  lastVehicleRpcArgs = clone(args);
  const orgId = args.p_org_id;
  const departureId = args.p_departure_id;
  const dep = departures.find((d) => d.id === departureId && d.org_id === orgId);
  if (!dep) return { data: null, error: { message: 'DEPARTURE_NOT_FOUND' } };
  if (dep.transport_type !== 'bus') return { data: null, error: { message: 'NOT_BUS_DEPARTURE' } };

  const existing = vehicles.find((v) => v.departure_id === departureId && v.org_id === orgId);
  const newCapacity = args.p_capacity ?? existing?.capacity ?? dep.capacity;
  if (newCapacity < dep.capacity) return { data: null, error: { message: 'CAPACITY_TOO_LOW' } };

  let targetVehicle = existing;
  if (targetVehicle) {
    if (args.p_vehicle_label !== null && args.p_vehicle_label !== undefined) {
      targetVehicle.vehicle_label = String(args.p_vehicle_label).trim();
    }
    // Mirrors real PostgreSQL semantics: NULL preserves existing, empty string clears to NULL.
    if (args.p_registration_number !== null && args.p_registration_number !== undefined) {
      const trimmed = String(args.p_registration_number).trim();
      targetVehicle.registration_number = trimmed === '' ? null : trimmed;
    }
    targetVehicle.capacity = newCapacity;
    if (args.p_layout_type) targetVehicle.layout_type = args.p_layout_type;
  } else {
    const trimmedReg =
      args.p_registration_number === null || args.p_registration_number === undefined
        ? null
        : String(args.p_registration_number).trim() || null;
    targetVehicle = {
      id: VEHICLE_A,
      org_id: orgId,
      departure_id: departureId,
      vehicle_label: args.p_vehicle_label ? String(args.p_vehicle_label).trim() : `Bus ${departureId.slice(0, 8)}`,
      registration_number: trimmedReg,
      capacity: newCapacity,
      layout_type: args.p_layout_type ?? 'standard_2_plus_2',
      created_at: '2026-11-23T10:00:00Z',
      updated_at: '2026-11-23T10:00:00Z',
    };
    vehicles.push(targetVehicle);
  }

  for (const seat of vehicleSeats) {
    if (seat.departure_vehicle_assignment_id === targetVehicle.id && seat.seat_number > newCapacity) {
      seat.is_active = false;
    }
  }
  for (let n = 1; n <= newCapacity; n++) {
    const seat = vehicleSeats.find(
      (s) => s.departure_vehicle_assignment_id === targetVehicle.id && s.seat_number === n,
    );
    if (seat) {
      seat.is_active = true;
    } else {
      vehicleSeats.push({
        id: `seat-${n}`,
        org_id: orgId,
        departure_vehicle_assignment_id: targetVehicle.id,
        departure_id: departureId,
        seat_number: n,
        seat_label: `Seat ${n}`,
        row_number: Math.floor((n - 1) / 4) + 1,
        column_index: (n - 1) % 4,
        side: (n - 1) % 4 < 2 ? 'left' : 'right',
        is_active: true,
      });
    }
  }

  const activeSeats = vehicleSeats
    .filter((s) => s.departure_vehicle_assignment_id === targetVehicle.id && s.is_active)
    .sort((a, b) => a.seat_number - b.seat_number);

  return {
    data: { vehicle: clone(targetVehicle), seats: clone(activeSeats) },
    error: null,
  };
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    action: 'select',
    filters: {},
    notFilters: {},
    payload: null,
    selectCols: '',
  };

  const applyFilters = (rows: any[]) =>
    rows.filter((row) =>
      Object.entries(state.filters).every(([key, value]) => {
        if (key === 'reservations.status') {
          const res = reservations.find((r) => r.id === row.reservation_id);
          return Array.isArray(value) ? value.includes(res?.status) : res?.status === value;
        }
        return Array.isArray(value) ? value.includes(row[key]) : row[key] === value;
      }) &&
      Object.entries(state.notFilters).every(([key, value]) => row[key] !== value),
    );

  const builder: any = {
    select: vi.fn((cols = '') => {
      state.selectCols = cols;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      state.filters[col] = val;
      return builder;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      state.notFilters[col] = val;
      return builder;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      state.filters[col] = vals;
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn((payload: any) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    }),
    single: vi.fn(async () => {
      const res = await exec();
      if (res.error) return res;
      if (!res.data?.[0]) return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
      return { data: res.data[0], error: null };
    }),
    maybeSingle: vi.fn(async () => {
      const res = await exec();
      if (res.error) return res;
      return { data: res.data?.[0] ?? null, error: null };
    }),
    then: (resolve: any, reject: any) => exec().then(resolve, reject),
  };

  async function exec() {
    if (table === 'departures') {
      return { data: clone(applyFilters(departures)), error: null };
    }
    if (table === 'hotel_allocations') {
      if (state.action === 'update') {
        hotelAllocations = hotelAllocations.map((row) =>
          applyFilters([row]).length > 0 ? { ...row, ...clone(state.payload) } : row,
        );
      }
      let rows = applyFilters(hotelAllocations);
      if (state.selectCols.includes('hotels:')) rows = rows.map(withHotel);
      return { data: clone(rows), error: null };
    }
    if (table === 'reservation_accommodation_requirements') {
      return { data: clone(applyFilters(reservationRequirements)), error: null };
    }
    if (table === 'departure_vehicle_assignments') {
      return { data: clone(applyFilters(vehicles)), error: null };
    }
    if (table === 'departure_vehicle_seats') {
      seatQueryFilters.push(clone(state.filters));
      return { data: clone(applyFilters(vehicleSeats)), error: null };
    }
    return { data: [], error: null };
  }

  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
    rpc: vi.fn(async (fn: string, args: Record<string, any>) => {
      if (fn === 'sync_departure_room_slots_atomic') {
        return runSyncRoomSlots(args.p_org_id, args.p_departure_id, args.p_hotel_allocation_id ?? null);
      }
      if (fn === 'update_departure_accommodation_allotment_atomic') {
        return runUpdateAllotmentAtomic(args);
      }
      if (fn === 'update_vehicle_atomic') {
        return runUpdateVehicleAtomic(args);
      }
      return { data: null, error: null };
    }),
  },
  handleSupabaseError: (res: any, _err: unknown, msg: string) =>
    res.status(500).json({ code: 'DB_ERROR', message: msg }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'manager@test.local', role: currentRole };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: (minRole: string) => (req: any, res: any, next: any) => {
    const order: Record<string, number> = { viewer: 0, agent: 1, manager: 2, director: 3, super_admin: 4 };
    if ((order[req.user?.role] ?? -1) < (order[minRole] ?? 0)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Forbidden' });
    }
    next();
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  auditDepartureCreate: (_req: any, _res: any, next: any) => next(),
  auditDepartureUpdate: (_req: any, _res: any, next: any) => next(),
  auditDepartureDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/audit', () => ({
  logAction: logActionMock,
}));

vi.mock('../lib/manualMessaging', () => ({
  manualMessageSchema: { safeParse: vi.fn(() => ({ success: false })) },
  sendManualEmailForOrg: vi.fn(),
  sendManualSmsForOrg: vi.fn(),
}));

let app: express.Express;

beforeEach(async () => {
  currentOrgId = ORG_A;
  currentRole = 'manager';
  simulateMissingAllotmentRpc = false;
  seatQueryFilters = [];
  lastVehicleRpcArgs = null;
  logActionMock.mockClear();

  departures = [{ id: DEP_BUS, org_id: ORG_A, transport_type: 'bus', capacity: 4 }];
  hotelAllocations = [
    {
      id: ALLOC_A,
      org_id: ORG_A,
      departure_id: DEP_BUS,
      hotel_id: HOTEL_A,
      room_type: 'double',
      room_label: 'Double',
      rooms_reserved: 3,
      template_rooms: 3,
      capacity_per_room: 2,
      check_in: '2026-11-01',
      check_out: '2026-11-04',
      net_price: 80,
      sell_price: 110,
      price_per_night: 80,
    },
    {
      id: ALLOC_B,
      org_id: ORG_B,
      departure_id: DEP_BUS,
      hotel_id: HOTEL_A,
      room_type: 'double',
      room_label: 'Double',
      rooms_reserved: 5,
      template_rooms: 5,
      capacity_per_room: 2,
      check_in: '2026-11-01',
      check_out: '2026-11-04',
      net_price: 80,
      sell_price: 110,
      price_per_night: 80,
    },
  ];
  roomSlots = [
    { id: 'slot-1', org_id: ORG_A, departure_id: DEP_BUS, hotel_allocation_id: ALLOC_A, hotel_id: HOTEL_A, room_type: 'double', slot_number: 1, capacity: 2 },
    { id: 'slot-2', org_id: ORG_A, departure_id: DEP_BUS, hotel_allocation_id: ALLOC_A, hotel_id: HOTEL_A, room_type: 'double', slot_number: 2, capacity: 2 },
    { id: 'slot-3', org_id: ORG_A, departure_id: DEP_BUS, hotel_allocation_id: ALLOC_A, hotel_id: HOTEL_A, room_type: 'double', slot_number: 3, capacity: 2 },
  ];
  slotAssignments = [{ id: 'assign-1', room_slot_id: 'slot-3', passenger_id: 'pax-1' }];
  reservations = [];
  reservationRequirements = [];
  vehicles = [
    {
      id: VEHICLE_A,
      org_id: ORG_A,
      departure_id: DEP_BUS,
      vehicle_label: 'Sprinter 1',
      registration_number: 'A12-K-345',
      capacity: 6,
      layout_type: 'standard_2_plus_2',
      created_at: '2026-11-23T10:00:00Z',
      updated_at: '2026-11-23T10:00:00Z',
    },
  ];
  vehicleSeats = Array.from({ length: 6 }, (_, i) => ({
    id: `seat-${i + 1}`,
    org_id: ORG_A,
    departure_vehicle_assignment_id: VEHICLE_A,
    departure_id: DEP_BUS,
    seat_number: i + 1,
    seat_label: `Seat ${i + 1}`,
    row_number: Math.floor(i / 4) + 1,
    column_index: i % 4,
    side: i % 4 < 2 ? 'left' : 'right',
    is_active: true,
  }));

  app = express();
  app.use(express.json());
  const mod = await import('../routes/departures');
  app.use('/api', mod.default);
});

describe('Hotel allocation edit/operator reload integrity', () => {
  it('rolls back hotel_allocations.rooms_reserved atomically when slot sync fails with ROOM_SLOT_OCCUPIED', async () => {
    const res = await request(app)
      .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_A}`)
      .send({ roomCount: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROOM_SLOT_OCCUPIED');

    // Reload MUST still show 3 rooms, never the failed partial mutation of 1.
    const reload = await request(app).get(`/api/departures/${DEP_BUS}/accommodation-allotments`);
    expect(reload.status).toBe(200);
    expect(reload.body.items[0].departureRooms).toBe(3);
    expect(hotelAllocations[0].rooms_reserved).toBe(3);
    expect(roomSlots).toHaveLength(3);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer, blank, null, over-bound, unknown fields and non-UUID params on allotment PATCH', async () => {
    for (const payload of [
      { roomCount: '' },
      { roomCount: null },
      { roomCount: 1.5 },
      { roomCount: 1001 },
      { roomCount: 2, orgId: ORG_B },
    ]) {
      const res = await request(app)
        .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_A}`)
        .send(payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }

    const badId = await request(app)
      .patch(`/api/departures/not-a-uuid/accommodation-allotments/${ALLOC_A}`)
      .send({ roomCount: 4 });
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe('VALIDATION_ERROR');
    expect(hotelAllocations[0].rooms_reserved).toBe(3);
  });

  it('fails closed with 503 MIGRATION_PENDING when atomic allotment RPC is absent', async () => {
    simulateMissingAllotmentRpc = true;
    const res = await request(app)
      .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_A}`)
      .send({ roomCount: 4 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('MIGRATION_PENDING');
    expect(hotelAllocations[0].rooms_reserved).toBe(3);
  });

  it('persists valid allotment increase, syncs slots, writes audit log, and denies cross-org/low-role writes', async () => {
    const res = await request(app)
      .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_A}`)
      .send({ roomCount: 5 });

    expect(res.status).toBe(200);
    expect(res.body.departureRooms).toBe(5);
    expect(roomSlots).toHaveLength(5);
    expect(logActionMock).toHaveBeenCalledWith(
      expect.anything(),
      'UPDATE',
      'hotel_allocation',
      ALLOC_A,
      expect.objectContaining({
        newValues: expect.objectContaining({ departureId: DEP_BUS, roomCount: 5 }),
      }),
    );

    // Cross-tenant attempt returns 404 and leaves ORG_B untouched
    const crossOrg = await request(app)
      .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_B}`)
      .send({ roomCount: 1 });
    expect(crossOrg.status).toBe(404);
    expect(hotelAllocations[1].rooms_reserved).toBe(5);

    // Agent role is forbidden
    currentRole = 'agent';
    const forbidden = await request(app)
      .patch(`/api/departures/${DEP_BUS}/accommodation-allotments/${ALLOC_A}`)
      .send({ roomCount: 6 });
    expect(forbidden.status).toBe(403);
  });
});

describe('Bus vehicle create/edit/reload integrity', () => {
  it('clears registrationNumber explicitly on edit and persists null across reload', async () => {
    const putRes = await request(app)
      .put(`/api/departures/${DEP_BUS}/vehicle`)
      .send({ vehicleLabel: 'Sprinter Updated', registrationNumber: null, capacity: 6 });

    expect(putRes.status).toBe(200);
    expect(lastVehicleRpcArgs?.p_registration_number).toBe('');
    expect(putRes.body.vehicle.vehicle_label).toBe('Sprinter Updated');
    expect(putRes.body.vehicle.registration_number).toBeNull();
    expect(logActionMock).toHaveBeenCalledWith(
      expect.anything(),
      'UPDATE',
      'departure_vehicle',
      VEHICLE_A,
      expect.objectContaining({ newValues: expect.objectContaining({ vehicle_label: 'Sprinter Updated' }) }),
    );

    const reload = await request(app).get(`/api/departures/${DEP_BUS}/vehicle`);
    expect(reload.status).toBe(200);
    expect(reload.body.vehicle.registration_number).toBeNull();
  });

  it('scopes GET vehicle seats to org_id and active seats so capacity shrink matches after reload', async () => {
    const shrinkRes = await request(app)
      .put(`/api/departures/${DEP_BUS}/vehicle`)
      .send({ capacity: 4 });
    expect(shrinkRes.status).toBe(200);
    expect(shrinkRes.body.seats).toHaveLength(4);

    const reload = await request(app).get(`/api/departures/${DEP_BUS}/vehicle`);
    expect(reload.status).toBe(200);
    expect(reload.body.seats).toHaveLength(4);
    expect(reload.body.seats.every((s: any) => s.is_active === true)).toBe(true);
    expect(seatQueryFilters[seatQueryFilters.length - 1]).toMatchObject({
      departure_vehicle_assignment_id: VEHICLE_A,
      org_id: ORG_A,
      is_active: true,
    });
  });

  it('rejects whitespace-only vehicleLabel, unknown fields, non-UUID departureId, and unauthorized roles', async () => {
    for (const payload of [
      { vehicleLabel: '   ', capacity: 6 },
      { capacity: 6, orgId: ORG_B },
      { capacity: 501 },
    ]) {
      const res = await request(app)
        .put(`/api/departures/${DEP_BUS}/vehicle`)
        .send(payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }

    const badUuid = await request(app)
      .get('/api/departures/not-a-uuid/vehicle');
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.code).toBe('VALIDATION_ERROR');

    currentRole = 'agent';
    const forbidden = await request(app)
      .put(`/api/departures/${DEP_BUS}/vehicle`)
      .send({ capacity: 6 });
    expect(forbidden.status).toBe(403);
  });
});
