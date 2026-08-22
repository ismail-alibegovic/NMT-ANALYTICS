import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
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
  passengerId: z.string().uuid().optional(),
  passengerName: z.string().min(1),
  reservationId: z.string().uuid(),
  bedLabel: z.string().optional().nullable(),
});

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
          floors:accommodation_floors(
            *,
            rooms:accommodation_rooms(
              *,
              assignments:accommodation_assignments(*)
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

      const { passengerId, passengerName, reservationId, bedLabel } = r.data;

      const { data: room } = await supabaseAdmin
        .from('accommodation_rooms')
        .select('capacity, beds')
        .eq('id', roomId)
        .eq('org_id', orgId)
        .single();

      if (!room) return apiError(res, 404, 'NOT_FOUND', 'Room not found');

      const { count } = await supabaseAdmin
        .from('accommodation_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId);
      const occupied = count || 0;

      if (occupied >= room.capacity) {
        return apiError(res, 409, 'ROOM_FULL', `Room at capacity (${room.capacity}/${room.capacity})`);
      }

      if (bedLabel && room.beds) {
        const beds = room.beds as any[];
        const bed = beds.find((b: any) => b.label === bedLabel);
        if (!bed) return apiError(res, 400, 'INVALID_BED', `Bed "${bedLabel}" not found`);
        if (bed.assignedPassengerId) {
          return apiError(res, 409, 'BED_OCCUPIED', `Bed "${bedLabel}" already occupied`);
        }
      }

      const { data: assignment, error } = await supabaseAdmin
        .from('accommodation_assignments')
        .insert({
          org_id: orgId,
          room_id: roomId,
          passenger_id: passengerId || null,
          reservation_id: reservationId,
          passenger_name: passengerName,
          bed_label: bedLabel || null,
          assigned_by: req.user?.id,
        })
        .select().single();

      if (error) return handleSupabaseError(res, error, 'Failed to assign passenger');

      if (bedLabel && room.beds) {
        const beds = (room.beds as any[]).map((b: any) =>
          b.label === bedLabel ? { ...b, assignedPassengerId: passengerId } : b
        );
        await supabaseAdmin.from('accommodation_rooms').update({ beds }).eq('id', roomId);
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
        .select('room_id, bed_label')
        .eq('id', assignmentId)
        .eq('org_id', orgId)
        .single();

      if (assignment?.bed_label) {
        const { data: room } = await supabaseAdmin
          .from('accommodation_rooms')
          .select('beds')
          .eq('id', assignment.room_id)
          .single();

        if (room?.beds) {
          const beds = (room.beds as any[]).map((b: any) =>
            b.label === assignment.bed_label ? { ...b, assignedPassengerId: null } : b
          );
          await supabaseAdmin.from('accommodation_rooms').update({ beds }).eq('id', assignment.room_id);
        }
      }

      const { error } = await supabaseAdmin
        .from('accommodation_assignments')
        .delete()
        .eq('id', assignmentId)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to remove assignment');
      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /accommodation/assignments/:assignmentId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

export default router;
