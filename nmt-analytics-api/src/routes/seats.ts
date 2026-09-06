import { Router, type Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { requireOrgContext } from "../middleware/requireOrgContext";
import { requireMinimumRole } from "../middleware/requireRole";
import { supabaseAdmin, handleSupabaseError } from "../lib/supabase";
import { apiError } from "../lib/errors";
import { loadSeatingState } from "../services/seatingStateLoader";
import { generateSeatingProposal } from "../services/seatingProposal";

const router = Router();

function seatsPerRow(tt: string): number {
  return tt === "flight" ? 6 : 4;
}

function fillAvailable(
  occupied: Set<number>,
  capacity: number,
  count: number
): number[] {
  const result: number[] = [];
  for (let s = 1; s <= capacity && result.length < count; s++) {
    if (!occupied.has(s)) result.push(s);
  }
  return result;
}

function findContiguousBlock(
  occupied: Set<number>,
  capacity: number,
  count: number,
  tt: string
): number[] | null {
  const perRow = seatsPerRow(tt);
  const rows = Math.ceil(capacity / perRow);
  for (const near of [0, 1, 2, 1, 3, 0]) {
    for (let r = 0; r < rows; r++) {
      const block: number[] = [];
      const base = r * perRow;
      for (let c = 0; c < perRow && block.length < count; c++) {
        const seat = base + c + 1;
        if (seat > capacity) break;
        if (!occupied.has(seat)) block.push(seat);
        else if (block.length === 0) continue;
        else break;
      }
      if (block.length >= count) return block.slice(0, count);
    }
  }
  return null;
}

function autoAssignSeats(
  passengers: Array<{ id: string; groupId?: string; groupSize?: number }>,
  occupied: Set<number>,
  capacity: number,
  tt: string,
  groups: Array<{ id: string; members: string[]; pref: string }>
): Array<{ passengerId: string; seat: number }> {
  const results: Array<{ passengerId: string; seat: number }> = [];
  const assigned = new Set<string>();
  occupied.forEach((_s, k) => { /* track for logic */ });

  const taken = new Set(occupied);
  const groupPax = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const p of passengers) {
    if (!p.id || assigned.has(p.id)) continue;
    if (p.groupId) {
      if (!groupPax.has(p.groupId)) groupPax.set(p.groupId, []);
      groupPax.get(p.groupId)!.push(p.id);
    } else {
      ungrouped.push(p.id);
    }
  }

  const sorted = Array.from(groupPax.entries()).sort((a, b) => {
    const ga = groups.find(g => g.id === a[0]);
    const gb = groups.find(g => g.id === b[0]);
    const prefA = ga?.pref === "keep_together" ? 0 : 1;
    const prefB = gb?.pref === "keep_together" ? 0 : 1;
    if (prefA !== prefB) return prefA - prefB;
    return b[1].length - a[1].length;
  });

  for (const [_gid, paxIds] of sorted) {
    const block = findContiguousBlock(taken, capacity, paxIds.length, tt);
    if (block) {
      for (let i = 0; i < paxIds.length; i++) {
        results.push({ passengerId: paxIds[i], seat: block[i] });
        taken.add(block[i]);
      }
    } else {
      const avail = fillAvailable(taken, capacity, paxIds.length);
      for (const pid of paxIds.slice(0, avail.length)) {
        results.push({ passengerId: pid, seat: avail.shift()! });
        taken.add(results[results.length - 1].seat);
      }
    }
  }

  const remaining = fillAvailable(taken, capacity, ungrouped.length);
  for (let i = 0; i < Math.min(ungrouped.length, remaining.length); i++) {
    results.push({ passengerId: ungrouped[i], seat: remaining[i] });
    taken.add(remaining[i]);
  }

  return results;
}


// POST /api/seats/auto-assign
// Global: assign all unassigned passengers. Groups first, existing seats untouched.
router.post(
  "/seats/auto-assign",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (_req, res) => {
    return apiError(res, 409, 'AUTO_SEATING_NOT_AVAILABLE', 'Automatic seating is temporarily unavailable while the new manual seating model is being rolled out. Use the dedicated seat assignment endpoints.');
  }
);

// POST /api/seats/group-auto-assign/:groupId
router.post(
  "/seats/group-auto-assign/:groupId",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (_req, res) => {
    return apiError(res, 409, 'AUTO_SEATING_NOT_AVAILABLE', 'Automatic seating is temporarily unavailable while the new manual seating model is being rolled out. Use the dedicated seat assignment endpoints.');
  }
);

// POST /api/seats/clear-all
// M11.1: gated — manual/locked seating model prohibits bulk clear operations.
// Full clear-all will be available with M12 automatic seating.
router.post(
  "/seats/clear-all",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (_req, res) => {
    return apiError(res, 409, 'AUTO_SEATING_NOT_AVAILABLE', 'Bulk seat clearing is temporarily unavailable while the new manual seating model is being rolled out. Use the dedicated seat assignment endpoints.');
  }
);

// POST /api/departures/:departureId/seating/proposal
// M12.1 — read-only, deterministic, group-aware automatic BUS seating proposal.
router.post(
  "/departures/:departureId/seating/proposal",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { state, error } = await loadSeatingState(departureId, orgId);
      if (error) {
        return apiError(res, error.status, error.code, error.message);
      }

      const result = generateSeatingProposal(state!.input);
      if ("error" in result) {
        return apiError(res, 400, result.error, result.detail);
      }

      return res.json(result);
    } catch (err: any) {
      console.error("POST /departures/:departureId/seating/proposal:", err);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to generate seating proposal");
    }
  },
);

// POST /api/departures/:departureId/seating/apply
// M12.2 — atomically apply a reviewed M12.1 seating proposal.
// Stale-safe: regenerates proposal server-side and compares.
// Never trusts client seat assignments directly.
router.post(
  "/departures/:departureId/seating/apply",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (req, res: Response) => {
    try {
      const { departureId } = req.params;
      const orgId = req.orgId!;

      const { stateFingerprint, proposedAssignments } = req.body ?? {};

      if (typeof stateFingerprint !== "string" || !stateFingerprint) {
        return res.status(400).json({ error: "stateFingerprint is required" });
      }
      if (!Array.isArray(proposedAssignments)) {
        return res.status(400).json({ error: "proposedAssignments is required" });
      }

      // 1. Reload canonical seating state using the SAME logic as the proposal endpoint
      const { state, error } = await loadSeatingState(departureId, orgId);
      if (error) {
        return apiError(res, error.status, error.code, error.message);
      }

      // 2. Regenerate proposal and compare against submitted values
      const currentProposal = generateSeatingProposal(state!.input);

      if ("error" in currentProposal) {
        return apiError(res, 400, currentProposal.error, currentProposal.detail);
      }

      // Stale fingerprint check
      if (currentProposal.stateFingerprint !== stateFingerprint) {
        return res.status(409).json({
          error: "Proposal is stale. Generate a new proposal.",
          code: "STALE_PROPOSAL",
        });
      }

      // Compare submitted proposal with server proposal
      const submittedSeats = proposedAssignments
        .map((p: any) => ({ passengerId: p.passengerId, seatId: p.seatId }))
        .sort((a: any, b: any) => a.passengerId.localeCompare(b.passengerId));

      const serverSeats = currentProposal.proposedAssignments
        .map((p) => ({ passengerId: p.passengerId, seatId: p.seatId }))
        .sort((a, b) => a.passengerId.localeCompare(b.passengerId));

      if (JSON.stringify(submittedSeats) !== JSON.stringify(serverSeats)) {
        return res.status(409).json({
          error: "Proposal is stale. Generate a new proposal.",
          code: "STALE_PROPOSAL",
        });
      }

      // 3. Build RPC payload from SERVER proposal (never trust client data)
      const proposedJson = currentProposal.proposedAssignments.map((p) => ({
        passenger_id: p.passengerId,
        seat_id: p.seatId,
      }));

      // 4. Atomic DB apply
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        "apply_seating_proposal_atomic",
        {
          p_org_id: orgId,
          p_departure_id: departureId,
          p_proposed: proposedJson,
        },
      );

      if (rpcError) {
        console.error("seating apply RPC:", rpcError);
        return res.status(500).json({ error: "Failed to apply seating proposal" });
      }

      const row = (rpcResult as any)?.[0];
      const errorDetail = row?.error_detail;

      if (errorDetail) {
        if (
          errorDetail.includes("SEAT_ASSIGNMENT_LOCKED") ||
          errorDetail.includes("SEAT_CONFLICT") ||
          errorDetail.includes("SEAT_LOCKED")
        ) {
          return res.status(409).json({ error: "Proposal is stale. Generate a new proposal.", code: "STALE_PROPOSAL" });
        }
        if (errorDetail.includes("DEPARTURE_NOT_FOUND")) {
          return res.status(404).json({ error: "Departure not found" });
        }
        if (errorDetail.includes("VEHICLE_NOT_FOUND")) {
          return res.status(400).json({ error: "Departure has no vehicle configured" });
        }
        if (
          errorDetail.includes("PASSENGER_NOT_FOUND") ||
          errorDetail.includes("SEAT_NOT_FOUND") ||
          errorDetail.includes("DUPLICATE_PASSENGER") ||
          errorDetail.includes("DUPLICATE_SEAT")
        ) {
          return res.status(409).json({ error: "Proposal is stale. Generate a new proposal.", code: "STALE_PROPOSAL" });
        }
        return res.status(409).json({ error: errorDetail, code: "APPLY_CONFLICT" });
      }

      return res.json({
        applied: true,
        clearedCount: row?.cleared_count ?? 0,
        appliedCount: row?.inserted_count ?? 0,
      });
    } catch (err: any) {
      console.error("POST /departures/:departureId/seating/apply:", err);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to apply seating proposal");
    }
  },
);

export default router;
