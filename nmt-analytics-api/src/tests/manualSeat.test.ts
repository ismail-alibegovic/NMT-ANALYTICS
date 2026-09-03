import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

// M11.1 regression coverage for the manual BUS seat foundation:
//   PATCH /departure-passengers/:id/seat
//   PATCH /departure-passengers/:id/seat-lock
//   PUT  /departures/:departureId/vehicle
//   legacy auto-seating gating (AUTO_SEATING_NOT_AVAILABLE)
//   generic passenger PATCH must not bypass seat rules.

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

function resetStores() {
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
    rpc: vi.fn(async () => ({ data: null, error: null })),
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

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('SEAT_NOT_FOUND')
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
})
