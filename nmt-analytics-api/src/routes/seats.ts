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
  async (req, res: Response) => {
    try {
      const orgId = req.orgId!;
      const { departureId, transportType } = req.body || {};
      if (!departureId) return apiError(res, 400, "VALIDATION_ERROR", "departureId required");

      const { data: pax, error: paxErr } = await supabaseAdmin
        .from("departure_passengers")
        .select("id, departure_id, seat_number")
        .eq("org_id", orgId)
        .eq("departure_id", departureId);
      if (paxErr || !pax) return apiError(res, 500, "DB_ERROR", "Failed to load passengers");

      const occupied: Set<number> = new Set();
      const unassigned: Array<{ id: string }> = [];
      for (const p of pax) {
        if (p.seat_number) occupied.add(p.seat_number);
        else unassigned.push({ id: p.id });
      }
      if (unassigned.length === 0) return res.json({ assigned: 0, preserved: occupied.size, unassigned: 0, results: [] });

      const { data: departure } = await supabaseAdmin.from("departures").select("capacity, transport_type").eq("id", departureId).single();
      const cap = departure?.capacity || 50;
      const tt = transportType || departure?.transport_type || "bus";

      const { data: groupRows } = await supabaseAdmin.from("trip_passenger_groups").select("id, seating_preference, members:trip_passenger_group_members(passenger_id)").eq("org_id", orgId).eq("departure_id", departureId);
      const groups = (groupRows || []).map((g: any) => ({ id: g.id, pref: g.seating_preference || "prefer_together", members: (g.members || []).map((m: any) => m.passenger_id) }));

      const results = autoAssignSeats(unassigned.map(p => ({ id: p.id })), occupied, cap, tt, groups);

      // Atomic batch update
      const updates = results.map(r => ({ id: r.passengerId, seat_number: r.seat }));
      const { data: batchResult, error: batchErr } = await supabaseAdmin.rpc("batch_update_seats_atomic", {
        p_org_id: orgId, p_departure_id: departureId, p_assignments: updates,
      });
      if (batchErr) return apiError(res, 409, "SEAT_CONFLICT", batchErr.message || "Seat conflict during batch assignment");

      return res.json({
        assigned: results.length,
        preserved: occupied.size,
        unassigned: unassigned.length - results.length,
        results,
      });
    } catch (err) {
      console.error("POST /seats/auto-assign:", err);
      return apiError(res, 500, "INTERNAL_ERROR", "Auto-assign failed", String(err));
    }
  }
);

// POST /api/seats/group-auto-assign/:groupId
router.post(
  "/seats/group-auto-assign/:groupId",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (req, res: Response) => {
    try {
      const { groupId } = req.params;
      const orgId = req.orgId!;
      const { departureId, transportType, apply } = req.body || {};
      if (!departureId) return apiError(res, 400, "VALIDATION_ERROR", "departureId required");

      const { data: group } = await supabaseAdmin.from("trip_passenger_groups").select("id, departure_id").eq("id", groupId).eq("org_id", orgId).single();
      if (!group) return apiError(res, 404, "NOT_FOUND", "Group not found");

      const { data: pax } = await supabaseAdmin.from("departure_passengers").select("id, seat_number").eq("org_id", orgId).eq("departure_id", departureId);
      if (!pax) return apiError(res, 500, "DB_ERROR", "Failed to load passengers");

      const { data: members } = await supabaseAdmin.from("trip_passenger_group_members").select("passenger_id").eq("group_id", groupId);

      const memberIds = new Set((members || []).map((m: any) => m.passenger_id));
      const occupied: Set<number> = new Set();
      const unassignedMembers: string[] = [];

      for (const p of pax) {
        if (p.seat_number) occupied.add(p.seat_number);
        if (memberIds.has(p.id) && !p.seat_number) unassignedMembers.push(p.id);
      }

      if (unassignedMembers.length === 0) return res.json({ assigned: 0, split: false, results: [] });

      const { data: departure } = await supabaseAdmin.from("departures").select("capacity, transport_type").eq("id", departureId).single();
      const cap = departure?.capacity || 50;
      const tt = transportType || departure?.transport_type || "bus";

      const block = findContiguousBlock(occupied, cap, unassignedMembers.length, tt);
      let assignments: Array<{ passengerId: string; seat: number }>;
      let split = false;

      if (block && block.length >= unassignedMembers.length) {
        assignments = unassignedMembers.map((id, i) => ({ passengerId: id, seat: block[i] }));
      } else if (block && block.length > 0) {
        assignments = unassignedMembers.slice(0, block.length).map((id, i) => ({ passengerId: id, seat: block[i] }));
        const remaining = unassignedMembers.slice(block.length);
        const extra = fillAvailable(new Set([...occupied, ...block.map(n => n)]), cap, remaining.length);
        for (let i = 0; i < Math.min(remaining.length, extra.length); i++) {
          assignments.push({ passengerId: remaining[i], seat: extra[i] });
        }
        split = true;
      } else {
        const avail = fillAvailable(occupied, cap, unassignedMembers.length);
        assignments = unassignedMembers.slice(0, avail.length).map((id, i) => ({ passengerId: id, seat: avail[i] }));
        split = unassignedMembers.length > avail.length;
      }

      if (apply === true) {
        const updates = assignments.map(a => ({ id: a.passengerId, seat_number: a.seat }));
        const { error: batchErr } = await supabaseAdmin.rpc("batch_update_seats_atomic", {
          p_org_id: orgId, p_departure_id: departureId, p_assignments: updates,
        });
        if (batchErr) return apiError(res, 409, "SEAT_CONFLICT", batchErr.message || "Seat conflict");
        return res.json({ applied: assignments.length, split, results: assignments });
      }

      return res.json({ preview: true, count: unassignedMembers.length, split, assignments });
    } catch (err) {
      console.error("POST /seats/group-auto-assign:", err);
      return apiError(res, 500, "INTERNAL_ERROR", "Group auto-assign failed", String(err));
    }
  }
);

// POST /api/seats/clear-all
router.post(
  "/seats/clear-all",
  authenticateToken,
  requireOrgContext,
  requireMinimumRole("manager"),
  async (req, res: Response) => {
    try {
      const orgId = req.orgId!;
      const { departureId } = req.body || {};
      if (!departureId) return apiError(res, 400, "VALIDATION_ERROR", "departureId required");

      const { error } = await supabaseAdmin.from("departure_passengers").update({ seat_number: null }).eq("org_id", orgId).eq("departure_id", departureId);
      if (error) return apiError(res, 500, "DB_ERROR", error.message);

      return res.json({ cleared: true });
    } catch (err) {
      console.error("POST /seats/clear-all:", err);
      return apiError(res, 500, "INTERNAL_ERROR", "Clear failed", String(err));
    }
  }
);

export default router;
