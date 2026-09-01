import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const ORG_ID = 'org-test-00000000-0000-0000-0000-000000000000'
const DEPARTURE_ID = 'a1b2c3d4-0000-4000-8000-000000000000'
const RESERVATION_ID = 'b1b2c3d4-0000-4000-8000-000000000000'

let capacity = 30
let currentReservation = {
  id: RESERVATION_ID,
  org_id: ORG_ID,
  departure_id: DEPARTURE_ID,
  party_size: 2,
  status: 'pending',
  total_amount: 1000,
  paid_amount: 0,
  customer_id: null,
  reservation_at: '2026-09-01T08:00:00.000Z',
}
let otherBooked = 26

function activeReservationsForDeparture() {
  const rows = []
  if (currentReservation.status !== 'cancelled') rows.push(currentReservation)
  if (otherBooked > 0) {
    rows.push({
      id: 'other-res',
      org_id: ORG_ID,
      departure_id: DEPARTURE_ID,
      party_size: otherBooked,
      status: 'pending',
    })
  }
  return rows
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'test@travline.app', role: 'agent' }
    next()
  },
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = ORG_ID
    next()
  },
  requireOrgScope: (qb: unknown) => qb,
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireModule: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  auditReservationUpdate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  auditReservationDelete: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}))

vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}))

vi.mock('../lib/reservationAccommodation', () => ({
  deleteReservationAccommodation: vi.fn(),
  getReservationAccommodation: vi.fn(),
  mapAccommodationError: vi.fn(),
  replaceReservationAccommodation: vi.fn(),
}))

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(async () => undefined),
}))

vi.mock('../lib/supabase', () => {
  function buildCollectionQuery(rowsFactory: () => any[]) {
    let rows = rowsFactory()
    const query: any = {
      eq(column: string, value: unknown) {
        rows = rows.filter((row: any) => row[column] === value)
        return query
      },
      in(column: string, values: unknown[]) {
        const set = new Set(values)
        rows = rows.filter((row: any) => set.has(row[column]))
        return query
      },
      single: vi.fn(async () => ({
        data: rows[0] || null,
        error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' },
      })),
      then(resolve: any) {
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve)
      },
    }
    return query
  }

  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const party = Number(args.p_party_size || 0)
      if (name === 'reserve_capacity_atomic') {
        if (otherBooked + currentReservation.party_size + party > capacity) {
          return { data: null, error: { message: 'CAPACITY_FULL: departure has insufficient seats' } }
        }
        currentReservation = { ...currentReservation, party_size: currentReservation.party_size + party }
        return { data: { booked_after: otherBooked + currentReservation.party_size }, error: null }
      }
      if (name === 'release_capacity_atomic') {
        currentReservation = { ...currentReservation, party_size: Math.max(0, currentReservation.party_size - party) }
        return { data: { booked_after: otherBooked + currentReservation.party_size }, error: null }
      }
      return { data: null, error: { message: 'unknown RPC' } }
    }),
    from: vi.fn((table: string) => {
      if (table === 'reservations') {
        const select = vi.fn((cols?: string) => {
          if (cols === '*') return buildCollectionQuery(() => [currentReservation])
          if (cols?.includes('departure_id')) return buildCollectionQuery(() => activeReservationsForDeparture())
          return buildCollectionQuery(() => [currentReservation])
        })
        const updateSingle = vi.fn(async () => ({ data: currentReservation, error: null }))
        const updateEqOrg = vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) }))
        const updateEqId = vi.fn(() => ({ eq: updateEqOrg }))
        return { select, update: vi.fn((payload: any) => {
          currentReservation = {
            ...currentReservation,
            ...Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)),
            party_size: payload.party_size ?? currentReservation.party_size,
            departure_id: payload.departure_id ?? currentReservation.departure_id,
            status: payload.status ?? currentReservation.status,
          }
          return { eq: updateEqId }
        }) }
      }
      if (table === 'departures') {
        return {
          select: vi.fn(() => buildCollectionQuery(() => [{ id: DEPARTURE_ID, org_id: ORG_ID, capacity }])),
        }
      }
      if (table === 'departure_passengers') {
        return {
          select: vi.fn(() => buildCollectionQuery(() => [])),
        }
      }
      return {}
    }),
  }

  return {
    supabaseAdmin: client,
    supabase: client,
    handleSupabaseError: (res: Response, _e: unknown, msg: string) => res.status(500).json({ code: 'DB_ERROR', message: msg }),
  }
})

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json())
  const mod = (await import('../routes/reservations')) as { default: express.Router }
  app.use('/api', mod.default)
})

beforeEach(() => {
  capacity = 30
  currentReservation = {
    id: RESERVATION_ID,
    org_id: ORG_ID,
    departure_id: DEPARTURE_ID,
    party_size: 2,
    status: 'pending',
    total_amount: 1000,
    paid_amount: 0,
    customer_id: null,
    reservation_at: '2026-09-01T08:00:00.000Z',
  }
  otherBooked = 26
})

describe('PATCH /api/reservations/:id capacity delta', () => {
  it('allows edit 2 -> 4 when remaining capacity is 2', async () => {
    const res = await request(app)
      .patch(`/api/reservations/${RESERVATION_ID}`)
      .send({ partySize: 4 })

    expect(res.status).toBe(200)
    expect(res.body.party_size).toBe(4)
  })

  it('rejects edit 2 -> 5 when remaining capacity is 2', async () => {
    const res = await request(app)
      .patch(`/api/reservations/${RESERVATION_ID}`)
      .send({ partySize: 5 })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DEPARTURE_CAPACITY_EXCEEDED')
    expect(res.body.details).toMatchObject({
      capacity: 30,
      booked: 28,
      requestedAdditionalPassengers: 3,
      remainingCapacity: 2,
    })
  })
})
