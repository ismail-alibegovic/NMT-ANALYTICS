import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

// Regression guard: creating a passenger group with no explicit
// accommodationPreference must NOT violate the DB CHECK constraint.
// The live column CHECK allows: same_room | adjacent_rooms | same_floor |
// nearby | no_preference. A previous default of 'prefer_together' (a
// *seating* value) leaked into accommodation_preference and made every
// default "create group" call fail with Postgres error 23514 (500).

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001'
const PAX_A = '30000000-0000-4000-8000-00000000000a'
const PAX_B = '30000000-0000-4000-8000-00000000000b'

const ALLOWED_ACCOMMODATION_PREFS = [
  'same_room',
  'adjacent_rooms',
  'same_floor',
  'nearby',
  'no_preference',
]

let insertedGroup: Record<string, any> | null = null

const passengerRows = [
  { id: PAX_A, reservation_id: 'r-a', departure_id: DEPARTURE_ID },
  { id: PAX_B, reservation_id: 'r-b', departure_id: DEPARTURE_ID },
]

function makeQuery(table: string) {
  const q: any = {
    _table: table,
    select: () => q,
    insert: (payload: any) => {
      if (table === 'trip_passenger_groups') {
        // Emulate the DB CHECK constraint exactly.
        if (!ALLOWED_ACCOMMODATION_PREFS.includes(payload.accommodation_preference)) {
          q._insertError = {
            code: '23514',
            message:
              'new row for relation "trip_passenger_groups" violates check constraint "trip_passenger_groups_accommodation_preference_check"',
          }
        } else {
          insertedGroup = { id: 'group-1', ...payload }
        }
      }
      return q
    },
    eq: () => q,
    in: () => q,
    limit: () => q,
    order: () => q,
    single: async () =>
      q._insertError
        ? { data: null, error: q._insertError }
        : { data: insertedGroup, error: null },
  }

  // Terminal thenable for non-.single() awaits (validation + count queries).
  q.then = (resolve: (v: any) => void) => {
    if (table === 'departure_passengers') {
      return resolve({ data: passengerRows, error: null })
    }
    if (table === 'trip_passenger_groups') {
      return resolve({ data: [], error: null, count: 0 })
    }
    if (table === 'trip_passenger_group_members') {
      // insert() members success, and duplicate-check returns none.
      return resolve({ data: [], error: null })
    }
    return resolve({ data: [], error: null })
  }
  return q
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { from: (table: string) => makeQuery(table) },
  handleSupabaseError: (res: Response, error: any) =>
    res.status(500).json({ error: { code: error?.code || 'DB', message: error?.message } }),
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: 'u1', role: 'director' }
    next()
  },
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).orgId = TEST_ORG
    next()
  },
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

async function buildApp() {
  const mod = await import('../routes/passengerGroups')
  const app = express()
  app.use(express.json())
  app.use('/api', mod.default)
  return app
}

describe('POST /departures/:departureId/passenger-groups', () => {
  beforeEach(() => {
    insertedGroup = null
  })

  it('creates a group with a valid accommodation_preference when none is provided', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE_ID}/passenger-groups`)
      .send({ name: 'Test Group', memberIds: [PAX_A, PAX_B] })

    expect(res.status).toBe(201)
    expect(insertedGroup).not.toBeNull()
    expect(ALLOWED_ACCOMMODATION_PREFS).toContain(insertedGroup!.accommodation_preference)
  })

  it('honors an explicit accommodationPreference', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE_ID}/passenger-groups`)
      .send({ memberIds: [PAX_A, PAX_B], accommodationPreference: 'same_room' })

    expect(res.status).toBe(201)
    expect(insertedGroup!.accommodation_preference).toBe('same_room')
  })
})
