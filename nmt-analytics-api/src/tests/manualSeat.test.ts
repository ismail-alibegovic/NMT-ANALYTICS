import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

// M11.1 regression coverage — atomic RPC-backed manual bus seat foundation.
// Routes call update_vehicle_atomic, manual_seat_assign, manual_seat_lock.
// Legacy auto-seating is gated (AUTO_SEATING_NOT_AVAILABLE).
// Clear-all is also gated.
// Generic passenger PATCH must not bypass seat rules.

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'
const BUS_DEPARTURE = '10000000-0000-4000-8000-000000000001'
const FLIGHT_DEPARTURE = '10000000-0000-4000-8000-000000000002'
const PASSENGER_ID = '30000000-0000-4000-8000-000000000001'
const VEHICLE_ID = '50000000-0000-4000-8000-000000000001'

type DepartureRow = {
  id: string
  org_id: string
  transport_type: 'bus' | 'flight' | 'none'
  capacity: number
}

type PassengerRow = {
  id: string
  org_id: string
  departure_id: string
  seat_number: number | null
  seat_is_manual: boolean
  seat_locked: boolean
  full_name: string
}

type VehicleRow = {
  id: string
  org_id: string
  departure_id: string
  vehicle_label: string
  registration_number: string | null
  capacity: number
  layout_type: string
}

type SeatRow = {
  id: string
  org_id: string
  departure_vehicle_assignment_id: string
  departure_id: string
  seat_number: number
  seat_label: string
  row_number: number
  column_index: number
  side: 'left' | 'right'
  is_active: boolean
}

let departures: DepartureRow[] = []
let passengers: PassengerRow[] = []
let vehicles: VehicleRow[] = []
let seats: SeatRow[] = []
// Track the "locked" vehicle rows for simulation
let vehicleLocks: Map<string, VehicleRow> = new Map()

function resetStores() {
  vehicleLocks = new Map()
  departures = [
    { id: BUS_DEPARTURE, org_id: TEST_ORG, transport_type: 'bus', capacity: 4 },
    { id: FLIGHT_DEPARTURE, org_id: TEST_ORG, transport_type: 'flight', capacity: 6 },
  ]
  passengers = [
    {
      id: PASSENGER_ID,
      org_id: TEST_ORG,
      departure_id: BUS_DEPARTURE,
      seat_number: null,
      seat_is_manual: false,
      seat_locked: false,
      full_name: 'Ema Gusić',
    },
  ]
  vehicles = [
    {
      id: VEHICLE_ID,
      org_id: TEST_ORG,
      departure_id: BUS_DEPARTURE,
      vehicle_label: 'Bus 10000000',
      registration_number: null,
      capacity: 4,
      layout_type: 'standard_2_plus_2',
    },
  ]
  seats = [
    { id: '60000000-0000-4000-8000-000000000001', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 1, seat_label: 'Seat 1', row_number: 1, column_index: 0, side: 'left', is_active: true },
    { id: '60000000-0000-4000-8000-000000000002', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 2, seat_label: 'Seat 2', row_number: 1, column_index: 1, side: 'left', is_active: true },
    { id: '60000000-0000-4000-8000-000000000003', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 3, seat_label: 'Seat 3', row_number: 1, column_index: 2, side: 'right', is_active: true },
    { id: '60000000-0000-4000-8000-000000000004', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 4, seat_label: 'Seat 4', row_number: 1, column_index: 3, side: 'right', is_active: true },
  ]
}

// ---- In-memory RPC simulations matching the DB functions ---------------------

function rpcUpdateVehicleAtomic(args: any): { data: any; error: any } {
  const orgId = args.p_org_id
  const departureId = args.p_departure_id
  const newCapacity = args.p_capacity as number | null

  const dep = departures.find(d => d.id === departureId && d.org_id === orgId)
  if (!dep) return { data: null, error: { message: 'DEPARTURE_NOT_FOUND' } }
  if (dep.transport_type !== 'bus') return { data: null, error: { message: 'NOT_BUS_DEPARTURE' } }

  let veh = vehicles.find(v => v.departure_id === departureId && v.org_id === orgId)
  const effectiveCapacity = newCapacity ?? veh?.capacity ?? dep.capacity

  if (effectiveCapacity < dep.capacity) return { data: null, error: { message: 'CAPACITY_TOO_LOW' } }

  if (veh && newCapacity !== null && newCapacity < veh.capacity) {
    const occupiedAbove = passengers.filter(
      p => p.departure_id === departureId && p.org_id === orgId
        && p.seat_number !== null && p.seat_number > newCapacity
    ).length
    if (occupiedAbove > 0) {
      return { data: null, error: { message: `VEHICLE_CHANGE_CONFLICT: ${occupiedAbove} occupied seats above new capacity` } }
    }
  }

  if (veh) {
    veh.vehicle_label = args.p_vehicle_label ?? veh.vehicle_label
    veh.registration_number = args.p_registration_number !== undefined ? args.p_registration_number : veh.registration_number
    veh.capacity = effectiveCapacity
    veh.layout_type = args.p_layout_type ?? veh.layout_type
  } else {
    veh = {
      id: VEHICLE_ID + '_' + departureId.substring(0, 8),
      org_id: orgId,
      departure_id: departureId,
      vehicle_label: args.p_vehicle_label ?? 'Bus ' + departureId.substring(0, 8),
      registration_number: args.p_registration_number ?? null,
      capacity: effectiveCapacity,
      layout_type: args.p_layout_type ?? 'standard_2_plus_2',
    }
    vehicles.push(veh)
  }

  // Deactivate seats above new capacity
  seats.forEach(s => {
    if (s.departure_vehicle_assignment_id === veh!.id && s.seat_number > effectiveCapacity) {
      s.is_active = false
    }
  })

  // Create / reactivate seats 1..N
  for (let n = 1; n <= effectiveCapacity; n++) {
    const existing = seats.find(s => s.departure_vehicle_assignment_id === veh!.id && s.seat_number === n)
    if (existing) {
      existing.is_active = true
    } else {
      seats.push({
        id: `6${String(n).padStart(6, '0')}-0000-4000-8000-000000000002`,
        org_id: orgId,
        departure_vehicle_assignment_id: veh!.id,
        departure_id: departureId,
        seat_number: n,
        seat_label: 'Seat ' + n,
        row_number: Math.floor((n - 1) / 4) + 1,
        column_index: (n - 1) % 4,
        side: ((n - 1) % 4) < 2 ? 'left' : 'right',
        is_active: true,
      })
    }
  }

  const activeSeats = seats
    .filter(s => s.departure_vehicle_assignment_id === veh!.id && s.is_active)
    .sort((a, b) => a.seat_number - b.seat_number)
    .map(s => ({
      id: s.id, seat_number: s.seat_number, seat_label: s.seat_label,
      row_number: s.row_number, column_index: s.column_index,
      side: s.side, is_active: s.is_active,
    }))

  return {
    data: {
      vehicle: {
        id: veh!.id, vehicle_label: veh!.vehicle_label,
        registration_number: veh!.registration_number,
        capacity: veh!.capacity, layout_type: veh!.layout_type,
      },
      seats: activeSeats,
    },
    error: null,
  }
}

function rpcManualSeatAssign(args: any): { data: any; error: any } {
  const orgId = args.p_org_id
  const passengerId = args.p_passenger_id
  const seatNumber = args.p_seat_number as number | null

  const pax = passengers.find(p => p.id === passengerId && p.org_id === orgId)
  if (!pax) return { data: null, error: { message: 'PASSENGER_NOT_FOUND' } }

  const dep = departures.find(d => d.id === pax.departure_id && d.org_id === orgId)
  if (!dep) return { data: null, error: { message: 'DEPARTURE_NOT_FOUND' } }
  if (dep.transport_type !== 'bus') return { data: null, error: { message: 'NOT_BUS_DEPARTURE' } }

  const veh = vehicles.find(v => v.departure_id === dep.id && v.org_id === orgId)
  if (!veh) return { data: null, error: { message: 'VEHICLE_NOT_FOUND' } }

  if (seatNumber === null) {
    if (pax.seat_locked) return { data: null, error: { message: 'SEAT_LOCKED' } }
    pax.seat_number = null
    pax.seat_is_manual = false
    pax.seat_locked = false
    return { data: { ...pax }, error: null }
  }

  if (pax.seat_locked) return { data: null, error: { message: 'SEAT_LOCKED' } }

  const target = seats.find(s =>
    s.departure_vehicle_assignment_id === veh.id &&
    s.seat_number === seatNumber &&
    s.is_active
  )
  if (!target) return { data: null, error: { message: 'SEAT_NOT_FOUND' } }

  // Duplicate seat check
  const dup = passengers.find(p =>
    p.departure_id === pax.departure_id &&
    p.org_id === orgId &&
    p.seat_number === seatNumber &&
    p.id !== passengerId
  )
  if (dup) return { data: null, error: { message: 'SEAT_CONFLICT' } }

  pax.seat_number = seatNumber
  pax.seat_is_manual = true
  return { data: { ...pax }, error: null }
}

function rpcManualSeatLock(args: any): { data: any; error: any } {
  const orgId = args.p_org_id
  const passengerId = args.p_passenger_id
  const locked = args.p_locked as boolean

  const pax = passengers.find(p => p.id === passengerId && p.org_id === orgId)
  if (!pax) return { data: null, error: { message: 'PASSENGER_NOT_FOUND' } }

  if (pax.seat_number === null || (pax.seat_number ?? 0) <= 0) {
    return { data: null, error: { message: 'SEAT_NOT_ASSIGNED' } }
  }

  const dep = departures.find(d => d.id === pax.departure_id && d.org_id === orgId)
  if (!dep) return { data: null, error: { message: 'DEPARTURE_NOT_FOUND' } }
  if (dep.transport_type !== 'bus') {
    return { data: null, error: { message: 'NOT_BUS_DEPARTURE' } }
  }

  pax.seat_locked = locked
  return { data: { ...pax }, error: null }
}

// ---- Mock setup ---------------------------------------------------------------

function filterRows(rows: any[], filters: Record<string, unknown>, inFilters: Record<string, Set<unknown>>) {
  return rows.filter((row: any) => {
    for (const [key, value] of Object.entries(filters)) {
      if (row[key] !== value) return false
    }
    for (const [key, values] of Object.entries(inFilters)) {
      if (!values.has(row[key])) return false
    }
    return true
  })
}

function buildQuery(table: string) {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, Set<unknown>> = {}
  const gts: Record<string, number> = {}

  const query: any = {
    select(_cols?: string, _opts?: { count?: string; head?: boolean }) {
      return query
    },
    eq(column: string, value: unknown) {
      filters[column] = value
      return query
    },
    in(column: string, values: unknown[]) {
      inFilters[column] = new Set(values)
      return query
    },
    gt(column: string, value: number) {
      gts[column] = value
      return query
    },
    order(_col: string, _opts?: { ascending?: boolean }) {
      return query
    },
    async single() {
      const rows = filterRows(sourceFor(table), filters, inFilters)
      const row = rows[0]
      if (row) return { data: row, error: null }
      return { data: null, error: { code: 'PGRST116', message: 'Not found' } }
    },
    async maybeSingle() {
      const rows = filterRows(sourceFor(table), filters, inFilters)
      const row = rows[0]
      return { data: row ?? null, error: null }
    },
    then(resolve: any) {
      let rows = filterRows(sourceFor(table), filters, inFilters)
      for (const [key, value] of Object.entries(gts)) {
        rows = rows.filter((r: any) => r[key] > value)
      }
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve)
    },
    update(payload: Record<string, unknown>) {
      const updFilters = { ...filters }
      const updInFilters = { ...inFilters }
      const updGts = { ...gts }

      const chain = {
        eq(column: string, value: unknown) {
          updFilters[column] = value
          return chain
        },
        select(_cols?: string) {
          return chain
        },
        then(resolve: any) {
          const rows = filterRows(sourceFor(table), updFilters, updInFilters)
          const row = rows[0]
          if (!row) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
          if (table === 'departure_passengers') {
            const idx = passengers.findIndex((p) => p.id === row.id)
            passengers[idx] = { ...passengers[idx], ...(payload as any) }
            return Promise.resolve({ data: passengers[idx], error: null })
          } else if (table === 'departure_vehicle_assignments') {
            const idx = vehicles.findIndex((v) => v.id === row.id)
            vehicles[idx] = { ...vehicles[idx], ...(payload as any) }
            return Promise.resolve({ data: vehicles[idx], error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        async single() {
          const rows = filterRows(sourceFor(table), updFilters, updInFilters)
          const row = rows[0]
          if (!row) return { data: null, error: { code: 'PGRST116', message: 'Not found' } }
          if (table === 'departure_passengers') {
            const idx = passengers.findIndex((p) => p.id === row.id)
            passengers[idx] = { ...passengers[idx], ...(payload as any) }
            return { data: passengers[idx], error: null }
          } else if (table === 'departure_vehicle_assignments') {
            const idx = vehicles.findIndex((v) => v.id === row.id)
            vehicles[idx] = { ...vehicles[idx], ...(payload as any) }
            return { data: vehicles[idx], error: null }
          } else if (table === 'departure_vehicle_seats') {
            const idx = seats.findIndex((s) => s.id === row.id)
            seats[idx] = { ...seats[idx], ...(payload as any) }
            return { data: seats[idx], error: null }
          }
          return { data: null, error: null }
        },
      }
      return chain
    },
    insert(payload: Record<string, unknown>) {
      if (table === 'departure_vehicle_assignments') {
        vehicles.push(payload as any)
      }
      return { error: null }
    },
  }

  function sourceFor(t: string) {
    if (t === 'departures') return departures
    if (t === 'departure_passengers') return passengers
    if (t === 'departure_vehicle_assignments') return vehicles
    if (t === 'departure_vehicle_seats') return seats
    return []
  }

  return query
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'test@travline.app', role: 'manager' }
    next()
  },
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = (req.headers['x-test-org'] as string) || TEST_ORG
    next()
  },
  requireOrgScope: (qb: unknown) => qb,
}))

vi.mock('../middleware/auditLogger', () => ({
  logAuditEntry: vi.fn(() => Promise.resolve()),
  auditDepartureCreate: (_req: any, _res: any, next: any) => next(),
  auditDepartureUpdate: (_req: any, _res: any, next: any) => next(),
  auditDepartureDelete: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => buildQuery(table)),
    rpc: vi.fn(async (fn: string, args: any) => {
      if (fn === 'update_vehicle_atomic') return rpcUpdateVehicleAtomic(args)
      if (fn === 'manual_seat_assign') return rpcManualSeatAssign(args)
      if (fn === 'manual_seat_lock') return rpcManualSeatLock(args)
      if (fn === 'sync_departure_room_slots_atomic') return { data: { success: true }, error: null }
      return { data: null, error: null }
    }),
  },
  supabase: {},
  handleSupabaseError: (res: Response, err: { code?: string; message?: string }, message: string) =>
    res.status(500).json({ code: err?.code || 'DATABASE_ERROR', message: err?.message || message }),
}))

import seatRouter from '../routes/seats'
import departuresRouter from '../routes/departures'
import passengerRouter from '../routes/departurePassengers'

function createApp(router: any) {
  const app = express()
  app.use(express.json())
  app.use('/api', router)
  return app
}

describe('M11.1 manual bus seat foundation', () => {
  beforeEach(() => {
    resetStores()
  })

  // ---- Existing M11.1 tests (now RPC-backed) -----------------------------------

  it('assigns a manual seat on a bus departure', async () => {
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: 2 })

    expect(res.status).toBe(200)
    expect(passengers[0].seat_number).toBe(2)
    expect(passengers[0].seat_is_manual).toBe(true)
    expect(passengers[0].seat_locked).toBe(false)
  })

  it('rejects a seat outside the vehicle layout', async () => {
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: 99 })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('rejects manual seat assignment on a flight departure', async () => {
    passengers[0].departure_id = FLIGHT_DEPARTURE
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: 1 })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NOT_BUS_DEPARTURE')
  })

  it('rejects unassign when seat is locked', async () => {
    passengers[0].seat_number = 2
    passengers[0].seat_locked = true
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: null })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SEAT_LOCKED')
    expect(passengers[0].seat_number).toBe(2)
  })

  it('rejects moving when seat is locked', async () => {
    passengers[0].seat_number = 2
    passengers[0].seat_locked = true
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: 3 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SEAT_LOCKED')
    expect(passengers[0].seat_number).toBe(2)
  })

  it('unlocks then allows move', async () => {
    passengers[0].seat_number = 2
    passengers[0].seat_locked = true

    const lockRes = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat-lock`)
      .set('x-test-org', TEST_ORG)
      .send({ locked: false })
    expect(lockRes.status).toBe(200)

    const moveRes = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat`)
      .set('x-test-org', TEST_ORG)
      .send({ seatNumber: 3 })
    expect(moveRes.status).toBe(200)
    expect(passengers[0].seat_number).toBe(3)
  })

  it('rejects seat-lock when no seat is assigned', async () => {
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat-lock`)
      .set('x-test-org', TEST_ORG)
      .send({ locked: true })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('SEAT_NOT_ASSIGNED')
  })

  it('generic passenger PATCH cannot change seat_number', async () => {
    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}`)
      .set('x-test-org', TEST_ORG)
      .send({ seat_number: 3 })

    expect(res.status).toBe(200)
    // The updateSchema validation omits seat fields; even if passed, the route
    // ignores them. The passenger in the mock DB remains untouched.
    expect(passengers[0].seat_number).toBeNull()
  })

  it('legacy auto-seat endpoint returns AUTO_SEATING_NOT_AVAILABLE', async () => {
    const res = await request(createApp(seatRouter))
      .post('/api/seats/auto-assign')
      .set('x-test-org', TEST_ORG)
      .send({ departureId: BUS_DEPARTURE })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('AUTO_SEATING_NOT_AVAILABLE')
  })

  it('legacy group-auto-assign endpoint returns AUTO_SEATING_NOT_AVAILABLE', async () => {
    const res = await request(createApp(seatRouter))
      .post('/api/seats/group-auto-assign/group-1')
      .set('x-test-org', TEST_ORG)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('AUTO_SEATING_NOT_AVAILABLE')
  })

  it('vehicle PUT rejects capacity below departure capacity', async () => {
    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 2 })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CAPACITY_TOO_LOW')
  })

  it('vehicle GET rejects cross-org access', async () => {
    const res = await request(createApp(departuresRouter))
      .get(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', OTHER_ORG)

    expect(res.status).toBe(404)
  })

  it('vehicle GET returns null for flight departures', async () => {
    const res = await request(createApp(departuresRouter))
      .get(`/api/departures/${FLIGHT_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NOT_BUS_DEPARTURE')
  })

  // ---- NEW: Fix-specific regression tests --------------------------------------

  it('vehicle create generates seats 1..capacity', async () => {
    // Remove existing vehicle so RPC creates one.
    vehicles = []
    seats = []

    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 6, vehicleLabel: 'Big Bus' })

    expect(res.status).toBe(200)
    expect(res.body.vehicle.capacity).toBe(6)
    expect(res.body.seats).toHaveLength(6)
    expect(res.body.seats.map((s: any) => s.seat_number)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('vehicle capacity increase generates new seats', async () => {
    // Existing vehicle has capacity 4, seats 1..4. Increase to 6.
    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 6 })

    expect(res.status).toBe(200)
    expect(res.body.seats).toHaveLength(6)
    expect(res.body.seats.map((s: any) => s.seat_number)).toEqual([1, 2, 3, 4, 5, 6])
  })


  it('vehicle capacity decrease from 6 to 4 removes extra unoccupied seats', async () => {
    // First increase to 6.
    await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 6 })

    // Then decrease back to 4 (which is >= departure capacity).
    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 4 })

    expect(res.status).toBe(200)
    expect(res.body.seats).toHaveLength(4)
  })

  it('vehicle capacity decrease with occupied extra seat returns 409', async () => {
    // Increase to 6, then assign seat 5 to a passenger.
    await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 6 })

    passengers[0].seat_number = 5

    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ capacity: 4 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('VEHICLE_CHANGE_CONFLICT')
  })

  it('seat-lock rejected for flight departure', async () => {
    // Put passenger on flight departure with seat assigned.
    passengers[0].departure_id = FLIGHT_DEPARTURE
    passengers[0].seat_number = 3

    const res = await request(createApp(passengerRouter))
      .patch(`/api/departure-passengers/${PASSENGER_ID}/seat-lock`)
      .set('x-test-org', TEST_ORG)
      .send({ locked: true })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NOT_BUS_DEPARTURE')
  })

  it('clear-all cannot mutate manual seats — returns 409 gated', async () => {
    const res = await request(createApp(seatRouter))
      .post('/api/seats/clear-all')
      .set('x-test-org', TEST_ORG)
      .send({ departureId: BUS_DEPARTURE })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('AUTO_SEATING_NOT_AVAILABLE')
  })

  it('vehicle PUT uses RPC and returns vehicle+seats shape', async () => {
    const res = await request(createApp(departuresRouter))
      .put(`/api/departures/${BUS_DEPARTURE}/vehicle`)
      .set('x-test-org', TEST_ORG)
      .send({ vehicleLabel: 'Bus XYZ', capacity: 5 })

    expect(res.status).toBe(200)
    expect(res.body.vehicle).toBeDefined()
    expect(res.body.vehicle.vehicle_label).toBe('Bus XYZ')
    expect(res.body.seats).toBeInstanceOf(Array)
  })
})
