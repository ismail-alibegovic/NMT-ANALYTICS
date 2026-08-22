// Phase 6C — Auto-Rooming: Proposal Generation + Apply
import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { generateRoomingProposal, type RoomingRoom, type RoomingPassenger, type RoomingGroup } from '../lib/roomingAlgorithm';

const router = Router();

const applyProposalSchema = z.object({
  assignmentIds: z.array(z.string().uuid()).min(1),
  proposalSummary: z.object({
    totalPassengers: z.number(),
    passengersProposed: z.number(),
  }).optional(),
});

// POST /api/departures/:departureId/rooming/proposal
// Generate a rooming proposal without writing to DB
router.post(
  '/departures/:departureId/rooming/proposal',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      // 1. Fetch unassigned departure passengers
      const { data: allPassengers, error: paxErr } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, full_name, departure_id')
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      if (paxErr) return handleSupabaseError(res, paxErr, 'Failed to fetch passengers');

      // 2. Fetch existing assignments to determine who is already assigned
      const existingPaxIds = new Set<string>();
      const { data: existingAssignments } = await supabaseAdmin
        .from('accommodation_assignments')
        .select('passenger_id')
        .eq('org_id', orgId)
        .in('passenger_id', (allPassengers || []).map(p => p.id).filter(Boolean));

      if (existingAssignments) {
        for (const a of existingAssignments) {
          if (a.passenger_id) existingPaxIds.add(a.passenger_id);
        }
      }

      const unassignedPax = (allPassengers || []).filter(p => !existingPaxIds.has(p.id));

      // 3. Fetch groups with members
      const { data: groups } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*, members:trip_passenger_group_members(*)')
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      // 4. Fetch buildings/floors/rooms with assignments
      const { data: buildings, error: bldgErr } = await supabaseAdmin
        .from('accommodation_buildings')
        .select(`
          id, name,
          floors:accommodation_floors(
            id, floor_number, label,
            rooms:accommodation_rooms(
              id, room_number, type, capacity,
              assignments:accommodation_assignments(id, passenger_id)
            )
          )
        `)
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      if (bldgErr) return handleSupabaseError(res, bldgErr, 'Failed to fetch accommodation');

      // 5. Build canonical inputs
      const rooms: RoomingRoom[] = [];
      for (const b of buildings || []) {
        for (const f of b.floors || []) {
          for (const r of f.rooms || []) {
            const occupied = (r.assignments || []).length;
            rooms.push({
              id: r.id, roomNumber: r.room_number, type: r.type,
              capacity: r.capacity, occupied,
              buildingId: b.id, buildingName: b.name,
              floorId: f.id, floorNumber: f.floor_number,
              floorLabel: f.label,
            });
          }
        }
      }

      const passengerMap = new Map<string, string>();
      for (const p of allPassengers || []) passengerMap.set(p.id, p.full_name);

      const groupMembership = new Map<string, { groupId: string; groupName?: string; groupColor?: string; pref?: string }>();
      for (const g of groups || []) {
        for (const m of g.members || []) {
          groupMembership.set(m.passenger_id, {
            groupId: g.id,
            groupName: g.name,
            groupColor: g.color,
            pref: g.accommodation_preference,
          });
        }
      }

      const passengers: RoomingPassenger[] = unassignedPax.map(p => {
        const gm = groupMembership.get(p.id);
        return {
          id: p.id,
          fullName: p.full_name,
          groupId: gm?.groupId || null,
          groupName: gm?.groupName || null,
          groupColor: gm?.groupColor || null,
          accommodationPreference: gm?.pref || null,
        };
      });

      const roomingGroups: RoomingGroup[] = (groups || []).map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        accommodationPreference: g.accommodation_preference || 'prefer_together',
        memberIds: (g.members || []).map((m: any) => m.passenger_id),
      }));

      // 6. Generate proposal
      const proposal = generateRoomingProposal(passengers, rooms, roomingGroups);

      return res.json(proposal);
    } catch (err) {
      console.error('POST /departures/:departureId/rooming/proposal:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// POST /api/departures/:departureId/rooming/apply
// Apply a generated proposal — revalidates current state before writing
router.post(
  '/departures/:departureId/rooming/apply',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;
      const r = applyProposalSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { assignmentIds } = r.data;

      // Regenerate proposal to verify current state matches
      const newProposal = await regenerateAndValidate(departureId, orgId);
      if ('error' in newProposal) {
        return apiError(res, 409, 'STALE_PROPOSAL', newProposal.error);
      }

      const { assignments } = newProposal;
      const requestedIds = new Set(assignmentIds);
      const toApply = assignments.filter(a => requestedIds.has(a.passengerId));

      if (toApply.length === 0) {
        return apiError(res, 409, 'STALE_PROPOSAL', 'No matching passengers to assign — state may have changed');
      }

      // Apply each assignment — use the existing assign endpoint logic
      const applied: any[] = [];
      const failures: string[] = [];

      for (const a of toApply) {
        // Re-check room capacity
        const { data: room } = await supabaseAdmin
          .from('accommodation_rooms')
          .select('id, capacity, beds')
          .eq('id', a.roomId)
          .eq('org_id', orgId)
          .single();

        if (!room) { failures.push(`Room ${a.roomId} not found`); continue; }

        const { count } = await supabaseAdmin
          .from('accommodation_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', a.roomId);
        const occupied = count || 0;

        if (occupied >= room.capacity) {
          failures.push(`Room ${a.roomNumber} is full`);
          continue;
        }

        // Check passenger still unassigned
        const { data: existing } = await supabaseAdmin
          .from('accommodation_assignments')
          .select('id')
          .eq('passenger_id', a.passengerId)
          .maybeSingle();

        if (existing) {
          failures.push(`Passenger ${a.passengerName} already assigned`);
          continue;
        }

        const { data: assignment, error } = await supabaseAdmin
          .from('accommodation_assignments')
          .insert({
            org_id: orgId,
            room_id: a.roomId,
            passenger_id: a.passengerId,
            passenger_name: a.passengerName,
            assigned_by: req.user?.id,
          })
          .select().single();

        if (error) {
          if (error.code === '23505') {
            failures.push(`Passenger ${a.passengerName} already in another room`);
          } else {
            failures.push(`Failed to assign ${a.passengerName}: ${error.message}`);
          }
          continue;
        }

        applied.push(assignment);
      }

      if (failures.length === toApply.length && applied.length === 0) {
        return apiError(res, 409, 'CONFLICT', 'All assignments failed — state may have changed since proposal', failures);
      }

      return res.json({ applied: applied.length, failed: failures.length, failures: failures.length > 0 ? failures : undefined });
    } catch (err) {
      console.error('POST /departures/:departureId/rooming/apply:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

async function regenerateAndValidate(
  departureId: string,
  orgId: string,
): Promise<{ assignments: { passengerId: string; passengerName: string; roomId: string; roomNumber: string }[] } | { error: string }> {
  const { data: allPassengers } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, full_name')
    .eq('org_id', orgId)
    .eq('departure_id', departureId);

  if (!allPassengers || allPassengers.length === 0) {
    return { error: 'No passengers found for this departure' };
  }

  const passengerMap = new Map<string, string>();
  for (const p of allPassengers) passengerMap.set(p.id, p.full_name);

  const { data: existingAssignments } = await supabaseAdmin
    .from('accommodation_assignments')
    .select('passenger_id')
    .eq('org_id', orgId)
    .in('passenger_id', allPassengers.map(p => p.id).filter(Boolean));

  const existingIds = new Set((existingAssignments || []).map(a => a.passenger_id).filter(Boolean));
  const unassignedPassengers = allPassengers.filter(p => !existingIds.has(p.id));

  if (unassignedPassengers.length === 0) {
    return { error: 'All passengers already assigned' };
  }

  const { data: buildings } = await supabaseAdmin
    .from('accommodation_buildings')
    .select(`id, name, floors:accommodation_floors(id, floor_number, label, rooms:accommodation_rooms(id, room_number, type, capacity, assignments:accommodation_assignments(id, passenger_id)))`)
    .eq('org_id', orgId)
    .eq('departure_id', departureId);

  if (!buildings || buildings.length === 0) {
    return { error: 'No accommodation buildings configured' };
  }

  const rooms: RoomingRoom[] = [];
  for (const b of buildings) {
    for (const f of b.floors || []) {
      for (const r of f.rooms || []) {
        rooms.push({
          id: r.id, roomNumber: r.room_number, type: r.type,
          capacity: r.capacity, occupied: (r.assignments || []).length,
          buildingId: b.id, buildingName: b.name,
          floorId: f.id, floorNumber: f.floor_number,
          floorLabel: f.label,
        });
      }
    }
  }

  const { data: groups } = await supabaseAdmin
    .from('trip_passenger_groups')
    .select('*, members:trip_passenger_group_members(*)')
    .eq('org_id', orgId)
    .eq('departure_id', departureId);

  const groupMembership = new Map<string, { groupId: string; groupName?: string; groupColor?: string; pref?: string }>();
  for (const g of groups || []) {
    for (const m of g.members || []) {
      groupMembership.set(m.passenger_id, {
        groupId: g.id, groupName: g.name, groupColor: g.color,
        pref: g.accommodation_preference,
      });
    }
  }

  const passengers: RoomingPassenger[] = unassignedPassengers.map(p => {
    const gm = groupMembership.get(p.id);
    return {
      id: p.id, fullName: p.full_name,
      groupId: gm?.groupId || null,
      groupName: gm?.groupName || null,
      groupColor: gm?.groupColor || null,
      accommodationPreference: gm?.pref || null,
    };
  });

  const roomingGroups: RoomingGroup[] = (groups || []).map(g => ({
    id: g.id, name: g.name, color: g.color,
    accommodationPreference: g.accommodation_preference || 'prefer_together',
    memberIds: (g.members || []).map((m: any) => m.passenger_id),
  }));

  const proposal = generateRoomingProposal(passengers, rooms, roomingGroups);
  return { assignments: proposal.assignments };
}

export default router;
