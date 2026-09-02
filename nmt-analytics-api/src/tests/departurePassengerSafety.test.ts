import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_DEPARTURE_ID = '10000000-0000-4000-8000-000000000002'
const RESERVATION_ID = '20000000-0000-4000-8000-000000000001'
const PASSENGER_ID = '30000000-0000-4000-8000-000000000001'

type ReservationRow = {
  id: string
  org_id: string
  departure_id: string
  party_size?: number
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
}

type DepartureRow = {
  id: string
  org_id: string
  capacity: number
}

type PassengerRow = {
  id: string
  org_id: string
  reservation_id: string
  departure_id: string
  full_name: string
}

let reservations: ReservationRow[] = []
let departures: DepartureRow[] = []
let passengers: PassengerRow[] = []
let reservationMeta: Record<string, { party_size: number; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' }> = {}

function resetStores() {
  reservations = [
    { id: RESERVATION_ID, org_id: TEST_ORG, departure_id: DEPARTURE_ID },
  ]
  departures = [
    { id: DEPARTURE_ID, org_id: TEST_ORG, capacity: 3 },
    { id: OTHER_DEPARTURE_ID, org_id: TEST_ORG, capacity: 3 },
  ]
  passengers = [
    {
      id: PASSENGER_ID,
      org_id: TEST_ORG,
      reservation_id: RESERVATION_ID,
      departure_id: DEPARTURE_ID,
      full_name: 'Delete Me',
    },
  ]
  reservationMeta = {
    [RESERVATION_ID]: { party_size: 2, status: 'pending' },
  }
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'test@travline.app', role: 'agent' }
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
}))

function buildSelectQuery(table: string) {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, Set<unknown>> = {}

  const query: any = {
    eq(column: string, value: unknown) {
      filters[column] = value
      return query
    },
    in(column: string, values: unknown[]) {
      inFilters[column] = new Set(values)
      return query
    },
    async single() {
      const rows = buildRows()
      const row = rows[0]
      if (row) return { data: row, error: null }
      return { data: null, error: { code: 'PGRST116', message: 'Not found' } }
    },
    then(resolve: any) {
      const rows = buildRows()
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve)
    },
  }

  function buildRows() {
    const source =
      table === 'reservations'
        ? reservations.map((row) => ({ ...row, ...(reservationMeta[row.id] || {}) }))
        : table === 'departures'
          ? departures
          : table === 'departure_passengers'
            ? passengers
            : []

    return source.filter((row: any) => {
      for (const [key, value] of Object.entries(filters)) {
        if (row[key] !== value) return false
      }
      for (const [key, values] of Object.entries(inFilters)) {
        if (!values.has(row[key])) return false
      }
      return true
    })
  }

  return query
}

function buildInsertQuery(table: string) {
  return {
    insert(payload: Record<string, unknown>) {
      return {
        select() {
          return {
            async single() {
              if (table !== 'departure_passengers') {
                return { data: null, error: { code: 'PGRST116', message: 'Unsupported table' } }
              }

              const row: PassengerRow = {
                id: '30000000-0000-4000-8000-000000000099',
                org_id: String(payload.org_id),
                reservation_id: String(payload.reservation_id),
                departure_id: String(payload.departure_id),
                full_name: String(payload.full_name),
              }
              passengers.push(row)
              return { data: row, error: null }
            },
          }
        },
      }
    },
  }
}

function buildDeleteQuery() {
  const filters: Record<string, unknown> = {}

  const query = {
    error: null as null | { code: string; message: string },
    eq(column: string, value: unknown) {
      filters[column] = value
      if (filters.id && filters.org_id) {
        const index = passengers.findIndex(
          (item) => item.id === filters.id && item.org_id === filters.org_id,
        )
        query.error = index === -1 ? { code: 'PGRST116', message: 'Not found' } : null
        if (index !== -1) passengers.splice(index, 1)
      }
      return query
    },
  }

  return query
}

function buildCountQuery(table: string) {
  let working: any[] = table === 'departure_passengers' ? passengers : []
  const query: any = {
    eq(column: string, value: unknown) {
      working = working.filter((row) => row[column] === value)
      return query
    },
    then(resolve: any) {
      return Promise.resolve({ data: null, error: null, count: working.length }).then(resolve)
    },
  }
  return query
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn((_cols?: string, options?: { count?: string; head?: boolean }) =>
        options?.count === 'exact' && options?.head ? buildCountQuery(table) : buildSelectQuery(table)),
      insert: buildInsertQuery(table).insert,
      delete: vi.fn(() => buildDeleteQuery()),
    })),
    rpc: vi.fn(async (_name: string, args: { p_org_id: string; p_passenger_id: string }) => {
      const row = passengers.find(
        (item) => item.id === args.p_passenger_id && item.org_id === args.p_org_id,
      )
      if (!row) {
        return { data: null, error: { message: 'PASSENGER_NOT_FOUND' } }
      }
      passengers = passengers.filter((item) => item.id !== args.p_passenger_id)
      return {
        data: [
          {
            passenger_id: row.id,
            reservation_id: row.reservation_id,
            departure_id: row.departure_id,
            full_name: row.full_name,
            group_id: null,
            group_deleted: false,
            new_primary_passenger_id: null,
            new_primary_passenger_name: null,
          },
        ],
        error: null,
      }
    }),
  },
  supabase: {},
  handleSupabaseError: (res: Response, err: { code?: string; message?: string }, message: string) =>
    res.status(500).json({ code: err?.code || 'DATABASE_ERROR', message: err?.message || message }),
}))

import passengerRouter from '../routes/departurePassengers'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', passengerRouter)
  return app
}

describe('departure passenger safety', () => {
  beforeEach(() => {
    resetStores()
  })

  it('creates a passenger with 201 for a valid reservation/departure pair', async () => {
    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
        full_name: 'Valid Passenger',
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      org_id: TEST_ORG,
      reservation_id: RESERVATION_ID,
      departure_id: DEPARTURE_ID,
      full_name: 'Valid Passenger',
    })
  })

  it('rejects invalid payload with 400 and VALIDATION_ERROR', async () => {
    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 RESERVATION_NOT_FOUND when reservation is missing for the org', async () => {
    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: '20000000-0000-4000-8000-000000000099',
        departure_id: DEPARTURE_ID,
        full_name: 'Missing Reservation',
      })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('RESERVATION_NOT_FOUND')
  })

  it('returns 404 DEPARTURE_NOT_FOUND when departure is missing for the org', async () => {
    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: '10000000-0000-4000-8000-000000000099',
        full_name: 'Missing Departure',
      })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('DEPARTURE_NOT_FOUND')
  })

  it('rejects passenger create when mixed occupancy already fills the departure', async () => {
    reservations = [
      { id: RESERVATION_ID, org_id: TEST_ORG, departure_id: DEPARTURE_ID, party_size: 2, status: 'pending' },
      { id: '20000000-0000-4000-8000-000000000009', org_id: TEST_ORG, departure_id: DEPARTURE_ID, party_size: 2, status: 'pending' },
    ]
    departures = [{ id: DEPARTURE_ID, org_id: TEST_ORG, capacity: 3 }]
    passengers = [
      {
        id: PASSENGER_ID,
        org_id: TEST_ORG,
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
        full_name: 'Existing Passenger',
      },
    ]
    reservationMeta = {
      [RESERVATION_ID]: { party_size: 2, status: 'pending' },
      ['20000000-0000-4000-8000-000000000009']: { party_size: 2, status: 'pending' },
    }

    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
        full_name: 'Blocked Passenger',
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DEPARTURE_CAPACITY_EXCEEDED')
    expect(res.body.details).toMatchObject({
      capacity: 3,
      booked: 3,
      requestedAdditionalPassengers: 1,
      remainingCapacity: 0,
    })
  })

  it('returns 409 RESERVATION_DEPARTURE_MISMATCH when reservation belongs to another departure', async () => {
    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: OTHER_DEPARTURE_ID,
        full_name: 'Mismatch Passenger',
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('RESERVATION_DEPARTURE_MISMATCH')
  })

  it('deletes an existing passenger with a defined success body', async () => {
    const res = await request(createApp())
      .delete(`/api/departure-passengers/${PASSENGER_ID}`)
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true, id: PASSENGER_ID })
  })

  it('returns 404 for an unknown passenger delete', async () => {
    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-000000000099')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when reservation exists only in another org', async () => {
    reservations = [{ id: RESERVATION_ID, org_id: OTHER_ORG, departure_id: DEPARTURE_ID }]

    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
        full_name: 'Wrong Org Reservation',
      })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('RESERVATION_NOT_FOUND')
  })

  it('rejects direct passenger add when reservation passenger count would exceed party size', async () => {
    passengers.push({
      id: '30000000-0000-4000-8000-000000000002',
      org_id: TEST_ORG,
      reservation_id: RESERVATION_ID,
      departure_id: DEPARTURE_ID,
      full_name: 'Second Passenger',
    })

    const res = await request(createApp())
      .post('/api/departure-passengers')
      .set('x-test-org', TEST_ORG)
      .send({
        reservation_id: RESERVATION_ID,
        departure_id: DEPARTURE_ID,
        full_name: 'Third Passenger',
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('RESERVATION_PARTY_SIZE_EXCEEDED')
  })
})
