import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

let supabaseAdmin: any

const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER_ORG = '00000000-0000-4000-8000-0000000000ff'
const FLIGHT_A = 'aa000000-0000-4000-8000-000000000001'
const FLIGHT_B = 'aa000000-0000-4000-8000-000000000002'
const FLIGHT_C = 'aa000000-0000-4000-8000-000000000003'
const DEPARTURE = 'dd000000-0000-4000-8000-000000000001'
const SEGMENT_1 = 'ee000000-0000-4000-8000-000000000001'
const SEGMENT_2 = 'ee000000-0000-4000-8000-000000000002'
const SEGMENT_3 = 'ee000000-0000-4000-8000-000000000003'

interface Row { [key: string]: any }

function makeFlight(overrides: Record<string, any> = {}): Row {
  return {
    id: FLIGHT_A,
    org_id: ORG,
    airline: 'Turkish Airlines',
    flight_number: 'TK101',
    departure_airport: 'SJJ',
    arrival_airport: 'IST',
    departure_time: '2026-09-10T08:00:00Z',
    arrival_time: '2026-09-10T11:30:00Z',
    capacity: 180,
    base_price: 0,
    currency: 'BAM',
    notes: null,
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Minimal chainable Supabase query mock.
 * Each terminal (maybeSingle/single/range…then) pops the next queued result.
 */
function createChain(table: string) {
  type Result = { data: any; error: any; count?: number }
  const state: { queue: Result[] } = { queue: [] }
  const push = (data: any, error: any = null, count?: number) =>
    state.queue.push({ data, error, count })

  const chain: any = {
    __table: table,
    __queue: state.queue,
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => state.queue.shift() ?? { data: null, error: null }),
    maybeSingle: vi.fn(async () => state.queue.shift() ?? { data: null, error: null }),
    then(onFulfilled: any) {
      const result = state.queue.shift() ?? { data: [], error: null, count: 0 }
      return Promise.resolve(onFulfilled ? onFulfilled(result) : result)
    },
  }
  let onFulfilled: any = null
  // range() ends with await — support both range().then style and direct await
  chain.range = vi.fn(() => chain)
  Object.defineProperty(chain, 'thenWrapper', { value: null })
  chain.__setResolver = (fn: any) => { onFulfilled = fn }
  return chain
}

const chains: Record<string, any> = {}
const chainFor = (table: string) => {
  if (!chains[table]) chains[table] = createChain(table)
  return chains[table]
}

const rpcState = vi.hoisted(() => ({ data: null as any, error: null as any }))

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => chainFor(table),
    rpc: vi.fn(async () => ({ data: rpcState.data, error: rpcState.error })),
  },
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: Response, next: NextFunction) => {
    req.orgId = ORG
    next()
  },
}))
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  logAuditEntry: vi.fn(),
}))
vi.mock('../lib/rateLimit', () => ({ authRateLimit: (_req: any, _res: any, next: any) => next() }))

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json())
  const router = (await import('../routes/flights')).default
  app.use('/api', router)
  ;({ supabaseAdmin } = await import('../lib/supabase'))
})

beforeEach(() => {
  for (const key of Object.keys(chains)) delete chains[key]
  rpcState.data = null
  rpcState.error = null
})

const validPayload = {
  airline: 'Turkish Airlines',
  flightNumber: 'TK101',
  departureAirport: 'sjj',
  arrivalAirport: 'IST',
  departureTime: '2026-09-10T08:00:00Z',
  arrivalTime: '2026-09-10T11:30:00Z',
  capacity: 180,
}

describe('POST /api/flights — validation', () => {
  it('normalizes airport codes to uppercase and creates flight', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).post('/api/flights').send(validPayload)
    expect(res.status).toBe(201)
    expect(res.body.departureAirport).toBe('SJJ')
    const insertCall = chainFor('flights').insert.mock.calls[0][0]
    expect(insertCall.departure_airport).toBe('SJJ')
    expect(insertCall.arrival_airport).toBe('IST')
  })

  it('rejects invalid 3-letter IATA code', async () => {
    const res = await request(app).post('/api/flights').send({ ...validPayload, arrivalAirport: 'ISTANBUL' })
    expect(res.status).toBe(400)
  })

  it('rejects identical departure and arrival airports', async () => {
    const res = await request(app).post('/api/flights').send({ ...validPayload, arrivalAirport: 'SJJ' })
    expect(res.status).toBe(400)
  })

  it('rejects arrival before departure', async () => {
    const res = await request(app)
      .post('/api/flights')
      .send({ ...validPayload, departureTime: '2026-09-10T12:00:00Z', arrivalTime: '2026-09-10T08:00:00Z' })
    expect(res.status).toBe(400)
  })

  it('rejects non-positive capacity', async () => {
    const res = await request(app).post('/api/flights').send({ ...validPayload, capacity: 0 })
    expect(res.status).toBe(400)
  })

  it('rejects negative price', async () => {
    const res = await request(app).post('/api/flights').send({ ...validPayload, basePrice: -5 })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/flights/:id — update & toggle', () => {
  it('updates flight fields and normalizes airports', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('flights').__queue.push({ data: makeFlight({ arrival_airport: 'BER' }), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ arrivalAirport: 'ber' })
    expect(res.status).toBe(200)
    expect(res.body.arrivalAirport).toBe('BER')
  })

  it('toggles active via PATCH', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('flights').__queue.push({ data: makeFlight({ active: false }), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ active: false })
    expect(res.status).toBe(200)
    expect(res.body.active).toBe(false)
  })

  it('rejects invalid airport on update', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ departureAirport: '12' })
    expect(res.status).toBe(400)
  })

  it('rejects arrivalAirport equal to existing departureAirport (partial PATCH)', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ arrivalAirport: 'SJJ' })
    expect(res.status).toBe(400)
  })

  it('rejects departureAirport equal to existing arrivalAirport (partial PATCH)', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ departureAirport: 'IST' })
    expect(res.status).toBe(400)
  })

  it('rejects arrivalTime before existing departureTime (partial PATCH)', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ arrivalTime: '2026-09-10T07:00:00Z' })
    expect(res.status).toBe(400)
  })

  it('rejects departureTime after existing arrivalTime (partial PATCH)', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ departureTime: '2026-09-10T12:00:00Z' })
    expect(res.status).toBe(400)
  })

  it('accepts valid partial airport/time update against final state', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('flights').__queue.push({ data: makeFlight({ arrival_airport: 'ZRH', arrival_time: '2026-09-10T12:30:00Z' }), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({
      arrivalAirport: 'ZRH',
      arrivalTime: '2026-09-10T12:30:00Z',
    })
    expect(res.status).toBe(200)
    expect(res.body.arrivalAirport).toBe('ZRH')
  })

  it('returns 404 when flight does not exist in org', async () => {
    chainFor('flights').__queue.push({ data: null, error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_C}`).send({ active: false })
    expect(res.status).toBe(404)
  })

  it('accepts partial update of an unrelated field without touching context', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('flights').__queue.push({ data: makeFlight({ notes: 'gate B7' }), error: null })
    const res = await request(app).patch(`/api/flights/${FLIGHT_A}`).send({ notes: 'gate B7' })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/flights/:id — safe delete', () => {
  it('refuses to delete a flight linked to departures', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('departures').__queue.push({ data: [{ id: DEPARTURE }], error: null })
    const res = await request(app).delete(`/api/flights/${FLIGHT_A}`)
    expect(res.status).toBe(409)
    const deleteCalls = chainFor('flights').delete.mock.calls.length
    expect(deleteCalls).toBe(0)
  })

  it('deletes unlinked flight', async () => {
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('departures').__queue.push({ data: [], error: null })
    chainFor('departure_flights').__queue.push({ data: null, error: null })
    chainFor('flights').__queue.push({ data: null, error: null })
    const res = await request(app).delete(`/api/flights/${FLIGHT_A}`)
    expect(res.status).toBe(200)
const deleteCalls = chainFor('flights').delete.mock.calls.length
    expect(deleteCalls).toBeGreaterThanOrEqual(1)
  })
})

describe('Departure flight segments', () => {
  it('lists ordered segments with flight details', async () => {
    const segment = (id: string, direction: string, order: number, flight: any) => ({
      id,
      org_id: ORG,
      departure_id: DEPARTURE,
      flight_id: flight.id,
      direction,
      segment_order: order,
      flight,
    })
    chainFor('departures').__queue.push({ data: { id: DEPARTURE, org_id: ORG }, error: null })
    chainFor('departure_flights').__queue.push({
      data: [
        segment(SEGMENT_1, 'outbound', 1, makeFlight()),
        segment(SEGMENT_2, 'return', 1, makeFlight({ id: FLIGHT_B, flight_number: 'TK102' })),
      ],
      error: null,
    })
    const res = await request(app).get(`/api/departures/${DEPARTURE}/flights`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0].direction).toBe('outbound')
    expect(res.body.data[0].segmentOrder).toBe(1)
  })

  it('attaches outbound and return segments to the same departure', async () => {
    chainFor('departures').__queue.push({ data: { id: DEPARTURE, org_id: ORG }, error: null })
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    chainFor('departure_flights').__queue.push({
      data: { id: SEGMENT_1, direction: 'outbound', segment_order: 1 },
      error: null,
    })
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/flights`)
      .send({ flightId: FLIGHT_A, direction: 'outbound', segmentOrder: 1 })
    expect(res.status).toBe(201)

    chainFor('departures').__queue.push({ data: { id: DEPARTURE, org_id: ORG }, error: null })
    chainFor('flights').__queue.push({ data: makeFlight({ id: FLIGHT_B, flight_number: 'TK102' }), error: null })
    chainFor('departure_flights').__queue.push({
      data: { id: SEGMENT_2, direction: 'return', segment_order: 1 },
      error: null,
    })
    const res2 = await request(app)
      .post(`/api/departures/${DEPARTURE}/flights`)
      .send({ flightId: FLIGHT_B, direction: 'return', segmentOrder: 1 })
    expect(res2.status).toBe(201)
    expect(res2.body.direction).toBe('return')
  })

  it('rejects linking a flight from another org', async () => {
    chainFor('departures').__queue.push({ data: { id: DEPARTURE, org_id: ORG }, error: null })
    chainFor('flights').__queue.push({ data: null, error: null }) // flight not in this org
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/flights`)
      .send({ flightId: FLIGHT_C, direction: 'outbound', segmentOrder: 1 })
    expect(res.status).toBe(404)
  })

  it('rejects cross-org departure id', async () => {
    chainFor('departures').__queue.push({ data: null, error: null })
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/flights`)
      .send({ flightId: FLIGHT_A, direction: 'outbound', segmentOrder: 1 })
    expect(res.status).toBe(404)
  })

  it('rejects invalid direction value', async () => {
    chainFor('departures').__queue.push({ data: { id: DEPARTURE, org_id: ORG }, error: null })
    chainFor('flights').__queue.push({ data: makeFlight(), error: null })
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/flights`)
      .send({ flightId: FLIGHT_A, direction: 'sideways', segmentOrder: 1 })
    expect(res.status).toBe(400)
  })

  it('unlink removes only the segment row, not the flight', async () => {
    chainFor('departure_flights').__queue.push({ data: null, error: null })
    const res = await request(app).delete(`/api/departures/${DEPARTURE}/flights/${SEGMENT_1}`)
    expect(res.status).toBe(200)
    expect(chainFor('departure_flights').delete).toHaveBeenCalled()
    expect(chainFor('flights').delete).not.toHaveBeenCalled()
  })

  it('atomic reorder: calls the RPC once and returns the ordered list', async () => {
    rpcState.data = [
      { id: SEGMENT_2, departure_id: DEPARTURE, flight_id: FLIGHT_B, direction: 'outbound', segment_order: 1, created_at: '2026-09-01T00:00:00Z', flights: [] },
      { id: SEGMENT_1, departure_id: DEPARTURE, flight_id: FLIGHT_A, direction: 'outbound', segment_order: 2, created_at: '2026-09-01T00:00:00Z', flights: [makeFlight()] },
    ]
    chainFor('departure_flights').__queue.push({
      data: rpcState.data,
      error: null,
    })
    const payload = {
      segments: [
        { id: SEGMENT_1, direction: 'outbound', segmentOrder: 2 },
        { id: SEGMENT_2, direction: 'outbound', segmentOrder: 1 },
      ],
    }
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.data[0].segmentOrder).toBe(1)
    // ONE DB unit: single rpc call with full payload, no row-by-row updates
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('reorder_departure_flights_atomic', {
      p_org_id: ORG,
      p_departure_id: DEPARTURE,
      p_segments: payload.segments,
    })
    expect(chainFor('departure_flights').update).not.toHaveBeenCalled()
  })

  it('rejects duplicate direction/order targets (RPC error)', async () => {
    rpcState.error = { message: 'duplicate_direction_order_targets' }
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({
        segments: [
          { id: SEGMENT_1, direction: 'outbound', segmentOrder: 0 },
          { id: SEGMENT_2, direction: 'outbound', segmentOrder: 0 },
        ],
      })
    expect(res.status).toBe(400)
    expect(chainFor('departure_flights').update).not.toHaveBeenCalled()
  })

  it('rejects cross-org / foreign segment (RPC error)', async () => {
    rpcState.error = { message: 'segment_not_in_departure' }
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({ segments: [{ id: SEGMENT_3, direction: 'outbound', segmentOrder: 0 }] })
    expect(res.status).toBe(400)
    expect(chainFor('departure_flights').update).not.toHaveBeenCalled()
  })

  it('rejects incomplete/invalid segment set (RPC error)', async () => {
    rpcState.error = { message: 'incomplete_segment_set' }
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({ segments: [{ id: SEGMENT_1, direction: 'outbound', segmentOrder: 0 }] })
    expect(res.status).toBe(400)
    expect(chainFor('departure_flights').update).not.toHaveBeenCalled()
  })

  it('returns 404 when departure is not in org (RPC error)', async () => {
    rpcState.error = { message: 'departure_not_found_in_org' }
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({ segments: [{ id: SEGMENT_1, direction: 'outbound', segmentOrder: 0 }] })
    expect(res.status).toBe(404)
  })

  it('failed reorder leaves no partial temporary ordering', async () => {
    // The RPC raises and rolls back — endpoint must not perform ANY row updates itself.
    rpcState.error = { message: 'duplicate_direction_order_targets' }
    await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({ segments: [{ id: SEGMENT_1, direction: 'return', segmentOrder: 3 }] })
    expect(chainFor('departure_flights').update).not.toHaveBeenCalled()
    expect(chainFor('flights').update).not.toHaveBeenCalled()
  })

  it('rejects reorder with negative segment order', async () => {
    const res = await request(app)
      .put(`/api/departures/${DEPARTURE}/flights/reorder`)
      .send({ segments: [{ id: SEGMENT_1, direction: 'outbound', segmentOrder: -1 }] })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/flights — search and filter', () => {
  it('returns flight list with linked departure counts', async () => {
    chainFor('flights').__queue.push({
      data: [makeFlight({ linked_departure_count: 2, linked_departures: [{ id: DEPARTURE }] })],
      error: null,
      count: 1,
    })
    chainFor('departure_flights').__queue.push({
      data: [
        { flight_id: FLIGHT_A, direction: 'outbound', departures: { id: DEPARTURE, depart_at: '2026-09-10T08:00:00Z', return_at: null, status: 'open', packages: { name: 'Umrah Pack', destination: 'Mecca' } } },
        { flight_id: FLIGHT_A, direction: 'return', departures: { id: 'dd000000-0000-4000-8000-000000000009', depart_at: '2026-09-20T08:00:00Z', return_at: null, status: 'open', packages: { name: 'Umrah Pack', destination: 'Mecca' } } },
      ],
      error: null,
    })
    const res = await request(app).get('/api/flights?search=turkish&active=true')
    expect(res.status).toBe(200)
    expect(res.body.data[0].linkedDepartureCount).toBe(2)
    expect(res.body.data[0].linkedDepartures).toHaveLength(2)
  })
})