import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

const TEST_ORG = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG = '00000000-0000-0000-0000-000000000002'
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_DEPARTURE_ID = '10000000-0000-4000-8000-000000000002'
const PASSENGER_ONE = '30000000-0000-4000-8000-000000000001'
const PASSENGER_TWO = '30000000-0000-4000-8000-000000000002'
const PASSENGER_THREE = '30000000-0000-4000-8000-000000000003'
const ROOM_ALPHA = '40000000-0000-4000-8000-000000000001'
const ROOM_BETA = '40000000-0000-4000-8000-000000000002'
const ROOM_OTHER_DEPARTURE = '40000000-0000-4000-8000-000000000003'
const BUILDING_ID = '50000000-0000-4000-8000-000000000001'
const FLOOR_ID = '60000000-0000-4000-8000-000000000001'
const GROUP_ID = '70000000-0000-4000-8000-000000000001'

type PassengerRow = {
  id: string
  org_id: string
  departure_id: string
  full_name: string
}

type AssignmentRow = {
  passenger_id: string
  room_id: string
  org_id: string
}

type GroupRow = {
  id: string
  org_id: string
  departure_id: string
  name: string
  color: string
  accommodation_preference: string
  members: { passenger_id: string }[]
}

let passengers: PassengerRow[] = []
let assignments: AssignmentRow[] = []
let groups: GroupRow[] = []
let rpcMode: 'success' | 'capacity_conflict' = 'success'
let lastRpcAssignments: Array<{ passengerId: string; roomId: string; passengerName: string }> = []

function resetStores() {
  passengers = [
    { id: PASSENGER_ONE, org_id: TEST_ORG, departure_id: DEPARTURE_ID, full_name: 'Ada One' },
    { id: PASSENGER_TWO, org_id: TEST_ORG, departure_id: DEPARTURE_ID, full_name: 'Ada Two' },
    { id: PASSENGER_THREE, org_id: TEST_ORG, departure_id: DEPARTURE_ID, full_name: 'Solo Three' },
    { id: '30000000-0000-4000-8000-000000000099', org_id: OTHER_ORG, departure_id: DEPARTURE_ID, full_name: 'Other Org' },
  ]
  assignments = []
  groups = [
    {
      id: GROUP_ID,
      org_id: TEST_ORG,
      departure_id: DEPARTURE_ID,
      name: 'Family',
      color: '#ff9900',
      accommodation_preference: 'same_room',
      members: [{ passenger_id: PASSENGER_ONE }, { passenger_id: PASSENGER_TWO }],
    },
  ]
  rpcMode = 'success'
  lastRpcAssignments = []
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'manager@travline.app', role: 'manager' }
    next()
  },
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = (req.headers['x-test-org'] as string) || TEST_ORG
    next()
  },
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

function createSelectQuery(table: string, columns: string) {
  const filters: Record<string, unknown> = {}

  const query = {
    eq(column: string, value: unknown) {
      filters[column] = value
      return query
    },
    in(column: string, values: unknown[]) {
      filters[column] = values
      return Promise.resolve(resolve())
    },
    then(resolveThen: (value: unknown) => unknown) {
      return Promise.resolve(resolve()).then(resolveThen)
    },
  }

  function resolve() {
    if (table === 'departure_passengers') {
      return {
        data: passengers.filter((row) => {
          if (filters.org_id && row.org_id !== filters.org_id) return false
          if (filters.departure_id && row.departure_id !== filters.departure_id) return false
          return true
        }).map((row) => {
          if (columns.includes('full_name')) return row
          return { id: row.id, full_name: row.full_name }
        }),
        error: null,
      }
    }

    if (table === 'accommodation_assignments') {
      const ids = Array.isArray(filters.passenger_id) ? new Set(filters.passenger_id as string[]) : null
      return {
        data: assignments
          .filter((row) => {
            if (filters.org_id && row.org_id !== filters.org_id) return false
            if (ids && !ids.has(row.passenger_id)) return false
            return true
          })
          .map((row) => ({ passenger_id: row.passenger_id })),
        error: null,
      }
    }

    if (table === 'trip_passenger_groups') {
      return {
        data: groups.filter((row) => {
          if (filters.org_id && row.org_id !== filters.org_id) return false
          if (filters.departure_id && row.departure_id !== filters.departure_id) return false
          return true
        }),
        error: null,
      }
    }

    if (table === 'accommodation_buildings') {
      if (filters.org_id && filters.org_id !== TEST_ORG) {
        return { data: [], error: null }
      }
      if (filters.departure_id === OTHER_DEPARTURE_ID) {
        return {
          data: [
            {
              id: `${BUILDING_ID}-other`,
              name: 'Other Building',
              floors: [
                {
                  id: `${FLOOR_ID}-other`,
                  floor_number: 1,
                  label: '1',
                  rooms: [
                    {
                      id: ROOM_OTHER_DEPARTURE,
                      room_number: '99',
                      type: 'double',
                      capacity: 2,
                      assignments: [],
                    },
                  ],
                },
              ],
            },
          ],
          error: null,
        }
      }

      return {
        data: [
          {
            id: BUILDING_ID,
            name: 'Main Hotel',
            floors: [
              {
                id: FLOOR_ID,
                floor_number: 1,
                label: '1',
                rooms: [
                  {
                    id: ROOM_ALPHA,
                    room_number: '101',
                    type: 'double',
                    capacity: 2,
                    assignments: assignments.filter((row) => row.room_id === ROOM_ALPHA).map((row) => ({ id: `${row.passenger_id}-a`, passenger_id: row.passenger_id })),
                  },
                  {
                    id: ROOM_BETA,
                    room_number: '102',
                    type: 'single',
                    capacity: 1,
                    assignments: assignments.filter((row) => row.room_id === ROOM_BETA).map((row) => ({ id: `${row.passenger_id}-b`, passenger_id: row.passenger_id })),
                  },
                ],
              },
            ],
          },
        ],
        error: null,
      }
    }

    return { data: [], error: null }
  }

  return query
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => createSelectQuery(table, columns)),
    })),
    rpc: rpcMock,
  },
  supabase: {},
  handleSupabaseError: (res: Response, err: { code?: string; message?: string }, message: string) =>
    res.status(500).json({ code: err?.code || 'DATABASE_ERROR', message: err?.message || message }),
}))

import roomingRouter from '../routes/rooming'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', roomingRouter)
  return app
}

describe('rooming apply route', () => {
  beforeEach(() => {
    resetStores()
    rpcMock.mockReset()
    rpcMock.mockImplementation(async (_fn: string, args: { p_org_id: string; p_assignments: Array<{ passengerId: string; roomId: string; passengerName: string }> }) => {
      lastRpcAssignments = args.p_assignments
      if (rpcMode === 'capacity_conflict') {
        return { data: null, error: { message: 'Room capacity exceeded' } }
      }
      assignments = [
        ...assignments,
        ...args.p_assignments.map((item) => ({
          passenger_id: item.passengerId,
          room_id: item.roomId,
          org_id: args.p_org_id,
        })),
      ]
      return { data: [{ applied_count: args.p_assignments.length, error_detail: null }], error: null }
    })
  })

  it('applies a valid reviewed proposal using canonical passenger IDs', async () => {
    const proposalAssignments = [
      { passengerId: PASSENGER_ONE, roomId: ROOM_ALPHA },
      { passengerId: PASSENGER_TWO, roomId: ROOM_ALPHA },
      { passengerId: PASSENGER_THREE, roomId: ROOM_BETA },
    ]

    const res = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-org', TEST_ORG)
      .send({
        assignmentIds: proposalAssignments.map((item) => item.passengerId),
        proposalAssignments,
      })

    expect(res.status).toBe(200)
    expect(res.body.applied).toBe(3)
    expect(lastRpcAssignments.map((item) => item.passengerId)).toEqual([
      PASSENGER_ONE,
      PASSENGER_TWO,
      PASSENGER_THREE,
    ])
    expect(assignments).toHaveLength(3)
  })

  it('rejects a stale proposal when the reviewed room mapping no longer matches current state', async () => {
    const res = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-org', TEST_ORG)
      .send({
        assignmentIds: [PASSENGER_THREE],
        proposalAssignments: [{ passengerId: PASSENGER_THREE, roomId: ROOM_ALPHA }],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('STALE_PROPOSAL')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(assignments).toHaveLength(0)
  })

  it('rejects capacity conflicts without partially applying assignments', async () => {
    rpcMode = 'capacity_conflict'

    const res = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-org', TEST_ORG)
      .send({
        assignmentIds: [PASSENGER_ONE, PASSENGER_TWO, PASSENGER_THREE],
        proposalAssignments: [
          { passengerId: PASSENGER_ONE, roomId: ROOM_ALPHA },
          { passengerId: PASSENGER_TWO, roomId: ROOM_ALPHA },
          { passengerId: PASSENGER_THREE, roomId: ROOM_BETA },
        ],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CONFLICT')
    expect(assignments).toHaveLength(0)
  })

  it('rejects cross-departure or cross-org proposal payloads', async () => {
    const res = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-org', TEST_ORG)
      .send({
        assignmentIds: [PASSENGER_ONE, '30000000-0000-4000-8000-000000000099'],
        proposalAssignments: [
          { passengerId: PASSENGER_ONE, roomId: ROOM_ALPHA },
          { passengerId: '30000000-0000-4000-8000-000000000099', roomId: ROOM_OTHER_DEPARTURE },
        ],
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('STALE_PROPOSAL')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('preserves the group-aware reviewed proposal result for same-room groups', async () => {
    const proposalRes = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/proposal`)
      .set('x-test-org', TEST_ORG)
      .send({})

    expect(proposalRes.status).toBe(200)
    const groupedAssignments = proposalRes.body.assignments.filter((item: { passengerId: string }) =>
      [PASSENGER_ONE, PASSENGER_TWO].includes(item.passengerId),
    )

    expect(new Set(groupedAssignments.map((item: { roomId: string }) => item.roomId)).size).toBe(1)

    const applyRes = await request(createApp())
      .post(`/api/departures/${DEPARTURE_ID}/rooming/apply`)
      .set('x-test-org', TEST_ORG)
      .send({
        assignmentIds: groupedAssignments.map((item: { passengerId: string }) => item.passengerId),
        proposalAssignments: groupedAssignments.map((item: { passengerId: string; roomId: string }) => ({
          passengerId: item.passengerId,
          roomId: item.roomId,
        })),
      })

    expect(applyRes.status).toBe(200)
    expect(lastRpcAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ passengerId: PASSENGER_ONE, roomId: ROOM_ALPHA }),
        expect.objectContaining({ passengerId: PASSENGER_TWO, roomId: ROOM_ALPHA }),
      ]),
    )
  })
})
