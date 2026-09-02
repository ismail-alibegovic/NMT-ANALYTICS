import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { logAuditEntry } from '../middleware/auditLogger';
import { z } from 'zod';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const createBuildingSchema = z.object({
  departureId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['hotel','hostel','dormitory','apartment','other']).default('hotel'),
  address: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional().nullable(),
  floors: z.array(z.object({
    floorNumber: z.number().int().min(0),
    label: z.string().optional(),
    rooms: z.array(z.object({
      roomNumber: z.string().min(1),
      type: z.enum(['single','double','triple','quadruple','custom']).default('double'),
      capacity: z.number().int().min(1).default(2),
      beds: z.array(z.object({
        label: z.string(),
        assignedPassengerId: z.string().uuid().nullable().optional(),
      })).optional(),
      notes: z.string().optional().nullable(),
    })).default([]),
  })).default([]),
});

const createRoomSchema = z.object({
  floorId: z.string().uuid(),
  buildingId: z.string().uuid(),
  roomNumber: z.string().min(1),
  type: z.enum(['single','double','triple','quadruple','custom']).default('double'),
  capacity: z.number().int().min(1).default(2),
  beds: z.array(z.object({
    label: z.string(),
    assignedPassengerId: z.string().uuid().nullable().optional(),
  })).optional(),
  notes: z.string().optional().nullable(),
});

const assignPassengerSchema = z.object({
  roomId: z.string().uuid(),
  passengerId: z.string().uuid(),
  passengerName: z.string().min(1).optional(),
  reservationId: z.string().uuid().optional(),
  bedLabel: z.string().optional().nullable(),
});

const assignSlotSchema = z.object({
  passengerId: z.string().uuid(),
});

const moveSlotSchema = z.object({
  targetSlotId: z.string().uuid(),
});

const lockAssignmentSchema = z.object({
  locked: z.boolean(),
});

const updateRoomSlotSchema = z.object({
  actualHotelRoomNumber: z.string().max(100).nullable(),
}).strict();

function roomSlotOut(slot: any) {
  const assignments = slot.assignments || [];
  return {
    id: slot.id,
    departureId: slot.departure_id,
    hotelAllocationId: slot.hotel_allocation_id,
    hotelId: slot.hotel_id,
    roomType: slot.room_type,
    slotNumber: slot.slot_number,
    displayLabel: slot.display_label,
    capacity: Number(slot.capacity || 0),
    actualHotelRoomNumber: slot.actual_hotel_room_number || null,
    notes: slot.notes || null,
    hotel: slot.hotels ? {
      id: slot.hotels.id,
      name: slot.hotels.name,
      destination: slot.hotels.destination || null,
      stars: slot.hotels.stars ?? null,
    } : null,
    assignments: assignments.map((a: any) => ({
      id: a.id,
      passengerId: a.passenger_id,
      reservationId: a.reservation_id,
      passengerName: a.passenger_name,
      isManual: a.is_manual ?? true,
      locked: a.locked ?? false,
      createdAt: a.created_at,
    })),
  };
}

async function loadSlot(orgId: string, slotId: string) {
  const { data, error } = await supabaseAdmin
    .from('departure_room_slots')
    .select('*, assignments:departure_room_slot_assignments(*), hotels:hotel_id(id, name, destination, stars)')
    .eq('id', slotId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function roomAssignmentOut(assignment: any) {
  return {
    id: assignment.id,
    passengerId: assignment.passenger_id,
    reservationId: assignment.reservation_id,
    passengerName: assignment.passenger_name,
    isManual: assignment.is_manual ?? true,
    locked: assignment.locked ?? false,
    createdAt: assignment.created_at,
  };
}

function roomAssignmentLocked(res: Response) {
  return apiError(res, 409, 'ROOM_ASSIGNMENT_LOCKED', 'Unlock the room assignment before changing it.');
}

async function loadAssignmentLockState(orgId: string, assignmentId: string) {
  const { data, error } = await supabaseAdmin
    .from('departure_room_slot_assignments')
    .select('id, locked')
    .eq('id', assignmentId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type SlotPassengerValidation =
  | { ok: true; passenger: any }
  | { ok: false; error: { status: number; code: string; message: string } };

async function validateSlotPassengerCompatibility(orgId: string, slot: any, passengerId: string): Promise<SlotPassengerValidation> {
  const { data: passenger, error: passengerErr } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, reservation_id, full_name, departure_id, reservation_accommodation_requirement_id')
    .eq('id', passengerId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (passengerErr) throw passengerErr;
  if (!passenger) return { ok: false, error: { status: 404, code: 'PASSENGER_NOT_FOUND', message: 'Passenger not found' } };
  if (passenger.departure_id !== slot.departure_id) {
    return { ok: false, error: { status: 409, code: 'CROSS_DEPARTURE', message: 'Passenger does not belong to this departure' } };
  }

  if (!passenger.reservation_accommodation_requirement_id) {
    const { data: reservationRequirements, error: reservationRequirementsErr } = await supabaseAdmin
      .from('reservation_accommodation_requirements')
      .select('id')
      .eq('org_id', orgId)
      .eq('reservation_id', passenger.reservation_id);
    if (reservationRequirementsErr) throw reservationRequirementsErr;
    if ((reservationRequirements || []).length > 0) {
      return { ok: false, error: { status: 409, code: 'PASSENGER_REQUIREMENT_UNASSIGNED', message: 'Passenger must be mapped to a reservation accommodation requirement before rooming' } };
    }
    return { ok: true, passenger };
  }

  const { data: requirement, error: requirementErr } = await supabaseAdmin
    .from('reservation_accommodation_requirements')
    .select('id, hotel_id, hotel_allocation_id, room_type')
    .eq('org_id', orgId)
    .eq('id', passenger.reservation_accommodation_requirement_id)
    .maybeSingle();
  if (requirementErr) throw requirementErr;
  if (!requirement) {
    return { ok: false, error: { status: 404, code: 'ACCOMMODATION_REQUIREMENT_NOT_FOUND', message: 'Passenger accommodation requirement not found' } };
  }
  if (
    requirement.hotel_id !== slot.hotel_id ||
    requirement.hotel_allocation_id !== slot.hotel_allocation_id ||
    requirement.room_type !== slot.room_type
  ) {
    return { ok: false, error: { status: 409, code: 'ROOM_REQUIREMENT_MISMATCH', message: 'Passenger accommodation requirement does not match this room slot' } };
  }

  return { ok: true, passenger };
}

// ─── GET /api/departures/:departureId/room-slots ──────────

router.get(
  '/departures/:departureId/room-slots',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { data: departure, error: departureErr } = await supabaseAdmin
        .from('departures')
        .select('id')
        .eq('id', departureId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (departureErr) return handleSupabaseError(res, departureErr, 'Failed to load departure');
      if (!departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

      const { error: syncError } = await supabaseAdmin.rpc('sync_departure_room_slots_atomic', {
        p_org_id: orgId,
        p_departure_id: departureId,
        p_hotel_allocation_id: null,
      });
      if (syncError) return handleSupabaseError(res, syncError, 'Failed to sync room slots');

      const { data, error } = await supabaseAdmin
        .from('departure_room_slots')
        .select('*, assignments:departure_room_slot_assignments(*), hotels:hotel_id(id, name, destination, stars)')
        .eq('org_id', orgId)
        .eq('departure_id', departureId)
        .order('hotel_id', { ascending: true })
        .order('room_type', { ascending: true })
        .order('slot_number', { ascending: true });

      if (error) return handleSupabaseError(res, error, 'Failed to load room slots');
      return res.json({ departureId, slots: (data || []).map(roomSlotOut) });
    } catch (err) {
      console.error('GET /departures/:departureId/room-slots:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

router.post(
  '/room-slots/:slotId/assign',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const parsed = assignSlotSchema.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
      const orgId = req.orgId!;
      const slot = await loadSlot(orgId, req.params.slotId);
      if (!slot) return apiError(res, 404, 'ROOM_SLOT_NOT_FOUND', 'Room slot not found');
      if ((slot.assignments || []).length >= Number(slot.capacity || 0)) {
        return apiError(res, 409, 'ROOM_SLOT_FULL', 'Room slot is full');
      }
      const validation = await validateSlotPassengerCompatibility(orgId, slot, parsed.data.passengerId);
      if (!validation.ok) return apiError(res, validation.error.status, validation.error.code, validation.error.message);

      const { data, error } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .insert({
          org_id: orgId,
          departure_id: slot.departure_id,
          room_slot_id: slot.id,
          passenger_id: validation.passenger.id,
          reservation_id: validation.passenger.reservation_id,
          passenger_name: validation.passenger.full_name,
          is_manual: true,
          locked: false,
          assigned_by: req.user?.id || null,
        })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return apiError(res, 409, 'DUPLICATE_ASSIGNMENT', 'Passenger is already assigned to a room slot');
        return handleSupabaseError(res, error, 'Failed to assign passenger');
      }
      return res.status(201).json(data);
    } catch (err) {
      console.error('POST /room-slots/:slotId/assign:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

router.delete(
  '/room-slot-assignments/:assignmentId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { data: assignment, error: loadErr } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .select('id, locked')
        .eq('id', req.params.assignmentId)
        .eq('org_id', req.orgId!)
        .maybeSingle();
      if (loadErr) return handleSupabaseError(res, loadErr, 'Failed to load room slot assignment');
      if (!assignment) return apiError(res, 404, 'NOT_FOUND', 'Room slot assignment not found');
      if (assignment.locked) return roomAssignmentLocked(res);

      const { data: deletedAssignment, error } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .delete()
        .eq('id', req.params.assignmentId)
        .eq('org_id', req.orgId!)
        .eq('locked', false)
        .select('id')
        .maybeSingle();
      if (error) return handleSupabaseError(res, error, 'Failed to unassign passenger');
      if (!deletedAssignment) {
        const currentAssignment = await loadAssignmentLockState(req.orgId!, req.params.assignmentId);
        if (currentAssignment?.locked) return roomAssignmentLocked(res);
        return apiError(res, 404, 'NOT_FOUND', 'Room slot assignment not found');
      }
      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /room-slot-assignments/:assignmentId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

router.post(
  '/room-slot-assignments/:assignmentId/move',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const parsed = moveSlotSchema.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
      const orgId = req.orgId!;

      const { data: assignment, error: assignmentErr } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .select('id, passenger_id, departure_id, locked')
        .eq('id', req.params.assignmentId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (assignmentErr) return handleSupabaseError(res, assignmentErr, 'Failed to load assignment');
      if (!assignment) return apiError(res, 404, 'NOT_FOUND', 'Room slot assignment not found');
      if (assignment.locked) return roomAssignmentLocked(res);

      const slot = await loadSlot(orgId, parsed.data.targetSlotId);
      if (!slot) return apiError(res, 404, 'ROOM_SLOT_NOT_FOUND', 'Room slot not found');
      if (slot.departure_id !== assignment.departure_id) {
        return apiError(res, 409, 'CROSS_DEPARTURE', 'Target room slot is in a different departure');
      }
      if ((slot.assignments || []).length >= Number(slot.capacity || 0)) {
        return apiError(res, 409, 'ROOM_SLOT_FULL', 'Room slot is full');
      }
      const validation = await validateSlotPassengerCompatibility(orgId, slot, assignment.passenger_id);
      if (!validation.ok) return apiError(res, validation.error.status, validation.error.code, validation.error.message);

      const { data, error } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .update({ room_slot_id: slot.id })
        .eq('id', assignment.id)
        .eq('org_id', orgId)
        .eq('locked', false)
        .select()
        .maybeSingle();
      if (error) return handleSupabaseError(res, error, 'Failed to move passenger');
      if (!data) {
        const currentAssignment = await loadAssignmentLockState(orgId, assignment.id);
        if (currentAssignment?.locked) return roomAssignmentLocked(res);
        return apiError(res, 404, 'NOT_FOUND', 'Room slot assignment not found');
      }
      return res.json(data);
    } catch (err) {
      console.error('POST /room-slot-assignments/:assignmentId/move:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

router.patch(
  '/room-slot-assignments/:assignmentId/lock',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const parsed = lockAssignmentSchema.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
      const { data, error } = await supabaseAdmin
        .from('departure_room_slot_assignments')
        .update({ locked: parsed.data.locked })
        .eq('id', req.params.assignmentId)
        .eq('org_id', req.orgId!)
        .select()
        .maybeSingle();
      if (error) return handleSupabaseError(res, error, 'Failed to update room assignment lock');
      if (!data) return apiError(res, 404, 'NOT_FOUND', 'Room slot assignment not found');
      return res.json(roomAssignmentOut(data));
    } catch (err) {
      console.error('PATCH /room-slot-assignments/:assignmentId/lock:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

router.patch(
  '/room-slots/:slotId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const parsed = updateRoomSlotSchema.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
      const rawNumber = parsed.data.actualHotelRoomNumber;
      const actualHotelRoomNumber = typeof rawNumber === 'string'
        ? rawNumber.trim() || null
        : null;

      const { data, error } = await supabaseAdmin
        .from('departure_room_slots')
        .update({ actual_hotel_room_number: actualHotelRoomNumber })
        .eq('id', req.params.slotId)
        .eq('org_id', req.orgId!)
        .select('*, assignments:departure_room_slot_assignments(*), hotels:hotel_id(id, name, destination, stars)')
        .maybeSingle();
      if (error) return handleSupabaseError(res, error, 'Failed to update room slot');
      if (!data) return apiError(res, 404, 'ROOM_SLOT_NOT_FOUND', 'Room slot not found');
      return res.json(roomSlotOut(data));
    } catch (err) {
      console.error('PATCH /room-slots/:slotId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── GET /api/departures/:departureId/accommodation ──────────

router.get(
  '/departures/:departureId/accommodation',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { data: buildings, error } = await supabaseAdmin
        .from('accommodation_buildings')
        .select(`
          *,
          floors:accommodation_floors!accommodation_floors_building_id_fkey(
            *,
            rooms:accommodation_rooms!accommodation_rooms_floor_id_fkey(
              *,
              assignments:accommodation_assignments!accommodation_assignments_room_id_fkey(*)
            )
          )
        `)
        .eq('org_id', orgId)
        .eq('departure_id', departureId)
        .order('created_at');

      if (error) return handleSupabaseError(res, error, 'Failed to fetch accommodation');
      return res.json(buildings || []);
    } catch (err) {
      console.error('GET /departures/:departureId/accommodation:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── POST /api/departures/:departureId/accommodation/buildings ──────────

router.post(
  '/departures/:departureId/accommodation/buildings',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;
      const r = createBuildingSchema.safeParse({ ...req.body, departureId });
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { name, type, address, contact, notes, floors } = r.data;

      const { data: building, error: bErr } = await supabaseAdmin
        .from('accommodation_buildings')
        .insert({ org_id: orgId, departure_id: departureId, name, type, address, contact, notes })
        .select().single();

      if (bErr) return handleSupabaseError(res, bErr, 'Failed to create building');

      for (const floor of floors) {
        const { data: fRow, error: fErr } = await supabaseAdmin
          .from('accommodation_floors')
          .insert({
            building_id: building.id,
            org_id: orgId,
            floor_number: floor.floorNumber,
            label: floor.label || null,
          })
          .select().single();

        if (fErr) continue;

        for (const room of floor.rooms) {
          await supabaseAdmin.from('accommodation_rooms').insert({
            floor_id: fRow.id,
            building_id: building.id,
            org_id: orgId,
            room_number: room.roomNumber,
            type: room.type,
            capacity: room.capacity,
            beds: room.beds || null,
            notes: room.notes || null,
          });
        }
      }

      return res.status(201).json(building);
    } catch (err) {
      console.error('POST /departures/:departureId/accommodation/buildings:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── POST /api/accommodation/buildings/:buildingId/floors/:floorId/rooms ──────────

router.post(
  '/accommodation/buildings/:buildingId/floors/:floorId/rooms',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { buildingId, floorId } = req.params;
      const orgId = req.orgId!;
      const r = createRoomSchema.safeParse({ ...req.body, floorId, buildingId });
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { roomNumber, type, capacity, beds, notes } = r.data;

      const { data, error } = await supabaseAdmin
        .from('accommodation_rooms')
        .insert({
          floor_id: floorId,
          building_id: buildingId,
          org_id: orgId,
          room_number: roomNumber,
          type,
          capacity,
          beds: beds || null,
          notes: notes || null,
        })
        .select().single();

      if (error) return handleSupabaseError(res, error, 'Failed to create room');
      return res.status(201).json(data);
    } catch (err) {
      console.error('POST .../rooms:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── DELETE /api/accommodation/rooms/:roomId ──────────

router.delete(
  '/accommodation/rooms/:roomId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { roomId } = req.params;
      const orgId = req.orgId!;
      const { error } = await supabaseAdmin
        .from('accommodation_rooms')
        .delete()
        .eq('id', roomId)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to delete room');
      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /accommodation/rooms/:roomId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── POST /api/accommodation/rooms/:roomId/assign ──────────

router.post(
  '/accommodation/rooms/:roomId/assign',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { roomId } = req.params;
      const orgId = req.orgId!;
      const r = assignPassengerSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { passengerId, bedLabel } = r.data;

      // Load canonical passenger identity
      const { data: passenger, error: paxErr } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, reservation_id, full_name, departure_id')
        .eq('id', passengerId)
        .eq('org_id', orgId)
        .single();

      if (paxErr || !passenger) {
        return apiError(res, 404, 'PASSENGER_NOT_FOUND', 'Canonical passenger not found');
      }

      // Load room with floor→building chain to verify departure_id
      const { data: room, error: roomErr } = await supabaseAdmin
        .from('accommodation_rooms')
        .select('id, capacity, beds, floor_id, building_id, accommodation_floors!accommodation_rooms_floor_id_fkey!inner(building_id, accommodation_buildings!accommodation_floors_building_id_fkey!inner(id, departure_id))')
        .eq('id', roomId)
        .eq('org_id', orgId)
        .single();

      if (roomErr || !room) {
        return apiError(res, 404, 'NOT_FOUND', 'Room not found');
      }

      const floor = (room as any).accommodation_floors;
      const building = floor?.accommodation_buildings;
      const buildingDepartureId = building?.departure_id;

      // Cross-departure validation
      if (buildingDepartureId !== passenger.departure_id) {
        return apiError(res, 409, 'CROSS_DEPARTURE', 'Passenger does not belong to this departure');
      }

      // Bed validation
      if (bedLabel && room.beds) {
        const beds = room.beds as any[];
        const bed = beds.find((b: any) => b.label === bedLabel);
        if (!bed) return apiError(res, 400, 'INVALID_BED', `Bed "${bedLabel}" not found`);
        if (bed.assignedPassengerId) {
          return apiError(res, 409, 'BED_OCCUPIED', `Bed "${bedLabel}" already occupied`);
        }
      }

      // Atomic assignment via RPC
      const assignParams: any = {
        p_assignment_id: undefined,
        p_org_id: orgId,
        p_room_id: roomId,
        p_passenger_id: passengerId,
        p_passenger_name: passenger.full_name,
        p_reservation_id: passenger.reservation_id,
        p_bed_label: bedLabel || null,
        p_assigned_by: req.user?.id,
      };


      const { data: assignment, error } = await supabaseAdmin
        .from('accommodation_assignments')
        .insert({
          org_id: orgId,
          room_id: roomId,
          passenger_id: passengerId,
          reservation_id: passenger.reservation_id,
          passenger_name: passenger.full_name,
          bed_label: bedLabel || null,
          assigned_by: req.user?.id,
        })
        .select().single();

      if (error) {
        // Check for unique violation on passenger_id
        if (error.code === '23505') {
          return apiError(res, 409, 'DUPLICATE_ASSIGNMENT', 'Passenger already has an accommodation assignment');
        }
        return handleSupabaseError(res, error, 'Failed to assign passenger');
      }


      return res.status(201).json(assignment);
    } catch (err) {
      console.error('POST /accommodation/rooms/:roomId/assign:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── DELETE /api/accommodation/assignments/:assignmentId ──────────

router.delete(
  '/accommodation/assignments/:assignmentId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { assignmentId } = req.params;
      const orgId = req.orgId!;

      const { data: assignment } = await supabaseAdmin
        .from('accommodation_assignments')
        .select('id, room_id, bed_label, passenger_id, passenger_name, reservation_id')
        .eq('id', assignmentId)
        .eq('org_id', orgId)
        .single();

      if (!assignment) {
        return apiError(res, 404, 'NOT_FOUND', 'Accommodation assignment not found');
      }

      const { error } = await supabaseAdmin
        .from('accommodation_assignments')
        .delete()
        .eq('id', assignmentId)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to remove assignment');

      logAuditEntry({
        org_id: orgId,
        user_id: req.user?.id || 'system',
        action: 'DELETE',
        entity: 'accommodation_assignment',
        entity_id: assignmentId,
        metadata: {
          passenger_id: assignment.passenger_id,
          passenger_name: assignment.passenger_name,
          room_id: assignment.room_id,
          reservation_id: assignment.reservation_id,
        },
      });

      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /accommodation/assignments/:assignmentId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// ─── POST /api/accommodation/assignments/:assignmentId/move ──────────

router.post(
  '/accommodation/assignments/:assignmentId/move',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { assignmentId } = req.params;
      const orgId = req.orgId!;
      const { targetRoomId, bedLabel } = req.body || {};
      if (!targetRoomId || typeof targetRoomId !== 'string') {
        return apiError(res, 400, 'VALIDATION_ERROR', 'targetRoomId is required');
      }

      const { data: oldAssignment, error: oldErr } = await supabaseAdmin
        .from('accommodation_assignments')
        .select('id, room_id, passenger_id, passenger_name, reservation_id, bed_label')
        .eq('id', assignmentId)
        .eq('org_id', orgId)
        .single();

      if (oldErr || !oldAssignment) {
        return apiError(res, 404, 'NOT_FOUND', 'Assignment not found');
      }

      if (!oldAssignment.passenger_id) {
        return apiError(res, 400, 'INVALID_ASSIGNMENT', 'Assignment has no passenger');
      }

      // Cross-departure validation
      const { data: pax } = await supabaseAdmin
        .from('departure_passengers')
        .select('departure_id')
        .eq('id', oldAssignment.passenger_id)
        .eq('org_id', orgId)
        .single();

      const { data: targetRoom, error: roomErr } = await supabaseAdmin
        .from('accommodation_rooms')
        .select('id, capacity, beds, building_id, accommodation_floors!accommodation_rooms_floor_id_fkey!inner(building_id, accommodation_buildings!accommodation_floors_building_id_fkey!inner(id, departure_id))')
        .eq('id', targetRoomId)
        .eq('org_id', orgId)
        .single();

      if (roomErr || !targetRoom) {
        return apiError(res, 404, 'ROOM_NOT_FOUND', 'Target room not found');
      }

      const floor = (targetRoom as any).accommodation_floors;
      const building = floor?.accommodation_buildings;
      if (building?.departure_id !== pax?.departure_id) {
        return apiError(res, 409, 'CROSS_DEPARTURE', 'Target room is in a different departure');
      }

      const { count: occupied } = await supabaseAdmin
        .from('accommodation_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', targetRoomId);

      if ((occupied || 0) >= targetRoom.capacity) {
        return apiError(res, 409, 'ROOM_FULL', `Room at capacity (${targetRoom.capacity}/${targetRoom.capacity})`);
      }

      if (bedLabel && targetRoom.beds) {
        const beds = targetRoom.beds as any[];
        const bed = beds.find((b: any) => b.label === bedLabel);
        if (!bed) return apiError(res, 400, 'INVALID_BED', `Bed "${bedLabel}" not found`);
        if (bed.assignedPassengerId) return apiError(res, 409, 'BED_OCCUPIED', `Bed "${bedLabel}" already occupied`);
      }

      const { data: moved, error: moveErr } = await supabaseAdmin
        .from('accommodation_assignments')
        .update({ room_id: targetRoomId, bed_label: bedLabel || null })
        .eq('id', assignmentId)
        .eq('org_id', orgId)
        .select()
        .single();

      if (moveErr) {
        if (moveErr.code === '23505') return apiError(res, 409, 'DUPLICATE_ASSIGNMENT', 'Passenger already assigned');
        return handleSupabaseError(res, moveErr, 'Failed to move assignment');
      }

      if (bedLabel && targetRoom.beds) {
        const beds = (targetRoom.beds as any[]).map((b: any) =>
          b.label === bedLabel ? { ...b, assignedPassengerId: oldAssignment.passenger_id } : b
        );
        await supabaseAdmin.from('accommodation_rooms').update({ beds }).eq('id', targetRoomId);
      }

      if (oldAssignment.bed_label) {
        const { data: oldRoom } = await supabaseAdmin
          .from('accommodation_rooms')
          .select('beds')
          .eq('id', oldAssignment.room_id)
          .single();
        if (oldRoom?.beds) {
          const oldBeds = (oldRoom.beds as any[]).map((b: any) =>
            b.label === oldAssignment.bed_label ? { ...b, assignedPassengerId: null } : b
          );
          await supabaseAdmin.from('accommodation_rooms').update({ beds: oldBeds }).eq('id', oldAssignment.room_id);
        }
      }

      logAuditEntry({
        org_id: orgId,
        user_id: req.user?.id || 'system',
        action: 'MOVE',
        entity: 'accommodation_assignment',
        entity_id: assignmentId,
        metadata: {
          passenger_id: oldAssignment.passenger_id,
          passenger_name: oldAssignment.passenger_name,
          from_room_id: oldAssignment.room_id,
          to_room_id: targetRoomId,
        },
      });

      return res.json(moved);
    } catch (err) {
      console.error('POST /accommodation/assignments/:assignmentId/move:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

export default router;
