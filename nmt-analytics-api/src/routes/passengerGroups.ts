import { Router, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';

const router = Router();

const GROUP_COLORS = [
  '#ec4899', '#eab308', '#3b82f6', '#22c55e', '#a855f7',
  '#06b6d4', '#f97316', '#ef4444', '#84cc16', '#6366f1',
];

const createGroupSchema = z.object({
  departureId: z.string().uuid(),
  name: z.string().optional(),
  notes: z.string().optional().nullable(),
  seatingPreference: z.enum(['keep_together','prefer_together','no_preference']).optional(),
  accommodationPreference: z.enum(['same_room','adjacent_rooms','same_floor','nearby','no_preference']).optional(),
  memberIds: z.array(z.string().uuid()).min(1),
  primaryPassengerId: z.string().uuid().optional(),
});

const updateGroupSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional().nullable(),
  seatingPreference: z.enum(['keep_together','prefer_together','no_preference']).optional(),
  accommodationPreference: z.enum(['same_room','adjacent_rooms','same_floor','nearby','no_preference']).optional(),
  locked: z.boolean().optional(),
});

const addMemberSchema = z.object({
  passengerId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
});

const replaceMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1),
  primaryPassengerId: z.string().uuid(),
});

function autoColor(existingCount: number): string {
  return GROUP_COLORS[existingCount % GROUP_COLORS.length];
}

function groupLocked(res: Response) {
  return apiError(
    res,
    409,
    'GROUP_LOCKED',
    'Unlock the passenger group before changing membership or deleting it.',
  );
}

function passengerGroupRpcError(res: Response, error: { message?: string; code?: string }, fallback = 'Failed to replace group members') {
  const message = String(error?.message || '');
  if (message.includes('GROUP_LOCKED')) return groupLocked(res);
  if (message.includes('GROUP_NOT_FOUND')) return apiError(res, 404, 'NOT_FOUND', 'Group not found');
  if (error?.code === '23505') {
    return apiError(res, 409, 'DUPLICATE_GROUP_MEMBERSHIP', 'Some passengers are already members of another group in this departure');
  }
  if (message.includes('DUPLICATE_GROUP_MEMBERSHIP')) {
    return apiError(res, 409, 'DUPLICATE_GROUP_MEMBERSHIP', 'Some passengers are already members of another group in this departure');
  }
  if (message.includes('PRIMARY_NOT_MEMBER')) return apiError(res, 400, 'PRIMARY_NOT_MEMBER', 'Primary passenger must be a member of the group');
  if (message.includes('INVALID_GROUP_PASSENGERS')) return apiError(res, 400, 'CROSS_DEPARTURE', 'All passengers must belong to the same departure and organization');
  if (message.includes('DUPLICATE_MEMBER_IDS')) return apiError(res, 400, 'VALIDATION_ERROR', 'Group member IDs must be unique');
  if (message.includes('GROUP_MEMBERS_REQUIRED')) return apiError(res, 400, 'VALIDATION_ERROR', 'At least one passenger is required');
  return handleSupabaseError(res, error, fallback);
}

async function fetchGroupWithMembers(groupId: string, orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('trip_passenger_groups')
    .select('*, members:trip_passenger_group_members(*)')
    .eq('id', groupId)
    .eq('org_id', orgId)
    .single();

  if (error) throw error;
  return data;
}

// GET /api/departures/:departureId/groups
router.get(
  '/departures/:departureId/passenger-groups',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { data, error } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*, members:trip_passenger_group_members(*)')
        .eq('org_id', orgId)
        .eq('departure_id', departureId)
        .order('created_at');

      if (error) return handleSupabaseError(res, error, 'Failed to fetch groups');
      return res.json(data || []);
    } catch (err) {
      console.error('GET /departures/:departureId/groups:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// POST /api/departures/:departureId/groups
router.post(
  '/departures/:departureId/passenger-groups',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;
      const r = createGroupSchema.safeParse({ ...req.body, departureId });
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { name, notes, seatingPreference, accommodationPreference, memberIds } = r.data;
      const primaryPassengerId = r.data.primaryPassengerId || memberIds[0];

      if (!memberIds.includes(primaryPassengerId)) {
        return apiError(res, 400, 'PRIMARY_NOT_MEMBER', 'Primary passenger must be a member of the group');
      }

      // Validate all passengers BEFORE creating the group row (no orphans)
      const { data: passengers, error: paxCheckErr } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, full_name, reservation_id, departure_id')
        .eq('org_id', orgId)
        .eq('departure_id', departureId)
        .in('id', memberIds);

      if (paxCheckErr) return handleSupabaseError(res, paxCheckErr, 'Failed to validate passengers');

      if (!passengers || passengers.length !== memberIds.length) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'All passengers must belong to the same departure and organization');
      }

      // Check for duplicate group membership — fetch all groups for this departure, then check across them
      const { data: departureGroups } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id')
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      const existingGroupIds = (departureGroups || []).map((g: any) => g.id);
      if (existingGroupIds.length > 0) {
        const { data: existingMembers } = await supabaseAdmin
          .from('trip_passenger_group_members')
          .select('passenger_id, group_id')
          .in('group_id', existingGroupIds)
          .in('passenger_id', memberIds)
          .limit(memberIds.length);

        if (existingMembers && existingMembers.length > 0) {
          const alreadyGrouped = existingMembers.map((m: any) => m.passenger_id);
          return apiError(res, 400, 'DUPLICATE_GROUP_MEMBERSHIP', 'Some passengers are already members of another group in this departure', { alreadyGrouped });
        }
      }

      // All clear — create the group and members atomically
      const { count } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      const groupColor = autoColor(count || 0);

      const { data: group, error: groupErr } = await supabaseAdmin
        .from('trip_passenger_groups')
        .insert({
          org_id: orgId,
          departure_id: departureId,
          name: name || null,
          color: groupColor,
          seating_preference: seatingPreference || 'prefer_together',
          accommodation_preference: accommodationPreference || 'no_preference',
          notes: notes || null,
          primary_passenger_id: primaryPassengerId,
          primary_passenger_name: (passengers || []).find((p: any) => p.id === primaryPassengerId)?.full_name || null,
        })
        .select()
        .single();

      if (groupErr) return handleSupabaseError(res, groupErr, 'Failed to create group');

      const memberInserts = (passengers || []).map((p: any) => ({
        group_id: group.id,
        passenger_id: p.id,
        reservation_id: p.reservation_id,
        is_primary: p.id === primaryPassengerId,
      }));

      const { error: memberErr } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .insert(memberInserts);

      if (memberErr) {
        // Rollback: delete the orphan group
        await supabaseAdmin.from('trip_passenger_groups').delete().eq('id', group.id).eq('org_id', orgId);
        return handleSupabaseError(res, memberErr, 'Failed to add members');
      }

      return res.status(201).json(group);
    } catch (err) {
      console.error('POST /departures/:departureId/groups:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// PATCH /api/groups/:id
router.patch(
  '/passenger-groups/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const r = updateGroupSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const updates: Record<string, unknown> = {};
      if (r.data.name !== undefined) updates.name = r.data.name;
      if (r.data.color !== undefined) updates.color = r.data.color;
      if (r.data.notes !== undefined) updates.notes = r.data.notes;
      if (r.data.seatingPreference !== undefined) updates.seating_preference = r.data.seatingPreference;
      if (r.data.accommodationPreference !== undefined) updates.accommodation_preference = r.data.accommodationPreference;
      if (r.data.locked !== undefined) updates.locked = r.data.locked;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('trip_passenger_groups')
        .update(updates)
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) return handleSupabaseError(res, error, 'Failed to update group');
      return res.json(data);
    } catch (err) {
      console.error('PATCH /groups/:id:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// DELETE /api/groups/:id
router.delete(
  '/passenger-groups/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const { data: group } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id, locked')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!group) return apiError(res, 404, 'NOT_FOUND', 'Group not found');
      if (group.locked === true) return groupLocked(res);

      const { error } = await supabaseAdmin
        .from('trip_passenger_groups')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to delete group');
      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /groups/:id:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// POST /api/groups/:id/members
router.post(
  '/passenger-groups/:id/members',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const r = addMemberSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      // Verify group belongs to org + fetch departure_id for cross-departure check
      const { data: group } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id, departure_id, locked')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (!group) return apiError(res, 404, 'NOT_FOUND', 'Group not found');
      if (group.locked === true) return groupLocked(res);

      // Check if passenger is already in any group for this departure
      const { data: existingDepartureGroups } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id')
        .eq('org_id', orgId)
        .eq('departure_id', group.departure_id);

      const depGroupIds = (existingDepartureGroups || []).map((g: any) => g.id);
      if (depGroupIds.length > 0) {
        const { data: existingMember } = await supabaseAdmin
          .from('trip_passenger_group_members')
          .select('id')
          .in('group_id', depGroupIds)
          .eq('passenger_id', r.data.passengerId)
          .limit(1);

        if (existingMember && existingMember.length > 0) {
          return apiError(res, 400, 'DUPLICATE_GROUP_MEMBERSHIP', 'Passenger is already a member of another group in this departure');
        }
      }

      // Validate passenger belongs to the same departure
      const { data: passenger } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, departure_id, reservation_id')
        .eq('id', r.data.passengerId)
        .eq('org_id', orgId)
        .single();

      if (!passenger || passenger.departure_id !== group.departure_id) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Passenger must belong to the same departure as the group');
      }

      // Use the canonical reservation_id from the validated passenger, not frontend input
      const { error } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .insert({
          group_id: id,
          passenger_id: r.data.passengerId,
          reservation_id: passenger.reservation_id,
        });

      if (error) return handleSupabaseError(res, error, 'Failed to add member');

      return res.status(201).json({ added: true });
    } catch (err) {
      console.error('POST /groups/:id/members:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// PUT /api/groups/:id/members
router.put(
  '/passenger-groups/:id/members',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const r = replaceMembersSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const { data: group } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id, locked')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!group) return apiError(res, 404, 'NOT_FOUND', 'Group not found');
      if (group.locked === true) return groupLocked(res);

      const { error } = await supabaseAdmin.rpc('replace_passenger_group_members', {
        p_org_id: orgId,
        p_group_id: id,
        p_member_ids: r.data.memberIds,
        p_primary_passenger_id: r.data.primaryPassengerId,
      });

      if (error) return passengerGroupRpcError(res, error);

      const refreshed = await fetchGroupWithMembers(id, orgId);
      return res.json(refreshed);
    } catch (err) {
      console.error('PUT /groups/:id/members:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// DELETE /api/groups/:id/members/:memberId
router.delete(
  '/passenger-groups/:id/members/:memberId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id, memberId } = req.params;
      const orgId = req.orgId!;

      // Verify group belongs to req.orgId before deleting member
      const { data: group } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id, locked')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!group) {
        return apiError(res, 404, 'NOT_FOUND', 'Passenger group not found');
      }
      if (group.locked === true) return groupLocked(res);

      const { error } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .delete()
        .eq('group_id', id)
        .eq('id', memberId);

      if (error) return handleSupabaseError(res, error, 'Failed to remove member');
      return res.status(204).send();
    } catch (err) {
      console.error('DELETE /groups/:id/members/:memberId:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

export default router;
