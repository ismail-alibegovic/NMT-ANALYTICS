import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

// M08.3 regression coverage for DELETE /departure-passengers/:id.
// The route must delegate to the atomic RPC delete_departure_passenger_safe:
// group lock enforcement, deterministic primary reassignment, last-member
// group cleanup, and member_count integrity are DB-owned behaviors. This
// harness emulates those semantics faithfully instead of mocking them away.

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_ID = '40000000-0000-4000-8000-000000000001'
const GROUP_A_ID = '40000000-0000-4000-8000-00000000000a'
const GROUP_B_ID = '40000000-0000-4000-8000-00000000000b'

type PassengerRow = {
  id: string
  org_id: string
  reservation_id: string
  departure_id: string
  full_name: string
}

type GroupRow = {
  id: string
  org_id: string
  departure_id: string
  name: string
  locked: boolean
  primary_passenger_id: string | null
  primary_passenger_name: string | null
  member_count: number
}

type MemberRow = {
  id: string
  group_id: string
  passenger_id: string
  reservation_id: string
  is_primary: boolean
  created_at: string
}

let passengers: PassengerRow[] = []
let groups: GroupRow[] = []
let members: MemberRow[] = []
let auditEntries: any[] = []

function resetStores() {
  passengers = []
  groups = []
  members = []
  auditEntries = []
}

function addPassenger(id: string, fullName: string, org = TEST_ORG, reservationId = 'r-1') {
  passengers.push({ id, org_id: org, reservation_id: reservationId, departure_id: DEPARTURE_ID, full_name: fullName })
}

function addGroup(id: string, opts: Partial<GroupRow> = {}) {
  groups.push({
    id,
    org_id: TEST_ORG,
    departure_id: DEPARTURE_ID,
    name: 'Group',
    locked: false,
    primary_passenger_id: null,
    primary_passenger_name: null,
    member_count: 0,
    ...opts,
  })
}

function addMember(id: string, groupId: string, passengerId: string, isPrimary: boolean, createdAt: string) {
  const passenger = passengers.find((row) => row.id === passengerId)!
  members.push({
    id,
    group_id: groupId,
    passenger_id: passengerId,
    reservation_id: passenger.reservation_id,
    is_primary: isPrimary,
    created_at: createdAt,
  })
  const group = groups.find((row) => row.id === groupId)!
  group.member_count = members.filter((row) => row.group_id === groupId).length
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
  logAuditEntry: vi.fn((entry: any) => {
    auditEntries.push(entry)
    return Promise.resolve()
  }),
}))

// Emulates delete_departure_passenger_safe(p_org_id, p_passenger_id) with the
// exact DB-function semantics from migration 20260902153611.
async function safeDelete(args: { p_org_id: string; p_passenger_id: string }) {
  const passenger = passengers.find(
    (row) => row.id === args.p_passenger_id && row.org_id === args.p_org_id,
  )
  if (!passenger) {
    return { data: null, error: { message: 'PASSENGER_NOT_FOUND' } }
  }

  const memberships = members
    .filter((row) => row.passenger_id === args.p_passenger_id)
    .map((row) => ({ member: row, group: groups.find((g) => g.id === row.group_id && g.org_id === args.p_org_id) }))
    .filter((row) => row.group)
    .sort((a, b) =>
      a.member.created_at === b.member.created_at
        ? a.member.id.localeCompare(b.member.id)
        : a.member.created_at.localeCompare(b.member.created_at),
    )

  for (const entry of memberships) {
    if (entry.group!.locked) {
      return { data: null, error: { message: 'GROUP_LOCKED' } }
    }
  }

  let groupId: string | null = null
  let groupDeleted = false
  let newPrimaryId: string | null = null
  let newPrimaryName: string | null = null

  if (memberships.length > 0) {
    const group = memberships[0].group!
    groupId = group.id

    const remaining = members
      .filter((row) => row.group_id === group.id && row.passenger_id !== args.p_passenger_id)
      .sort((a, b) =>
        a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
      )

    if (remaining.length === 0) {
      members = members.filter((row) => row.group_id !== group.id)
      groups = groups.filter((row) => row.id !== group.id)
      groupDeleted = true
    } else {
      if (group.primary_passenger_id === args.p_passenger_id) {
        newPrimaryId = remaining[0].passenger_id
        newPrimaryName = passengers.find((row) => row.id === newPrimaryId)!.full_name
        for (const row of members) {
          if (row.group_id === group.id) {
            row.is_primary = row.passenger_id === newPrimaryId
          }
        }
        group.primary_passenger_id = newPrimaryId
        group.primary_passenger_name = newPrimaryName
      }
      group.member_count = members.filter((row) => row.group_id === group.id).length
    }
  }

  passengers = passengers.filter((row) => row.id !== args.p_passenger_id)

  // FK cascade: trip_passenger_group_members.passenger_id ON DELETE CASCADE.
  const affectedGroupIds = new Set(members.filter((row) => row.passenger_id === args.p_passenger_id).map((row) => row.group_id))
  members = members.filter((row) => row.passenger_id !== args.p_passenger_id)
  for (const row of groups) {
    if (affectedGroupIds.has(row.id)) {
      row.member_count = members.filter((m) => m.group_id === row.id).length
    }
  }

  return {
    data: [
      {
        passenger_id: args.p_passenger_id,
        reservation_id: passenger.reservation_id,
        departure_id: passenger.departure_id,
        full_name: passenger.full_name,
        group_id: groupId,
        group_deleted: groupDeleted,
        new_primary_passenger_id: newPrimaryId,
        new_primary_passenger_name: newPrimaryName,
      },
    ],
    error: null,
  }
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      throw new Error('M08.3 delete route must not use direct table access')
    }),
    rpc: vi.fn((name: string, args: { p_org_id: string; p_passenger_id: string }) => {
      if (name !== 'delete_departure_passenger_safe') {
        return Promise.resolve({ data: null, error: { message: `UNKNOWN_RPC_${name}` } })
      }
      return safeDelete(args)
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

describe('DELETE /departure-passengers/:id — safe passenger removal', () => {
  beforeEach(() => {
    resetStores()
  })

  it('deletes a passenger with no group normally', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Solo Passenger')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true, id: '30000000-0000-4000-8000-00000000000a' })
    expect(passengers).toHaveLength(0)
    expect(auditEntries[0].metadata.group_id).toBeNull()
    expect(auditEntries[0].metadata.group_deleted).toBe(false)
  })

  it('deletes a non-primary member of an unlocked group and keeps the group intact', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Primary One')
    addPassenger('30000000-0000-4000-8000-00000000000b', 'Member Two')
    addGroup(GROUP_ID, { primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Primary One' })
    addMember('m-1', GROUP_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')
    addMember('m-2', GROUP_ID, '30000000-0000-4000-8000-00000000000b', false, '2026-09-02T10:01:00Z')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000b')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    expect(passengers.some((row) => row.id === '30000000-0000-4000-8000-00000000000b')).toBe(false)
    expect(members.some((row) => row.passenger_id === '30000000-0000-4000-8000-00000000000b')).toBe(false)
    expect(groups.find((row) => row.id === GROUP_ID)).toBeDefined()
    const group = groups.find((row) => row.id === GROUP_ID)!
    expect(group.primary_passenger_id).toBe('30000000-0000-4000-8000-00000000000a')
    expect(group.member_count).toBe(1)
    expect(members.filter((row) => row.group_id === GROUP_ID && row.is_primary)).toHaveLength(1)
  })

  it('reassigns the primary deterministically when the primary passenger is deleted', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Primary One')
    addPassenger('30000000-0000-4000-8000-00000000000b', 'Member Two')
    addPassenger('30000000-0000-4000-8000-00000000000c', 'Member Three')
    addGroup(GROUP_ID, { primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Primary One' })
    addMember('m-1', GROUP_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')
    addMember('m-3', GROUP_ID, '30000000-0000-4000-8000-00000000000c', false, '2026-09-02T10:01:00Z')
    addMember('m-2', GROUP_ID, '30000000-0000-4000-8000-00000000000b', false, '2026-09-02T10:01:00Z')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    const group = groups.find((row) => row.id === GROUP_ID)!
    // Deterministic order: membership created_at ASC, then id ASC → m-2 (Member Two).
    expect(group.primary_passenger_id).toBe('30000000-0000-4000-8000-00000000000b')
    expect(group.primary_passenger_name).toBe('Member Two')
    const primaryRows = members.filter((row) => row.group_id === GROUP_ID && row.is_primary)
    expect(primaryRows).toHaveLength(1)
    expect(primaryRows[0].passenger_id).toBe('30000000-0000-4000-8000-00000000000b')
    expect(group.member_count).toBe(2)
    expect(auditEntries[0].metadata.reassigned_primary_passenger_id).toBe('30000000-0000-4000-8000-00000000000b')
  })

  it('deletes the group when the last member is removed', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Only Member')
    addGroup(GROUP_ID, { primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Only Member' })
    addMember('m-1', GROUP_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    expect(passengers).toHaveLength(0)
    expect(groups.find((row) => row.id === GROUP_ID)).toBeUndefined()
    expect(members).toHaveLength(0)
    expect(auditEntries[0].metadata.group_deleted).toBe(true)
    expect(auditEntries[0].metadata.group_id).toBe(GROUP_ID)
  })

  it('rejects deletion of a passenger in a locked group and changes nothing', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Locked Primary')
    addGroup(GROUP_ID, { locked: true, primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Locked Primary' })
    addMember('m-1', GROUP_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('GROUP_LOCKED')
    expect(res.body.message).toBe('Unlock the passenger group before removing this passenger.')
    expect(passengers.some((row) => row.id === '30000000-0000-4000-8000-00000000000a')).toBe(true)
    expect(members.some((row) => row.passenger_id === '30000000-0000-4000-8000-00000000000a')).toBe(true)
    expect(groups.find((row) => row.id === GROUP_ID)).toBeDefined()
  })

  it('cannot delete a passenger that belongs to another org', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Other Org Passenger', OTHER_ORG)

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
    expect(passengers).toHaveLength(1)
  })

  it('returns 404 for an unknown passenger', async () => {
    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-000000000099')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('keeps member_count equal to actual membership after removal', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Primary One')
    addPassenger('30000000-0000-4000-8000-00000000000b', 'Member Two')
    addGroup(GROUP_ID, { primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Primary One' })
    addMember('m-1', GROUP_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')
    addMember('m-2', GROUP_ID, '30000000-0000-4000-8000-00000000000b', false, '2026-09-02T10:01:00Z')

    await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000b')
      .set('x-test-org', TEST_ORG)

    const group = groups.find((row) => row.id === GROUP_ID)!
    const actual = members.filter((row) => row.group_id === GROUP_ID).length
    expect(group.member_count).toBe(actual)
    expect(group.member_count).toBe(1)
  })
})

describe('member_count integrity across group operations', () => {
  beforeEach(() => {
    resetStores()
  })

  it('tracks member_count correctly across create, replace, and removal', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Passenger A')
    addPassenger('30000000-0000-4000-8000-00000000000b', 'Passenger B')
    addPassenger('30000000-0000-4000-8000-00000000000c', 'Passenger C')

    // Create group [A, B] with primary A.
    addGroup(GROUP_A_ID, { name: 'Group A', primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Passenger A' })
    addMember('m-1', GROUP_A_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')
    addMember('m-2', GROUP_A_ID, '30000000-0000-4000-8000-00000000000b', false, '2026-09-02T10:00:00Z')

    let groupA = groups.find((row) => row.id === GROUP_A_ID)!
    expect(groupA.member_count).toBe(2)

    // Atomic replace [A, B] -> [B, C]: emulates replace_passenger_group_members.
    members = members.filter((row) => row.group_id !== GROUP_A_ID)
    addMember('m-3', GROUP_A_ID, '30000000-0000-4000-8000-00000000000b', false, '2026-09-02T11:00:00Z')
    addMember('m-4', GROUP_A_ID, '30000000-0000-4000-8000-00000000000c', true, '2026-09-02T11:00:00Z')
    groupA = groups.find((row) => row.id === GROUP_A_ID)!
    groupA.primary_passenger_id = '30000000-0000-4000-8000-00000000000c'
    groupA.primary_passenger_name = 'Passenger C'
    groupA.member_count = members.filter((row) => row.group_id === GROUP_A_ID).length
    expect(groupA.member_count).toBe(2)

    // Remove passenger B (non-primary) through the safe-delete path.
    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000b')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    groupA = groups.find((row) => row.id === GROUP_A_ID)!
    expect(groupA.member_count).toBe(members.filter((row) => row.group_id === GROUP_A_ID).length)
    expect(groupA.member_count).toBe(1)
    expect(groupA.primary_passenger_id).toBe('30000000-0000-4000-8000-00000000000c')
  })

  it('keeps separate groups independent when a passenger is removed', async () => {
    addPassenger('30000000-0000-4000-8000-00000000000a', 'Passenger A')
    addPassenger('30000000-0000-4000-8000-00000000000b', 'Passenger B')
    addGroup(GROUP_A_ID, { name: 'Group A', primary_passenger_id: '30000000-0000-4000-8000-00000000000a', primary_passenger_name: 'Passenger A' })
    addGroup(GROUP_B_ID, { name: 'Group B', primary_passenger_id: '30000000-0000-4000-8000-00000000000b', primary_passenger_name: 'Passenger B' })
    addMember('m-1', GROUP_A_ID, '30000000-0000-4000-8000-00000000000a', true, '2026-09-02T10:00:00Z')
    addMember('m-2', GROUP_B_ID, '30000000-0000-4000-8000-00000000000b', true, '2026-09-02T10:00:00Z')

    const res = await request(createApp())
      .delete('/api/departure-passengers/30000000-0000-4000-8000-00000000000a')
      .set('x-test-org', TEST_ORG)

    expect(res.status).toBe(200)
    const groupA = groups.find((row) => row.id === GROUP_A_ID)
    const groupB = groups.find((row) => row.id === GROUP_B_ID)
    // Group A lost its only member -> removed entirely.
    expect(groupA).toBeUndefined()
    // Group B is untouched.
    expect(groupB).toBeDefined()
    expect(groupB!.member_count).toBe(1)
    expect(groupB!.primary_passenger_id).toBe('30000000-0000-4000-8000-00000000000b')
  })
})
