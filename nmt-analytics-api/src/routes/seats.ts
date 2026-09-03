import { Router, type Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { requireOrgContext } from "../middleware/requireOrgContext";
import { requireMinimumRole } from "../middleware/requireRole";
import { supabaseAdmin, handleSupabaseError } from "../lib/supabase";
import { apiError } from "../lib/errors";

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

export default router;
