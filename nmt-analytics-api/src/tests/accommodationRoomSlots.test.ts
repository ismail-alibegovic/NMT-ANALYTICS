import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const ORG_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000002'
const DEPARTURE_ID = '10000000-0000-4000-8000-000000000001'
const SLOT_ID = '20000000-0000-4000-8000-000000000001'
const TARGET_SLOT_ID = '20000000-0000-4000-8000-000000000002'
const OTHER_SLOT_ID = '20000000-0000-4000-8000-000000000003'
const PASSENGER_ID = '30000000-0000-4000-8000-000000000001'
const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001'

let slots: Record<string, any>[] = []
let assignments: Record<string, any>[] = []
let passengers: Record<string, any>[] = []
let insertPayload: Record<string, any> | null = null
let lockAssignmentBeforeUpdate = false
let lockAssignmentBeforeDelete = false

function matches(row: Record<string, any>, eqs: any[] = []) {
  for (let i = 0; i < eqs.length; i += 2) {
    if (row[eqs[i]] !== eqs[i + 1]) return false
  }
  return true
}

function slotWithAssignments(slot: Record<string, any>) {
  return {
    ...slot,
    assignments: assignments.filter((assignment) => assignment.room_slot_id === slot.id),
    hotels: { id: slot.hotel_id, name: 'Hotel Test', destination: 'Test', stars: 4 },
  }
}

function makeQuery(table: string) {
  const q: any = {
    _eqs: [] as any[],
    _order: [] as any[],
    select: () => q,
    eq: (col: string, val: any) => {
      q._eqs.push(col, val)
      return q
    },
    order: () => q,
    insert: (payload: any) => {
      q._insertPayload = payload
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
    maybeSingle: async () => {
      if (table === 'departures') {
        return { data: matches({ id: DEPARTURE_ID, org_id: ORG_ID }, q._eqs) ? { id: DEPARTURE_ID } : null, error: null }
      }
      if (table === 'departure_room_slots') {
        if (q._updatePayload) {
          const slot = slots.find((row) => matches(row, q._eqs))
          if (!slot) return { data: null, error: null }
          slot.actual_hotel_room_number = q._updatePayload.actual_hotel_room_number
          return { data: slotWithAssignments(slot), error: null }
        }
        const slot = slots.find((row) => matches(row, q._eqs))
        return { data: slot ? slotWithAssignments(slot) : null, error: null }
      }
      if (table === 'departure_passengers') {
        return { data: passengers.find((row) => matches(row, q._eqs)) || null, error: null }
      }
      if (table === 'reservation_accommodation_requirements') {
        return { data: null, error: null }
      }
      if (table === 'departure_room_slot_assignments') {
        if (q._delete) {
          if (lockAssignmentBeforeDelete) {
            const current = assignments.find((row) => row.id === ASSIGNMENT_ID)
            if (current) current.locked = true
            lockAssignmentBeforeDelete = false
          }
          const assignment = assignments.find((row) => matches(row, q._eqs))
          if (!assignment) return { data: null, error: null }
          assignments = assignments.filter((row) => row.id !== assignment.id)
          return { data: { id: assignment.id }, error: null }
        }
        if (q._updatePayload) {
          if (lockAssignmentBeforeUpdate) {
            const current = assignments.find((row) => row.id === ASSIGNMENT_ID)
            if (current) current.locked = true
            lockAssignmentBeforeUpdate = false
          }
          const assignment = assignments.find((row) => matches(row, q._eqs))
          if (!assignment) return { data: null, error: null }
          Object.assign(assignment, q._updatePayload)
          return { data: assignment, error: null }
        }
        return { data: assignments.find((row) => matches(row, q._eqs)) || null, error: null }
      }
      return { data: null, error: null }
    },
    single: async () => {
      if (table === 'departure_room_slot_assignments' && q._insertPayload) {
        insertPayload = q._insertPayload
        const assignment = { id: ASSIGNMENT_ID, created_at: '2026-09-02T00:00:00Z', ...q._insertPayload }
        assignments.push(assignment)
        return { data: assignment, error: null }
      }
      if (table === 'departure_room_slot_assignments' && q._updatePayload) {
        const assignment = assignments.find((row) => matches(row, q._eqs))
        if (!assignment) return { data: null, error: null }
        Object.assign(assignment, q._updatePayload)
        return { data: assignment, error: null }
      }
      return q.maybeSingle()
    },
  }

  q.then = (resolve: (value: any) => void) => {
    if (table === 'departure_room_slots') {
      return resolve({ data: slots.filter((row) => matches(row, q._eqs)).map(slotWithAssignments), error: null })
    }
    if (table === 'reservation_accommodation_requirements') {
      return resolve({ data: [], error: null })
    }
    if (table === 'departure_room_slot_assignments' && q._delete) {
      assignments = assignments.filter((row) => !matches(row, q._eqs))
      return resolve({ data: [], error: null })
    }
    return resolve({ data: [], error: null })
  }

  return q
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => makeQuery(table),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
  handleSupabaseError: (res: Response, error: any, fallback: string) =>
    res.status(500).json({ code: error?.code || 'DB_ERROR', message: error?.message || fallback }),
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: 'user-1', role: 'manager' }
    next()
  },
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).orgId = req.headers['x-org-id'] || ORG_ID
    next()
  },
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

async function buildApp() {
  const mod = await import('../routes/accommodation')
  const app = express()
  app.use(express.json())
  app.use('/api', mod.default)
  return app
}

describe('room slot assignment lock semantics', () => {
  beforeEach(() => {
    insertPayload = null
    lockAssignmentBeforeUpdate = false
    lockAssignmentBeforeDelete = false
    slots = [
      { id: SLOT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, hotel_allocation_id: 'allocation-1', hotel_id: 'hotel-1', room_type: 'double', slot_number: 1, display_label: 'Double 01', capacity: 2, actual_hotel_room_number: null },
      { id: TARGET_SLOT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, hotel_allocation_id: 'allocation-1', hotel_id: 'hotel-1', room_type: 'double', slot_number: 2, display_label: 'Double 02', capacity: 2, actual_hotel_room_number: null },
      { id: OTHER_SLOT_ID, org_id: OTHER_ORG_ID, departure_id: DEPARTURE_ID, hotel_allocation_id: 'allocation-1', hotel_id: 'hotel-1', room_type: 'double', slot_number: 3, display_label: 'Double 03', capacity: 2, actual_hotel_room_number: null },
    ]
    assignments = []
    passengers = [
      { id: PASSENGER_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, reservation_id: 'reservation-1', full_name: 'Passenger One', reservation_accommodation_requirement_id: null },
    ]
  })

  it('persists manual unlocked metadata and exposes it in room-slot output', async () => {
    const app = await buildApp()
    const assign = await request(app).post(`/api/room-slots/${SLOT_ID}/assign`).send({ passengerId: PASSENGER_ID })

    expect(assign.status).toBe(201)
    expect(insertPayload).toEqual(expect.objectContaining({ is_manual: true, locked: false }))

    const slotsResponse = await request(app).get(`/api/departures/${DEPARTURE_ID}/room-slots`)
    expect(slotsResponse.status).toBe(200)
    expect(slotsResponse.body.slots[0].assignments[0]).toEqual(expect.objectContaining({ isManual: true, locked: false }))
  })

  it('locks and unlocks assignments through a narrow endpoint', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: false }]
    const app = await buildApp()

    const locked = await request(app).patch(`/api/room-slot-assignments/${ASSIGNMENT_ID}/lock`).send({ locked: true })
    expect(locked.status).toBe(200)
    expect(locked.body.locked).toBe(true)
    expect(assignments[0].locked).toBe(true)

    const unlocked = await request(app).patch(`/api/room-slot-assignments/${ASSIGNMENT_ID}/lock`).send({ locked: false })
    expect(unlocked.status).toBe(200)
    expect(unlocked.body.locked).toBe(false)
  })

  it('does not lock cross-org assignments', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: false }]
    const app = await buildApp()
    const res = await request(app).patch(`/api/room-slot-assignments/${ASSIGNMENT_ID}/lock`).set('x-org-id', OTHER_ORG_ID).send({ locked: true })

    expect(res.status).toBe(404)
    expect(assignments[0].locked).toBe(false)
  })

  it('rejects moving and deleting locked assignments without mutation', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: true }]
    const app = await buildApp()

    const move = await request(app).post(`/api/room-slot-assignments/${ASSIGNMENT_ID}/move`).send({ targetSlotId: TARGET_SLOT_ID })
    expect(move.status).toBe(409)
    expect(move.body.code).toBe('ROOM_ASSIGNMENT_LOCKED')
    expect(assignments[0].room_slot_id).toBe(SLOT_ID)

    const del = await request(app).delete(`/api/room-slot-assignments/${ASSIGNMENT_ID}`)
    expect(del.status).toBe(409)
    expect(del.body.code).toBe('ROOM_ASSIGNMENT_LOCKED')
    expect(assignments).toHaveLength(1)
  })

  it('allows move and unassign after unlock', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: false }]
    const app = await buildApp()

    const move = await request(app).post(`/api/room-slot-assignments/${ASSIGNMENT_ID}/move`).send({ targetSlotId: TARGET_SLOT_ID })
    expect(move.status).toBe(200)
    expect(assignments[0].room_slot_id).toBe(TARGET_SLOT_ID)

    const del = await request(app).delete(`/api/room-slot-assignments/${ASSIGNMENT_ID}`)
    expect(del.status).toBe(204)
    expect(assignments).toHaveLength(0)
  })

  it('rejects move when assignment becomes locked before the guarded update', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: false }]
    lockAssignmentBeforeUpdate = true
    const app = await buildApp()

    const move = await request(app).post(`/api/room-slot-assignments/${ASSIGNMENT_ID}/move`).send({ targetSlotId: TARGET_SLOT_ID })

    expect(move.status).toBe(409)
    expect(move.body.code).toBe('ROOM_ASSIGNMENT_LOCKED')
    expect(assignments[0].room_slot_id).toBe(SLOT_ID)
    expect(assignments[0].locked).toBe(true)
  })

  it('rejects unassign when assignment becomes locked before the guarded delete', async () => {
    assignments = [{ id: ASSIGNMENT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, room_slot_id: SLOT_ID, passenger_id: PASSENGER_ID, reservation_id: 'reservation-1', passenger_name: 'Passenger One', is_manual: true, locked: false }]
    lockAssignmentBeforeDelete = true
    const app = await buildApp()

    const del = await request(app).delete(`/api/room-slot-assignments/${ASSIGNMENT_ID}`)

    expect(del.status).toBe(409)
    expect(del.body.code).toBe('ROOM_ASSIGNMENT_LOCKED')
    expect(assignments).toHaveLength(1)
    expect(assignments[0].locked).toBe(true)
  })
})

describe('room slot physical hotel room number', () => {
  beforeEach(() => {
    slots = [
      { id: SLOT_ID, org_id: ORG_ID, departure_id: DEPARTURE_ID, hotel_allocation_id: 'allocation-1', hotel_id: 'hotel-1', room_type: 'double', slot_number: 1, display_label: 'Double 01', capacity: 2, actual_hotel_room_number: null },
      { id: OTHER_SLOT_ID, org_id: OTHER_ORG_ID, departure_id: DEPARTURE_ID, hotel_allocation_id: 'allocation-1', hotel_id: 'hotel-1', room_type: 'double', slot_number: 3, display_label: 'Double 03', capacity: 2, actual_hotel_room_number: null },
    ]
    assignments = []
    passengers = []
  })

  it('sets, changes and clears actualHotelRoomNumber only', async () => {
    const app = await buildApp()

    const set = await request(app).patch(`/api/room-slots/${SLOT_ID}`).send({ actualHotelRoomNumber: ' 214 ' })
    expect(set.status).toBe(200)
    expect(set.body.actualHotelRoomNumber).toBe('214')
    expect(set.body.capacity).toBe(2)
    expect(slots[0].room_type).toBe('double')

    const changed = await request(app).patch(`/api/room-slots/${SLOT_ID}`).send({ actualHotelRoomNumber: 'A-12' })
    expect(changed.body.actualHotelRoomNumber).toBe('A-12')

    const cleared = await request(app).patch(`/api/room-slots/${SLOT_ID}`).send({ actualHotelRoomNumber: '' })
    expect(cleared.body.actualHotelRoomNumber).toBeNull()
  })

  it('does not update cross-org room slots', async () => {
    const app = await buildApp()
    const res = await request(app).patch(`/api/room-slots/${SLOT_ID}`).set('x-org-id', OTHER_ORG_ID).send({ actualHotelRoomNumber: '999' })

    expect(res.status).toBe(404)
    expect(slots[0].actual_hotel_room_number).toBeNull()
  })

  it('rejects payloads without actualHotelRoomNumber without mutating the slot', async () => {
    slots[0].actual_hotel_room_number = '214'
    const app = await buildApp()

    const res = await request(app).patch(`/api/room-slots/${SLOT_ID}`).send({ capacity: 99 })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(slots[0].actual_hotel_room_number).toBe('214')
    expect(slots[0].capacity).toBe(2)
  })
})
