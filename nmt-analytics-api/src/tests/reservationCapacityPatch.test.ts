import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const ORG_ID = 'org-test-00000000-0000-0000-0000-000000000000'
const DEPARTURE_ID = 'a1b2c3d4-0000-4000-8000-000000000000'
const RESERVATION_ID = 'b1b2c3d4-0000-4000-8000-000000000000'

let capacity = 30
let editError: string | null = null
let financialLookupError: string | null = null
let currentReservation: Record<string, any> = {
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

vi.mock('../lib/reservationAccommodation', async () => ({
  deleteReservationAccommodation: vi.fn(),
  getReservationAccommodation: vi.fn(),
  mapAccommodationError: (await vi.importActual<typeof import('../lib/reservationAccommodation')>('../lib/reservationAccommodation')).mapAccommodationError,
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
      if (name === 'edit_reservation_atomic') {
        if (editError) return { data: null, error: { message: editError } }
        currentReservation = { ...currentReservation, ...(args.p_updates as object) }
        return { data: currentReservation, error: null }
      }
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
          select: vi.fn(() => buildCollectionQuery(() => [{ id: DEPARTURE_ID, org_id: ORG_ID, package_id: 'pkg-1', capacity, packages: { currency: 'BAM' } }])),
        }
      }
      if (['payments', 'payment_links', 'contracts', 'receipts'].includes(table)) {
        const query: any = {
          select: () => query,
          eq: () => query,
          then: (resolve: any) => Promise.resolve({ count: 0, error: table === financialLookupError ? { message: 'Database unavailable' } : null }).then(resolve),
        }
        return query
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
  financialLookupError = null
  editError = null
  vi.clearAllMocks()
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


describe('reservation currency validation failures', () => {
  it.each(['payments', 'payment_links', 'contracts', 'receipts'])('rejects a currency change when %s cannot be checked', async (table) => {
    currentReservation.departure_id = null
    currentReservation.currency = 'BAM'
    financialLookupError = table
    const res = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({ currency: 'EUR' })
    expect(res.status).toBe(500)
    expect(currentReservation.currency).toBe('BAM')
  })
})

// HTTP contract tests deliberately do not emulate transaction rollback. Actual
// rollback/capacity/tenant/privilege assertions live in reservation-edit-atomicity.sql.
describe('combined reservation edit HTTP contract', () => {
  it('sends core and accommodation to one org-scoped RPC, with no separate capacity call', async () => {
    const { supabaseAdmin } = await import('../lib/supabase')
    const res = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({
      customerName: 'Changed buyer', partySize: 3,
      accommodationRequirements: [{ hotelAllocationId: DEPARTURE_ID, roomCount: 1, guestsExpected: 3, passengerIds: [] }],
    })
    expect(res.status).toBe(200)
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('edit_reservation_atomic', {
      p_org_id: ORG_ID, p_reservation_id: RESERVATION_ID,
      p_updates: { customer_name: 'Changed buyer', party_size: 3, currency: 'BAM' },
      p_requirements: [{ hotel_allocation_id: DEPARTURE_ID, room_count: 1, guests_expected: 3, notes: null, passenger_ids: [] }],
    })
    expect(res.body.customer_name).toBe('Changed buyer')
  })
  it('maps transaction capacity conflicts and never falls through to legacy writes', async () => {
    const { supabaseAdmin } = await import('../lib/supabase')
    editError = 'CAPACITY_FULL'
    const before = { ...currentReservation }
    const res = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({ partySize: 5, accommodationRequirements: [] })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DEPARTURE_CAPACITY_EXCEEDED')
    expect(currentReservation).toEqual(before)
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
  })
  it('returns accommodation conflicts from the transaction without a core-only fallback', async () => {
    const { supabaseAdmin } = await import('../lib/supabase')
    editError = 'ACCOMMODATION_OVERBOOKED'
    const before = { ...currentReservation }
    const res = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({ customerName: 'Unsaved', accommodationRequirements: [] })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACCOMMODATION_OVERBOOKED')
    expect(currentReservation).toEqual(before)
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
  })
  it('allows explicit cancellation preservation and validates ledger-owned or malformed input before RPC', async () => {
    const { supabaseAdmin } = await import('../lib/supabase')
    const cancel = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({ status: 'cancelled', accommodationRequirements: null })
    expect(cancel.status).toBe(200)
    expect(supabaseAdmin.rpc).toHaveBeenLastCalledWith('edit_reservation_atomic', expect.objectContaining({ p_requirements: null }))
    vi.mocked(supabaseAdmin.rpc).mockClear()
    for (const body of [{ paidAmount: 1, accommodationRequirements: [] }, { accommodationRequirements: [{}] }]) {
      expect((await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send(body)).status).toBe(400)
    }
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })
  it('cannot target another organization reservation', async () => {
    const { supabaseAdmin } = await import('../lib/supabase')
    currentReservation.org_id = 'foreign-org'
    const res = await request(app).patch(`/api/reservations/${RESERVATION_ID}`).send({ customerName: 'Forbidden', accommodationRequirements: [] })
    expect(res.status).toBe(404)
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled()
  })
})
