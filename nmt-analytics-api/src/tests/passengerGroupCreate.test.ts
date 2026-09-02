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
const PAX_C = '30000000-0000-4000-8000-00000000000c'
const OTHER_DEPARTURE_ID = '20000000-0000-4000-8000-000000000002'

const ALLOWED_ACCOMMODATION_PREFS = [
  'same_room',
  'adjacent_rooms',
  'same_floor',
  'nearby',
  'no_preference',
]

let insertedGroup: Record<string, any> | null = null
let groupRows: Record<string, any>[] = []
let memberRows: Record<string, any>[] = []
let passengerRows = [
  { id: PAX_A, org_id: TEST_ORG, reservation_id: 'r-a', departure_id: DEPARTURE_ID },
  { id: PAX_B, org_id: TEST_ORG, reservation_id: 'r-b', departure_id: DEPARTURE_ID },
  { id: PAX_C, org_id: TEST_ORG, reservation_id: 'r-c', departure_id: DEPARTURE_ID },
]

function matchesQuery(row: Record<string, any>, eqs: any[] = [], ins: Array<{ col: string; vals: any[] }> = []) {
  for (let i = 0; i < eqs.length; i += 2) {
    if (row[eqs[i]] !== eqs[i + 1]) return false
  }
  for (const filter of ins) {
    if (!filter.vals.includes(row[filter.col])) return false
  }
  return true
}

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
          groupRows.push(insertedGroup!)
        }
      } else if (table === 'trip_passenger_group_members') {
        const payloads = Array.isArray(payload) ? payload : [payload]
        memberRows.push(...payloads.map((row, index) => ({ id: row.id || `member-${memberRows.length + index + 1}`, ...row })))
      }
      return q
    },
    update: (payload: any) => {
      q._updatePayload = payload
      return q
    },
    delete: () => {
      q._delete = true
      return q
    },
    eq: (col: string, val: any) => {
      if (!q._eqs) q._eqs = [];
      q._eqs.push(col, val);
      return q;
    },
    in: (col: string, vals: any[]) => {
      if (!q._ins) q._ins = []
      q._ins.push({ col, vals })
      return q
    },
    limit: () => q,
    order: () => q,
    single: async () =>
      {
        if (q._insertError) return { data: null, error: q._insertError }
        if (table === 'trip_passenger_groups' && q._updatePayload) {
          const row = groupRows.find((candidate) => matchesQuery(candidate, q._eqs))
          if (!row) return { data: null, error: null }
          Object.assign(row, q._updatePayload)
          return { data: row, error: null }
        }
        if (table === 'trip_passenger_groups' && (q._eqs || []).length > 0) {
          return { data: groupRows.find((row) => matchesQuery(row, q._eqs)) || null, error: null }
        }
        if (table === 'departure_passengers') {
          return { data: passengerRows.find((row) => matchesQuery(row, q._eqs, q._ins)) || null, error: null }
        }
        return { data: insertedGroup, error: null }
      },
  }

  q.maybeSingle = async () => {
    // For the tenant-safety DELETE test: resolve group only when
    // org_id filter matches TEST_ORG (simulating cross-org rejection).
    const eqVals = (q._eqs || []) as string[];
    if (table === 'trip_passenger_groups') {
      return { data: groupRows.find((row) => matchesQuery(row, q._eqs)) || null, error: null };
    }
    return { data: null, error: null };
  };

  // Terminal thenable for non-.single() awaits (validation + count queries).
  q.then = (resolve: (v: any) => void) => {
    if (table === 'departure_passengers') {
      return resolve({ data: passengerRows.filter((row) => matchesQuery(row, q._eqs, q._ins)), error: null })
    }
    if (table === 'trip_passenger_groups') {
      if (q._delete) {
        groupRows = groupRows.filter((row) => !matchesQuery(row, q._eqs))
        return resolve({ data: [], error: null })
      }
      return resolve({ data: groupRows.filter((row) => matchesQuery(row, q._eqs, q._ins)), error: null, count: groupRows.length })
    }
    if (table === 'trip_passenger_group_members') {
      if (q._delete) {
        memberRows = memberRows.filter((row) => !matchesQuery(row, q._eqs))
        return resolve({ data: [], error: null })
      }
      return resolve({ data: memberRows.filter((row) => matchesQuery(row, q._eqs, q._ins)), error: null })
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
    ;(req as any).orgId = (req.headers['x-org-id'] as string) || TEST_ORG
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
    groupRows = []
    memberRows = []
    passengerRows = [
      { id: PAX_A, org_id: TEST_ORG, reservation_id: 'r-a', departure_id: DEPARTURE_ID },
      { id: PAX_B, org_id: TEST_ORG, reservation_id: 'r-b', departure_id: DEPARTURE_ID },
      { id: PAX_C, org_id: TEST_ORG, reservation_id: 'r-c', departure_id: DEPARTURE_ID },
    ]
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

describe('passenger group lock semantics', () => {
  beforeEach(() => {
    insertedGroup = null
    groupRows = [
      {
        id: 'group-locked',
        org_id: TEST_ORG,
        departure_id: DEPARTURE_ID,
        locked: true,
        capacity: 2,
        return_at: null,
      },
      {
        id: 'group-open',
        org_id: TEST_ORG,
        departure_id: DEPARTURE_ID,
        locked: false,
      },
    ]
    memberRows = [
      { id: 'member-a', group_id: 'group-locked', passenger_id: PAX_A, reservation_id: 'r-a' },
      { id: 'member-b', group_id: 'group-open', passenger_id: PAX_B, reservation_id: 'r-b' },
    ]
    passengerRows = [
      { id: PAX_A, org_id: TEST_ORG, reservation_id: 'r-a', departure_id: DEPARTURE_ID },
      { id: PAX_B, org_id: TEST_ORG, reservation_id: 'r-b', departure_id: DEPARTURE_ID },
      { id: PAX_C, org_id: TEST_ORG, reservation_id: 'r-c', departure_id: DEPARTURE_ID },
    ]
  })

  it('rejects adding a member to a locked group', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/passenger-groups/group-locked/members')
      .send({ passengerId: PAX_C })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('GROUP_LOCKED')
    expect(memberRows.some((row) => row.group_id === 'group-locked' && row.passenger_id === PAX_C)).toBe(false)
  })

  it('rejects removing a member from a locked group', async () => {
    const app = await buildApp()
    const res = await request(app)
      .delete('/api/passenger-groups/group-locked/members/member-a')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('GROUP_LOCKED')
    expect(memberRows.some((row) => row.id === 'member-a')).toBe(true)
  })

  it('rejects deleting a locked group', async () => {
    const app = await buildApp()
    const res = await request(app)
      .delete('/api/passenger-groups/group-locked')

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('GROUP_LOCKED')
    expect(groupRows.some((row) => row.id === 'group-locked')).toBe(true)
  })

  it('allows metadata PATCH to unlock a locked group', async () => {
    const app = await buildApp()
    const res = await request(app)
      .patch('/api/passenger-groups/group-locked')
      .send({ locked: false })

    expect(res.status).toBe(200)
    expect(res.body.locked).toBe(false)
    expect(groupRows.find((row) => row.id === 'group-locked')?.locked).toBe(false)
  })

  it('keeps existing unlocked add-member behavior', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/passenger-groups/group-open/members')
      .send({ passengerId: PAX_C })

    expect(res.status).toBe(201)
    expect(memberRows.some((row) => row.group_id === 'group-open' && row.passenger_id === PAX_C)).toBe(true)
  })

  it('keeps cross-departure passenger protection when unlocked', async () => {
    passengerRows = [
      { id: PAX_A, org_id: TEST_ORG, reservation_id: 'r-a', departure_id: DEPARTURE_ID },
      { id: PAX_B, org_id: TEST_ORG, reservation_id: 'r-b', departure_id: DEPARTURE_ID },
      { id: PAX_C, org_id: TEST_ORG, reservation_id: 'r-c', departure_id: OTHER_DEPARTURE_ID },
    ]
    const app = await buildApp()
    const res = await request(app)
      .post('/api/passenger-groups/group-open/members')
      .send({ passengerId: PAX_C })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(memberRows.some((row) => row.group_id === 'group-open' && row.passenger_id === PAX_C)).toBe(false)
  })
})

describe('DELETE /passenger-groups/:id/members/:memberId - tenant safety', () => {
  const ORG_B = '33333333-3333-3333-3333-333333333333';
  const GROUP_ID = 'group-org-a';
  const MEMBER_ID = PAX_A;

  it('org A must not be able to delete membership from org B group', async () => {
    groupRows = [{ id: GROUP_ID, org_id: TEST_ORG, departure_id: DEPARTURE_ID, locked: false }]
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/passenger-groups/${GROUP_ID}/members/${MEMBER_ID}`)
      .set('x-org-id', ORG_B);
    // maybeSingle tracks eq filters: org_id === ORG_B → no match → null → 404
    expect(res.status).toBe(404);
  });
});
