import { Router, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import {
  generateRoomingProposal,
  type RoomingProposalInput,
} from '../services/roomingProposal';

const router = Router();

// POST /api/departures/:departureId/rooming/proposal
// Generate an operational rooming proposal without writing to DB
router.post(
  '/departures/:departureId/rooming/proposal',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      // 1. fetch operational room slots with their assignments
      const { data: slots, error: slotsErr } = await supabaseAdmin
        .from('departure_room_slots')
        .select('*, assignments:departure_room_slot_assignments(*), hotels:hotel_id(id, name, destination, stars)')
        .eq('departure_id', departureId)
        .eq('org_id', orgId);

      if (slotsErr) throw slotsErr;

      // 2. fetch departure passengers
      const { data: passengers, error: passengersErr } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, full_name, departure_id, reservation_id, reservation_accommodation_requirement_id')
        .eq('departure_id', departureId)
        .eq('org_id', orgId);

      if (passengersErr) throw passengersErr;

      // 3. resolve accommodation requirements for passengers that have one
      const requirementIds = (passengers || [])
        .map((p: any) => p.reservation_accommodation_requirement_id)
        .filter(Boolean);

      let requirementMap = new Map<string, any>();
      if (requirementIds.length > 0) {
        const { data: requirements, error: reqErr } = await supabaseAdmin
          .from('reservation_accommodation_requirements')
          .select('id, hotel_id, hotel_allocation_id, room_type')
          .eq('org_id', orgId)
          .in('id', requirementIds);

        if (reqErr) throw reqErr;
        for (const r of requirements || []) {
          requirementMap.set(r.id, r);
        }
      }

      // 4. fetch passenger groups with members
      const { data: groups, error: groupsErr } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*, members:trip_passenger_group_members(passenger_id, is_primary)')
        .eq('departure_id', departureId)
        .eq('org_id', orgId);

      if (groupsErr) throw groupsErr;

      // build group → passengerIds map
      const groupRows = (groups || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        accommodationPreference: g.accommodation_preference ?? 'no_preference',
        color: g.color,
        passengerIds: (g.members || []).map((m: any) => m.passenger_id),
      }));

      // build passenger → group lookup
      const passengerGroup = new Map<string, { groupId: string; accPref: string; color?: string; name: string }>();
      for (const g of groupRows) {
        for (const pid of g.passengerIds) {
          passengerGroup.set(pid, {
            groupId: g.id,
            accPref: g.accommodationPreference,
            color: g.color,
            name: g.name,
          });
        }
      }

      // 5. build flat existingAssignments
      const existingAssignments: RoomingProposalInput['existingAssignments'] = [];
      for (const slot of slots || []) {
        for (const a of (slot as any).assignments || []) {
          existingAssignments.push({
            id: a.id,
            passengerId: a.passenger_id,
            slotId: slot.id,
            isManual: a.is_manual ?? false,
            locked: a.locked ?? false,
            passengerName: a.passenger_name,
          });
        }
      }

      // 6. build passenger list with requirement info + group membership
      const passengerRows: RoomingProposalInput['passengers'] = (passengers || []).map((p: any) => {
        const req = requirementMap.get(p.reservation_accommodation_requirement_id);
        const grp = passengerGroup.get(p.id);
        return {
          id: p.id,
          fullName: p.full_name,
          hotelAllocationId: req?.hotel_allocation_id ?? undefined,
          hotelId: req?.hotel_id ?? undefined,
          roomType: req?.room_type ?? undefined,
          groupId: grp?.groupId,
          groupAccommodationPreference: grp?.accPref,
          groupColor: grp?.color,
          groupName: grp?.name,
        };
      });

      // 7. build slot list
      const slotRows: RoomingProposalInput['slots'] = (slots || []).map((s: any) => ({
        id: s.id,
        roomType: s.room_type,
        capacity: s.capacity,
        hotelAllocationId: s.hotel_allocation_id,
        hotelId: s.hotel_id,
        assignedCount: ((s as any).assignments || []).length,
        displayLabel: s.display_label ?? `${s.room_type} ${s.id.slice(0, 8)}`,
      }));

      // 8. call pure proposal service
      const proposal = generateRoomingProposal({
        departureId,
        slots: slotRows,
        passengers: passengerRows,
        existingAssignments,
        groups: groupRows,
      });

      return res.json(proposal);
    } catch (err: any) {
      console.error('POST /departures/:departureId/rooming/proposal:', err);
      return res.status(500).json({ error: 'Failed to generate rooming proposal' });
    }
  },
);

export default router;
