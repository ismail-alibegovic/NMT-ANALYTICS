/**
 * Sprint 5 §6.2.1 — Atomic capacity reservation contract tests.
 *
 * Goal: lock down the POST /api/reservations handler's behavior against the
 * `reserve_capacity_atomic` Postgres RPC. We do not exercise the actual SQL
 * function here (that requires a live DB); instead we mock the
 * `supabaseAdmin` client and assert that the route, given the contractual set
 * of returned values from the RPC, translates each one correctly into an
 * HTTP response:
 *
 *   - happy path      → 201 with inserted reservation
 *   - CAPACITY_FULL   → 400 with code `CAPACITY_FULL`
 *   - DEPARTURE_NOT_FOUND → 404 with code `DEPARTURE_NOT_FOUND`
 *
 * Concurrency: a parallel batch (many callers hitting the RPC at once)
 * against a deterministic single-slot inventory asserts exactly one caller
 * gets `201` and everyone else gets `400 / CAPACITY_FULL`. The Postgres
 * function shoulders the actual atomicity; this test confirms the API layer
 * does the right thing per-response and the "first caller wins, rest see
 * full" invariant is upheld end-to-end through the route handler.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// 1. In-memory departure inventory. Capacity = 1, partySize = 1 per request.
//    First caller books the single seat; everyone else must be rejected.
// ---------------------------------------------------------------------------
let booked = 0
let capacity = 1

// Bookkeeping so we can introspect how many concurrent reservations actually
// got 201 vs 4xx — this is what the concurrency test asserts.
let acceptedCount = 0
let failAccommodation = false

// ---------------------------------------------------------------------------
// 2. Mock supabaseAdmin BEFORE importing the reservations router. vitest
//    hoists `vi.mock` automatically. We mock against LIVE state (`booked` /
//    `capacity`) so that `beforeEach` can reset just the variables without
//    invalidating the module that already captured the mock.
// ---------------------------------------------------------------------------
vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}))

vi.mock('../lib/reservationAccommodation', () => ({
  deleteReservationAccommodation: vi.fn(),
  getReservationAccommodation: vi.fn(),
  mapAccommodationError: vi.fn(() => ({ status: 400, code: 'ACCOMMODATION_INVALID', message: 'Accommodation could not be saved' })),
  replaceReservationAccommodation: vi.fn(async () => {
    if (failAccommodation) throw new Error('ROOMS_SOLD_OUT');
    return [{ id: 'requirement-1' }];
  }),
}))

vi.mock('../lib/supabase', () => {
  function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === 'reserve_capacity_atomic') {
      const party = Number(args.p_party_size ?? 1)
      const requested = booked + party
      if (requested > capacity) {
        return Promise.resolve({
          data: null,
          error: { message: 'CAPACITY_FULL: departure has insufficient seats' },
        })
      }
      booked = requested
      return Promise.resolve({ data: { booked_after: booked }, error: null })
    }
    if (name === 'release_capacity_atomic') {
      const party = Number(args.p_party_size ?? 1)
      booked = Math.max(0, booked - party)
      return Promise.resolve({ data: { booked_after: booked }, error: null })
    }
    return Promise.resolve({ data: null, error: { message: 'unknown RPC' } })
  }

  const client = {
    rpc: vi.fn(rpc),
    from: vi.fn((table: string) => {
      switch (table) {
        case 'reservations': {
          const single = vi.fn(async function (_arg: unknown) {
            acceptedCount += 1
            // Echo back the inserted payload fields the route selects back.
            // The route's .insert(insertPayload).select(...).single() chains
            // through this single() and must return the customer_name we
            // received so the 201 body matches the request.
            const payload = (single as unknown as { __insertPayload?: any }).__insertPayload
            return {
              data: {
                id: `res-${acceptedCount}`,
                customer_name: payload?.customer_name || 'Concurrent',
                party_size: payload?.party_size ?? 1,
                total_amount: payload?.total_amount ?? 0,
                currency: payload?.currency || 'BAM',
              },
              error: null,
            }
          })
          const select = vi.fn(() => ({ single }))
          const insert = vi.fn((payload: any) => {
            ;(single as unknown as { __insertPayload?: any }).__insertPayload = payload
            return { select }
          })
          const deleteEqOrg = vi.fn(async () => ({ error: null }))
          const deleteEqId = vi.fn(() => ({ eq: deleteEqOrg }))
          const deleteFn = vi.fn(() => ({ eq: deleteEqId }))
          return { insert, select, delete: deleteFn }
        }
        case 'departures': {
          const updateEq = vi.fn(async () => ({ error: null }))
          const update = vi.fn(() => ({ eq: updateEq }))
          const depSelectSingle = vi.fn(async () => ({
            data: { packages: [{ name: 'Test Package' }] },
            error: null,
          }))
          const depSelectEq = vi.fn(() => ({ single: depSelectSingle }))
          const depSelectConditionsEq = vi.fn(() => depSelectEq)
          const select = vi.fn((cols: string) => {
            if (cols === 'packages(name)') return { eq: depSelectConditionsEq }
            return { eq: vi.fn(() => ({ eq: depSelectEq })) }
          })
          return { update, select }
        }
        case 'customers': {
          const custSingle = vi.fn(async () => ({ data: { id: 'cust-1' }, error: null }))
          const custEqOrg = vi.fn(() => ({ single: custSingle }))
          const custEqId = vi.fn(() => ({ eq: custEqOrg }))
          return { select: vi.fn(() => ({ eq: custEqId })) }
        }
        default:
          return {}
      }
    }),
  }

  return {
    supabaseAdmin: client,
    supabase: client,
    handleSupabaseError: (res: Response, _e: unknown, msg: string) =>
      res.status(500).json({ code: 'DB_ERROR', message: msg }),
  }
})

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: '00000000-0000-0000-0000-000000000000', email: 'dev@x', role: 'agent' }
    next()
  },
}))
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = 'org-test-00000000-0000-0000-0000-000000000000'
    next()
  },
  requireOrgScope: (qb: unknown) => qb,
}))
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireModule: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/auditReservation', () => ({
  auditReservationCreate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  auditReservationUpdate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  auditReservationDelete: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}))

// ---------------------------------------------------------------------------
// 3. Lightweight test app: mount the reservations router under /api. Build
//    it once in beforeAll (after the mocks are hoisted) and reuse across
//    every test. Reset state in beforeEach instead of rebuilding.
// ---------------------------------------------------------------------------
let app: express.Express
// Capture supabaseAdmin by ESM import so we can call mockClear / mockImplementationOnce
// on it. vi.mock has been hoisted and will replace this module.
let supabaseAdminMock: { rpc: ReturnType<typeof vi.fn> } & { from: ReturnType<typeof vi.fn> }

beforeAll(async () => {
  app = express()
  app.use(express.json())
  const mod = (await import('../routes/reservations')) as { default: express.Router }
  app.use('/api', mod.default)
  // Import the mocked module eagerly so per-test overrides are visible by reference.
  const sup = (await import('../lib/supabase')) as { supabaseAdmin: unknown }
  supabaseAdminMock = sup.supabaseAdmin as { rpc: ReturnType<typeof vi.fn> } & { from: ReturnType<typeof vi.fn> }
})

beforeEach(() => {
  booked = 0
  capacity = 1
  acceptedCount = 0
  failAccommodation = false
  // vitest mock: clear recorded calls + implementations so the next test
  // sees the original vi.fn(rpc) implementation.
  if (supabaseAdminMock?.rpc?.mockClear) {
    supabaseAdminMock.rpc.mockClear()
  }
})

const validBody = {
  customerName: 'Adnan Beganović',
  customerPhone: '+38761240679',
  partySize: 1,
  reservationAt: '2026-09-01T08:00:00.000Z',
  status: 'confirmed',
  departureId: 'a1b2c3d4-0000-4000-8000-000000000000',
  totalAmount: 1000,
  currency: 'BAM',
}

describe('POST /api/reservations — Sprint 5 §6.2.1 atomic capacity contract', () => {
  it('returns 201 with the created reservation on happy path', async () => {
    const res = await request(app).post('/api/reservations').send(validBody)
    if (res.status !== 201) {
      // eslint-disable-next-line no-console
      console.error('[happy path debug] status', res.status, 'body', JSON.stringify(res.body))
    }
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('customer_name', 'Adnan Beganović')
    expect(res.body).toHaveProperty('party_size', 1)
    expect(booked).toBe(1)
  })

  it('returns 400 CAPACITY_FULL when the departure is oversold', async () => {
    // First call consumes the only seat (capacity = 1).
    const first = await request(app).post('/api/reservations').send(validBody)
    expect(first.status).toBe(201)

    // Second call must be rejected by the simulated atomic guard.
    const second = await request(app).post('/api/reservations').send(validBody)
    expect(second.status).toBe(400)
    expect(second.body).toHaveProperty('code', 'CAPACITY_FULL')
    expect(booked).toBe(1) // no double booking
  })

  it('returns 404 DEPARTURE_NOT_FOUND when the RPC reports a missing departure', async () => {
    // Force the next RPC call to simulate a missing departure by overriding
    // the mock once — the underlying vi.fn(rpc) implementation resumes after.
    supabaseAdminMock.rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'DEPARTURE_NOT_FOUND: departure row missing' },
    }))

    const res = await request(app).post('/api/reservations').send(validBody)
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('code', 'DEPARTURE_NOT_FOUND')
  })

  it('deadlocked-seat concurrency: exactly one of N concurrent callers wins', async () => {
    const N = 20
    const payloads = Array.from(
      { length: N },
      (_, i) => ({ ...validBody, customerName: `Concurrent ${i}` }),
    )

    // Fire all at once. JavaScript is single-threaded; each `request().send()`
    // awaits on a microtask boundary. The mocked `rpc` runs synchronously
    // inside Promise.resolve microtasks, so the first to settle increments
    // booked to 1, the rest see requested > 1 and return CAPACITY_FULL —
    // exactly what the real PG function does under READ COMMITTED + row lock.
    const results = await Promise.all(
      payloads.map((p) => request(app).post('/api/reservations').send(p)),
    )

    const ok = results.filter((r) => r.status === 201)
    const full = results.filter((r) => r.status === 400 && r.body.code === 'CAPACITY_FULL')

    expect(ok.length).toBe(1)
    expect(full.length).toBe(N - 1)
    expect(booked).toBe(1)
    expect(acceptedCount).toBe(1)
  })

  it('rolls back failed accommodation persistence with atomic release instead of absolute booked overwrite', async () => {
    capacity = 4
    booked = 1
    failAccommodation = true

    const res = await request(app).post('/api/reservations').send({
      ...validBody,
      partySize: 2,
      accommodationRequirements: [{
        hotelAllocationId: '11111111-1111-4111-8111-111111111111',
        roomCount: 1,
        guestsExpected: 2,
      }],
    })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('code', 'ACCOMMODATION_INVALID')
    expect(supabaseAdminMock.rpc).toHaveBeenCalledWith('reserve_capacity_atomic', {
      p_departure_id: validBody.departureId,
      p_org_id: 'org-test-00000000-0000-0000-0000-000000000000',
      p_party_size: 2,
    })
    expect(supabaseAdminMock.rpc).toHaveBeenCalledWith('release_capacity_atomic', {
      p_departure_id: validBody.departureId,
      p_org_id: 'org-test-00000000-0000-0000-0000-000000000000',
      p_party_size: 2,
    })
    expect(booked).toBe(1)
  })
})
