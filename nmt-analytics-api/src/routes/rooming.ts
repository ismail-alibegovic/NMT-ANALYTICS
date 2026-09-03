import { Router, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { generateRoomingProposal } from '../services/roomingProposal';
import { loadRoomingState } from '../services/roomingStateLoader';

const router = Router();

// POST /api/departures/:departureId/rooming/proposal
// Generate an operational rooming proposal without writing to DB.
router.post(
  '/departures/:departureId/rooming/proposal',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { state, error } = await loadRoomingState(departureId, orgId);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }

      const proposal = generateRoomingProposal(state!.input);
      return res.json(proposal);
    } catch (err: any) {
      console.error('POST /departures/:departureId/rooming/proposal:', err);
      return res.status(500).json({ error: 'Failed to generate rooming proposal' });
    }
  },
);

// POST /api/departures/:departureId/rooming/apply
// Atomically apply a reviewed proposal. Stale-safe, capacity-safe, requirement-safe.
router.post(
  '/departures/:departureId/rooming/apply',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { stateFingerprint, replaceableAssignmentIds, proposedAssignments } = req.body ?? {};

      if (typeof stateFingerprint !== 'string' || !stateFingerprint) {
        return res.status(400).json({ error: 'stateFingerprint is required' });
      }
      if (!Array.isArray(replaceableAssignmentIds) || !Array.isArray(proposedAssignments)) {
        return res.status(400).json({ error: 'replaceableAssignmentIds and proposedAssignments are required' });
      }

      // 1. reload canonical rooming state using the SAME logic as the proposal endpoint
      const { state, error } = await loadRoomingState(departureId, orgId);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }

      // 2. regenerate proposal and compare fingerprint
      const currentProposal = generateRoomingProposal(state!.input);
      if (currentProposal.stateFingerprint !== stateFingerprint) {
        return res.status(409).json({
          error: 'Proposal is stale. Generate a new proposal.',
          code: 'STALE_PROPOSAL',
        });
      }

      // 3. build proposed JSON payload for the RPC (passenger_id + room_slot_id)
      const proposedJson = proposedAssignments.map((p: any) => ({
        passenger_id: p.passengerId,
        room_slot_id: p.slotId,
      }));

      // 4. atomic DB apply
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        'apply_rooming_proposal_atomic',
        {
          p_org_id: orgId,
          p_departure_id: departureId,
          p_replaceable_assignment_ids: replaceableAssignmentIds,
          p_proposed: proposedJson,
          p_assigned_by: null,
        },
      );

      if (rpcError) {
        console.error('rooming apply RPC:', rpcError);
        return res.status(500).json({ error: 'Failed to apply rooming proposal' });
      }

      const row = (rpcResult as any)?.[0];
      const errorDetail = row?.error_detail;

      if (errorDetail) {
        if (errorDetail.includes('ROOM_ASSIGNMENT_LOCKED')) {
          return res.status(409).json({ error: 'Proposal is stale. Generate a new proposal.', code: 'STALE_PROPOSAL' });
        }
        if (errorDetail.includes('DEPARTURE_NOT_FOUND')) {
          return res.status(404).json({ error: 'Departure not found' });
        }
        if (
          errorDetail.includes('PASSENGER_NOT_FOUND') ||
          errorDetail.includes('PASSENGER_REQUIREMENT_UNASSIGNED') ||
          errorDetail.includes('REQUIREMENT_MISMATCH') ||
          errorDetail.includes('SLOT_NOT_FOUND') ||
          errorDetail.includes('NO_COMPATIBLE_ROOM_CAPACITY') ||
          errorDetail.includes('DUPLICATE_PASSENGER')
        ) {
          return res.status(409).json({ error: 'Proposal is stale. Generate a new proposal.', code: 'STALE_PROPOSAL' });
        }
        return res.status(409).json({ error: errorDetail, code: 'APPLY_CONFLICT' });
      }

      return res.json({
        applied: true,
        deletedCount: row?.deleted_count ?? 0,
        insertedCount: row?.inserted_count ?? 0,
      });
    } catch (err: any) {
      console.error('POST /departures/:departureId/rooming/apply:', err);
      return res.status(500).json({ error: 'Failed to apply rooming proposal' });
    }
  },
);

export default router;
