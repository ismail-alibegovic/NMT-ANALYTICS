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
  reservationId: z.string().uuid(),
});

function autoColor(existingCount: number): string {
  return GROUP_COLORS[existingCount % GROUP_COLORS.length];
}

// GET /api/departures/:departureId/groups
router.get(
  '/departures/:departureId/groups',
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
  '/departures/:departureId/groups',
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

      // Count existing groups for color assignment
      const { count } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('departure_id', departureId);

      const groupColor = autoColor(count || 0);

      // Create group
      const { data: group, error: groupErr } = await supabaseAdmin
        .from('trip_passenger_groups')
        .insert({
          org_id: orgId,
          departure_id: departureId,
          name: name || null,
          color: groupColor,
          seating_preference: seatingPreference || 'prefer_together',
          accommodation_preference: accommodationPreference || 'prefer_together',
          notes: notes || null,
          primary_passenger_id: memberIds[0],
        })
        .select()
        .single();

      if (groupErr) return handleSupabaseError(res, groupErr, 'Failed to create group');

      // Cross-departure validation: all passengers must belong to this departure
      const { data: passengers, error: paxCheckErr } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, reservation_id, departure_id')
        .eq('org_id', orgId)
        .eq('departure_id', departureId)
        .in('id', memberIds);

      if (paxCheckErr) return handleSupabaseError(res, paxCheckErr, 'Failed to validate passengers');

      if (!passengers || passengers.length !== memberIds.length) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'All passengers must belong to the same departure and organization');
      }

      const memberInserts = (passengers || []).map((p: any, i: number) => ({
        group_id: group.id,
        passenger_id: p.id,
        reservation_id: p.reservation_id,
        is_primary: i === 0,
      }));

      const { error: memberErr } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .insert(memberInserts);

      if (memberErr) return handleSupabaseError(res, memberErr, 'Failed to add members');

      return res.status(201).json(group);
    } catch (err) {
      console.error('POST /departures/:departureId/groups:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// PATCH /api/groups/:id
router.patch(
  '/groups/:id',
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
  '/groups/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
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
  '/groups/:id/members',
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
        .select('id, departure_id')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (!group) return apiError(res, 404, 'NOT_FOUND', 'Group not found');

      // Validate passenger belongs to the same departure
      const { data: passenger } = await supabaseAdmin
        .from('departure_passengers')
        .select('id, departure_id')
        .eq('id', r.data.passengerId)
        .eq('org_id', orgId)
        .single();

      if (!passenger || passenger.departure_id !== group.departure_id) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Passenger must belong to the same departure as the group');
      }

      const { error } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .insert({
          group_id: id,
          passenger_id: r.data.passengerId,
          reservation_id: r.data.reservationId,
        });

      if (error) return handleSupabaseError(res, error, 'Failed to add member');

      return res.status(201).json({ added: true });
    } catch (err) {
      console.error('POST /groups/:id/members:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  },
);

// DELETE /api/groups/:id/members/:memberId
router.delete(
  '/groups/:id/members/:memberId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id, memberId } = req.params;
      const orgId = req.orgId!;

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
