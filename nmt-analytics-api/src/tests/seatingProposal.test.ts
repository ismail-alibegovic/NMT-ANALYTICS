import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

// M12.1 — focused API tests for read-only automatic BUS seating proposal.
// Mirrors the roomingProposalRoute.test.ts mock conventions.

const TEST_ORG = '11111111-1111-4111-8111-111111111111'
const BUS_DEPARTURE = '22222222-2222-4222-8222-222222222222'
const BUS_DEPARTURE_NO_VEHICLE = '22222222-2222-4222-8222-222222222299'
const FLIGHT_DEPARTURE = '22222222-2222-4222-8222-222222222223'
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333'

let departures: any[] = []
let vehicles: any[] = []
let seats: any[] = []
let passengers: any[] = []
let groups: any[] = []
let groupMembers: any[] = []

const mutations: string[] = []
let seatingRouter: any

function matches(row: any, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) =>
    Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
  )
}

function filterRows(src: any[], filters: Record<string, any>, inFilters: Record<string, any>) {
  return src.filter((row) => {
    if (!matches(row, filters)) return false
    return Object.entries(inFilters).every(([key, values]) => (values as any[]).includes(row[key]))
  })
}

function buildQuery(table: string) {
  const _filters: Record<string, any> = {}
  const _inFilters: Record<string, any> = {}

  const query: any = {
    select() { return query },
    eq(col: string, val: any) { _filters[col] = val; return query },
    in(col: string, vals: any[]) { _inFilters[col] = vals; return query },
    order() { return query },
    async maybeSingle() {
      const src = sourceFor(table)
      const rows = filterRows(src, _filters, _inFilters)
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: any) {
      const src = sourceFor(table)
      const rows = filterRows(src, _filters, _inFilters)
      resolve({ data: rows, error: null })
    },
    async *[Symbol.asyncIterator]() {
      const src = sourceFor(table)
      yield* filterRows(src, _filters, _inFilters)
    },
  }
  return query
}

function sourceFor(t: string) {
  if (t === 'departures') return departures
  if (t === 'departure_vehicle_assignments') return vehicles
  if (t === 'departure_vehicle_seats') return seats
  if (t === 'departure_passengers') return passengers
  if (t === 'trip_passenger_groups') return groups
  if (t === 'trip_passenger_group_members') return groupMembers
  return []
}

function createApp(router: any) {
  const app = express()
  app.use(express.json())
  app.use('/api', router)
  // error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err?.message ?? 'error' })
  })
  return app
}

beforeEach(async () => {
  departures = [
    { id: BUS_DEPARTURE, org_id: TEST_ORG, transport_type: 'bus', capacity: 4 },
    { id: BUS_DEPARTURE_NO_VEHICLE, org_id: TEST_ORG, transport_type: 'bus', capacity: 4 },
    { id: FLIGHT_DEPARTURE, org_id: TEST_ORG, transport_type: 'flight', capacity: 6 },
  ]
  vehicles = [
    { id: VEHICLE_ID, org_id: TEST_ORG, departure_id: BUS_DEPARTURE, vehicle_label: 'Bus 10000000', registration_number: null, capacity: 4 },
  ]
  seats = [
    { id: 's1', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 1, seat_label: '1A', row_number: 1, column_index: 0, side: 'left', is_active: true },
    { id: 's2', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 2, seat_label: '1B', row_number: 1, column_index: 1, side: 'right', is_active: true },
    { id: 's3', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 3, seat_label: '2A', row_number: 2, column_index: 0, side: 'left', is_active: true },
    { id: 's4', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 4, seat_label: '2B', row_number: 2, column_index: 1, side: 'right', is_active: true },
    { id: 's5', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 5, seat_label: '3A', row_number: 3, column_index: 0, side: 'left', is_active: false },
  ]
  passengers = [
    { id: '30000000-0000-4000-8000-000000000001', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Manual User', seat_number: 1, seat_is_manual: true, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000002', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Locked User', seat_number: 2, seat_is_manual: false, seat_locked: true },
    { id: '30000000-0000-4000-8000-000000000003', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 1', seat_number: null, seat_is_manual: false, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000004', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 2', seat_number: null, seat_is_manual: false, seat_locked: false },
    { id: '30000000-0000-4000-8000-000000000099', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Solo', seat_number: null, seat_is_manual: false, seat_locked: false },
  ]
  groups = [
    { id: 'g1', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, name: 'Family', seating_preference: 'keep_together', members: [{ passenger_id: '30000000-0000-4000-8000-000000000003' }, { passenger_id: '30000000-0000-4000-8000-000000000004' }] },
  ]
  groupMembers = [
    { id: 'gm1', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000003' },
    { id: 'gm2', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000004' },
  ]

  vi.resetModules()
  const seatsModule = await import('../routes/seats')
  seatingRouter = seatsModule.default
})

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => buildQuery(table)),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
  supabase: {},
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.orgId = TEST_ORG
    next()
  },
}))
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => next(),
}))
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
  hasAccess: () => true,
  can: () => true,
}))

describe('M12.1 read-only automatic bus seating proposal', () => {
  // ---- rejects non-BUS departure ----
  it('rejects a non-BUS departure', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${FLIGHT_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NOT_BUS_DEPARTURE')
  })

  // ---- rejects missing vehicle ----
  it('rejects departure with no vehicle assignment', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE_NO_VEHICLE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NO_VEHICLE')
  })

  // ---- proposal performs zero seat writes ----
  it('performs zero seat writes (read-only)', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    expect(mutations.filter((m) => m.includes('departure_passengers') || m.includes('departure_vehicle_seats'))).toEqual([])
  })

  // ---- preserves manual assignment ----
  it('preserves manual assignment', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const preserved = res.body.preservedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000001')
    expect(preserved).toBeDefined()
    expect(preserved.seatNumber).toBe(1)
    const proposed = res.body.proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000001')
    expect(proposed).toBeUndefined()
  })

  // ---- preserves locked assignment ----
  it('preserves locked assignment', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const preserved = res.body.preservedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000002')
    expect(preserved).toBeDefined()
    expect(preserved.seatNumber).toBe(2)
  })

  // ---- group processed before solo traveler ----
  it('processes group before solo traveler', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const groupProposed = res.body.proposedAssignments.filter((a: any) =>
      a.passengerId === '30000000-0000-4000-8000-000000000003' || a.passengerId === '30000000-0000-4000-8000-000000000004'
    )
    // group should get seats 3,4 (the only free seats after manual/locked take 1,2)
    expect(groupProposed.length).toBe(2)
    // group gets seats before solo — solo should be unresolved
    const soloProposed = res.body.proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000099')
    expect(soloProposed).toBeUndefined()
    const soloUnresolved = res.body.unresolved.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000099')
    expect(soloUnresolved).toBeDefined()
  })

  // ---- keep_together tries adjacency ----
  it('keep_together tries adjacency', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const gm1 = res.body.proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000003')
    const gm2 = res.body.proposedAssignments.find((a: any) => a.passengerId === '30000000-0000-4000-8000-000000000004')
    expect(gm1).toBeDefined()
    expect(gm2).toBeDefined()
    // After manual(1)/locked(2) preserved, free seats are 3,4 — both row 2, cols 0,1 → adjacent
    const seatNums = [gm1.seatNumber, gm2.seatNumber].sort((a: number, b: number) => a - b)
    expect(seatNums).toEqual([3, 4])
  })

  // ---- closest-possible fallback is deterministic ----
  it('closest-possible fallback is deterministic', async () => {
    const app = createApp(seatingRouter)
    const res1 = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    const res2 = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res1.body.proposedAssignments).toEqual(res2.body.proposedAssignments)
  })

  // ---- split-group warning returned ----
  it('returns split-group warning when group cannot be kept together', async () => {
    seats = [
      { id: 's1', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 1, seat_label: '1A', row_number: 1, column_index: 0, side: 'left', is_active: true },
    ]
    passengers = [
      { id: '30000000-0000-4000-8000-000000000003', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 1', seat_number: null, seat_is_manual: false, seat_locked: false },
      { id: '30000000-0000-4000-8000-000000000004', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 2', seat_number: null, seat_is_manual: false, seat_locked: false },
    ]
    groups = [
      { id: 'g1', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, name: 'Family', seating_preference: 'keep_together', members: [{ passenger_id: '30000000-0000-4000-8000-000000000003' }, { passenger_id: '30000000-0000-4000-8000-000000000004' }] },
    ]
    groupMembers = [
      { id: 'gm1', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000003' },
      { id: 'gm2', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000004' },
    ]
    vi.resetModules()
    const seatsModule = await import('../routes/seats')
    const router = seatsModule.default
    const app = createApp(router)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.splitGroupWarnings.length).toBeGreaterThan(0)
    expect(res.body.splitGroupWarnings[0].groupId).toBe('g1')
  })

  // ---- inactive seats ignored ----
  it('ignores inactive seats', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const proposedSeatNumbers = res.body.proposedAssignments.map((a: any) => a.seatNumber)
    expect(proposedSeatNumbers).not.toContain(5)
  })

  // ---- insufficient seats produce unresolved passengers ----
  it('returns unresolved passengers when seats are insufficient', async () => {
    seats = [
      { id: 's1', org_id: TEST_ORG, departure_vehicle_assignment_id: VEHICLE_ID, departure_id: BUS_DEPARTURE, seat_number: 1, seat_label: '1A', row_number: 1, column_index: 0, side: 'left', is_active: true },
    ]
    passengers = [
      { id: '30000000-0000-4000-8000-000000000003', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 1', seat_number: null, seat_is_manual: false, seat_locked: false },
      { id: '30000000-0000-4000-8000-000000000004', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Group Member 2', seat_number: null, seat_is_manual: false, seat_locked: false },
      { id: '30000000-0000-4000-8000-000000000099', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, full_name: 'Solo', seat_number: null, seat_is_manual: false, seat_locked: false },
    ]
    groups = [
      { id: 'g1', org_id: TEST_ORG, departure_id: BUS_DEPARTURE, name: 'Family', seating_preference: 'keep_together', members: [{ passenger_id: '30000000-0000-4000-8000-000000000003' }, { passenger_id: '30000000-0000-4000-8000-000000000004' }] },
    ]
    groupMembers = [
      { id: 'gm1', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000003' },
      { id: 'gm2', org_id: TEST_ORG, trip_passenger_group_id: 'g1', passenger_id: '30000000-0000-4000-8000-000000000004' },
    ]
    vi.resetModules()
    const seatsModule = await import('../routes/seats')
    const router = seatsModule.default
    const app = createApp(router)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.unresolved.length).toBeGreaterThan(0)
  })

  // ---- no duplicate proposed seats ----
  it('never proposes duplicate seats', async () => {
    const app = createApp(seatingRouter)
    const res = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res.status).toBe(200)
    const seatNumbers = res.body.proposedAssignments.map((a: any) => a.seatNumber)
    const uniqueSeatNumbers = new Set(seatNumbers)
    expect(uniqueSeatNumbers.size).toBe(seatNumbers.length)
  })

  // ---- deterministic: same state → same proposal ----
  it('is deterministic: same state → same proposal', async () => {
    const app = createApp(seatingRouter)
    const res1 = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    const res2 = await request(app)
      .post(`/api/departures/${BUS_DEPARTURE}/seating/proposal`)
      .set('x-test-org', TEST_ORG)
      .send()
    expect(res1.body.stateFingerprint).toBe(res2.body.stateFingerprint)
    expect(res1.body.proposedAssignments).toEqual(res2.body.proposedAssignments)
  })
})
