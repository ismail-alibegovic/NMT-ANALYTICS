import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'

let departuresStore: any[] = []
let reservationsStore: any[] = []
let passengersStore: any[] = []

function makeQuery(rows: any[]) {
  let working = [...rows]
  const query: any = {
    eq(column: string, value: unknown) {
      working = working.filter((row) => row[column] === value)
      return query
    },
    in(column: string, values: unknown[]) {
      const set = new Set(values)
      working = working.filter((row) => set.has(row[column]))
      return query
    },
    order() {
      return query
    },
    range() {
      return query
    },
    then(resolve: any) {
      return Promise.resolve({ data: working, error: null, count: working.length }).then(resolve)
    },
  }
  return query
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = TEST_ORG
    next()
  },
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/auditLogger', () => ({
  auditDepartureCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditDepartureUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditDepartureDelete: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../lib/manualMessaging', () => ({
  manualMessageSchema: {},
  sendManualEmailForOrg: vi.fn(),
  sendManualSmsForOrg: vi.fn(),
}))

vi.mock('../lib/departureAccommodation', () => ({
  getDepartureAccommodationAllotments: vi.fn(),
  materializeDepartureAccommodationFromPackage: vi.fn(),
  updateDepartureAccommodationAllotment: vi.fn(),
}))

vi.mock('../lib/reservationAccommodation', () => ({
  getAccommodationOptions: vi.fn(),
}))

vi.mock('../lib/documentReadiness', () => ({
  computePassengerDocumentReadiness: vi.fn(),
  summarizeDocumentReadiness: vi.fn(() => ({ required: false, totalRelevant: 0, ready: 0, missing: 0, expiredBeforeDeparture: 0, expiredBeforeReturn: 0 })),
  toTravelDateKey: vi.fn(() => null),
}))

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'departures') return { select: vi.fn(() => makeQuery(departuresStore)) }
      if (table === 'reservations') return { select: vi.fn(() => makeQuery(reservationsStore)) }
      if (table === 'departure_passengers') return { select: vi.fn(() => makeQuery(passengersStore)) }
      return { select: vi.fn(() => makeQuery([])) }
    }),
  },
  supabase: {},
  handleSupabaseError: (res: Response, err: any, message: string) => res.status(500).json({ code: err?.code || 'DB_ERROR', message }),
}))

import departuresRouter from '../routes/departures'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', departuresRouter)
  return app
}

describe('GET /api/departures occupancy source', () => {
  beforeEach(() => {
    departuresStore = [
      {
        id: 'dep-1',
        org_id: TEST_ORG,
        package_id: 'pkg-1',
        depart_at: '2027-06-01T00:00:00Z',
        return_at: '2027-06-07T00:00:00Z',
        capacity: 30,
        booked: 0,
        status: 'active',
        packages: { id: 'pkg-1', name: 'Alpha', destination: 'A', base_price: 0, currency: 'BAM' },
      },
    ]
    reservationsStore = []
    passengersStore = []
  })

  it('uses departure_passengers count when passenger rows exist', async () => {
    reservationsStore = [
      { id: 'res-1', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 8, status: 'pending' },
    ]
    passengersStore = Array.from({ length: 6 }, (_, i) => ({
      id: `p-${i}`,
      org_id: TEST_ORG,
      departure_id: 'dep-1',
      reservation_id: 'res-1',
    }))

    const res = await request(createApp()).get('/api/departures')
    expect(res.status).toBe(200)
    expect(res.body.data[0].booked).toBe(6)
  })

  it('falls back to party_size sum when no passenger rows exist', async () => {
    reservationsStore = [
      { id: 'res-1', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 3, status: 'pending' },
      { id: 'res-2', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 5, status: 'confirmed' },
    ]

    const res = await request(createApp()).get('/api/departures')
    expect(res.status).toBe(200)
    expect(res.body.data[0].booked).toBe(8)
  })

  it('uses passenger count only when both rows exist', async () => {
    reservationsStore = [
      { id: 'res-1', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 8, status: 'pending' },
    ]
    passengersStore = Array.from({ length: 6 }, (_, i) => ({
      id: `p-${i}`,
      org_id: TEST_ORG,
      departure_id: 'dep-1',
      reservation_id: 'res-1',
    }))

    const res = await request(createApp()).get('/api/departures')
    expect(res.status).toBe(200)
    expect(res.body.data[0].booked).toBe(6)
  })

  it('adds passenger-backed reservations and passengerless reservations without double counting', async () => {
    reservationsStore = [
      { id: 'res-1', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 4, status: 'pending' },
      { id: 'res-2', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 3, status: 'confirmed' },
    ]
    passengersStore = Array.from({ length: 2 }, (_, i) => ({
      id: `p-${i}`,
      org_id: TEST_ORG,
      departure_id: 'dep-1',
      reservation_id: 'res-1',
    }))

    const res = await request(createApp()).get('/api/departures')
    expect(res.status).toBe(200)
    expect(res.body.data[0].booked).toBe(5)
  })

  it('ignores cross-org reservations and passengers', async () => {
    reservationsStore = [
      { id: 'res-1', org_id: TEST_ORG, departure_id: 'dep-1', party_size: 2, status: 'pending' },
      { id: 'res-2', org_id: OTHER_ORG, departure_id: 'dep-1', party_size: 99, status: 'pending' },
    ]
    passengersStore = [
      { id: 'p-1', org_id: OTHER_ORG, departure_id: 'dep-1', reservation_id: 'res-2' },
    ]

    const res = await request(createApp()).get('/api/departures')
    expect(res.status).toBe(200)
    expect(res.body.data[0].booked).toBe(2)
  })
})
