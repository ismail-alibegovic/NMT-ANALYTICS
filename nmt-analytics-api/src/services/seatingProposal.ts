import { createHash } from 'node:crypto';

// M12.1 — deterministic, read-only automatic BUS seating proposal.
// Uses real ACTIVE physical seats from departure_vehicle_seats.
// Never writes. Never moves manual/locked passengers.

export interface SeatingProposalSeat {
  id: string;
  seatNumber: number;
  seatLabel: string;
  rowNumber: number;
  columnIndex: number;
  side: 'left' | 'right';
}

export interface SeatingProposalInput {
  departureId: string;
  vehicle: {
    id: string;
    vehicleLabel: string;
    registrationNumber: string | null;
    capacity: number;
    layoutType: string;
  };
  seats: SeatingProposalSeat[];
  passengers: {
    id: string;
    fullName: string;
    seatNumber: number | null;
    seatIsManual: boolean;
    seatLocked: boolean;
  }[];
  groups: {
    id: string;
    name: string | null;
    seatingPreference: 'keep_together' | 'prefer_together' | 'no_preference';
    passengerIds: string[];
  }[];
}

export interface PreservedSeatAssignment {
  passengerId: string;
  passengerName: string;
  seatId: string;
  seatNumber: number;
  seatLabel: string;
  reason: 'manual_locked';
}

export interface ProposedSeatAssignment {
  passengerId: string;
  passengerName: string;
  seatId: string;
  seatNumber: number;
  seatLabel: string;
  reason: 'group_keep_together' | 'group_prefer_together' | 'group_no_preference' | 'individual_fill';
  groupId?: string;
}

export interface UnresolvedSeatPassenger {
  passengerId: string;
  passengerName: string;
  reason: 'NO_AVAILABLE_SEAT' | 'INVALID_EXISTING_SEAT';
  message: string;
}

export interface SplitGroupWarning {
  groupId: string;
  groupName: string | null;
  seatingPreference: string;
  message: string;
  seatNumbers: number[];
}

export interface SeatingProposalOutput {
  departureId: string;
  vehicle: {
    id: string;
    vehicleLabel: string;
    registrationNumber: string | null;
    capacity: number;
    layoutType: string;
  };
  stateFingerprint: string;
  summary: {
    totalPassengers: number;
    preserved: number;
    proposed: number;
    unresolved: number;
    activeSeats: number;
  };
  preservedAssignments: PreservedSeatAssignment[];
  proposedAssignments: ProposedSeatAssignment[];
  unresolved: UnresolvedSeatPassenger[];
  warnings: string[];
  splitGroupWarnings: SplitGroupWarning[];
}

function computeFingerprint(input: SeatingProposalInput): string {
  const material = JSON.stringify({
    departureId: input.departureId,
    vehicle: {
      id: input.vehicle.id,
      capacity: input.vehicle.capacity,
      layoutType: input.vehicle.layoutType,
    },
    seats: [...input.seats]
      .map((s) => ({
        id: s.id,
        seatNumber: s.seatNumber,
        rowNumber: s.rowNumber,
        columnIndex: s.columnIndex,
        side: s.side,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    passengers: [...input.passengers]
      .map((p) => ({
        id: p.id,
        seatNumber: p.seatNumber,
        seatIsManual: p.seatIsManual,
        seatLocked: p.seatLocked,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    groups: [...input.groups]
      .map((g) => ({
        id: g.id,
        seatingPreference: g.seatingPreference,
        passengerIds: [...g.passengerIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

// Deterministic seat ordering: row, then column, then seat number, then id.
function seatOrder(a: SeatingProposalSeat, b: SeatingProposalSeat): number {
  if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
  if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex;
  if (a.seatNumber !== b.seatNumber) return a.seatNumber - b.seatNumber;
  return a.id.localeCompare(b.id);
}

export function generateSeatingProposal(input: SeatingProposalInput): SeatingProposalOutput | { error: 'INVALID_SEAT_STATE'; detail: string } {
  const { departureId, vehicle, passengers, groups } = input;

  // Only ACTIVE seats are passed in by the loader. Validate physical state:
  // duplicate seat numbers inside the vehicle would make mapping ambiguous.
  const seenNumbers = new Set<number>();
  for (const s of input.seats) {
    if (seenNumbers.has(s.seatNumber)) {
      return { error: 'INVALID_SEAT_STATE', detail: `Duplicate seat number ${s.seatNumber} in vehicle layout` };
    }
    seenNumbers.add(s.seatNumber);
  }

  const seats = [...input.seats].sort(seatOrder);
  const seatByNumber = new Map(seats.map((s) => [s.seatNumber, s]));

  const preserved: PreservedSeatAssignment[] = [];
  const warnings: string[] = [];
  const unresolved: UnresolvedSeatPassenger[] = [];
  const proposed: ProposedSeatAssignment[] = [];
  const splitGroupWarnings: SplitGroupWarning[] = [];

  const takenSeatNumbers = new Set<number>();
  const fixedPassengerIds = new Set<string>();

  // Step 1 — preserve manual/locked assignments.
  const sortedPassengers = [...passengers].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sortedPassengers) {
    if ((p.seatIsManual || p.seatLocked) && p.seatNumber != null) {
      const seat = seatByNumber.get(p.seatNumber);
      if (!seat) {
        // A manual/locked passenger sits on a seat that is missing or inactive —
        // report, but do NOT free the seat (never touch manual state).
        unresolved.push({
          passengerId: p.id,
          passengerName: p.fullName,
          reason: 'INVALID_EXISTING_SEAT',
          message: `${p.fullName} holds seat ${p.seatNumber} which is not an active physical seat`,
        });
        fixedPassengerIds.add(p.id);
        takenSeatNumbers.add(p.seatNumber);
        continue;
      }
      preserved.push({
        passengerId: p.id,
        passengerName: p.fullName,
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        seatLabel: seat.seatLabel,
        reason: 'manual_locked',
      });
      fixedPassengerIds.add(p.id);
      takenSeatNumbers.add(p.seatNumber);
    }
  }

  // Eligible = not fixed. Passengers with an old automatic seat_number are replanned.
  const eligible = sortedPassengers.filter((p) => !fixedPassengerIds.has(p.id));

  const passengerNameById = new Map(passengers.map((p) => [p.id, p.fullName]));
  const passengerGroupById = new Map<string, string>();
  for (const g of groups) {
    for (const pid of g.passengerIds) passengerGroupById.set(pid, g.id);
  }

  const freeSeats = () => seats.filter((s) => !takenSeatNumbers.has(s.seatNumber));

  function allocate(seat: SeatingProposalSeat, pid: string, reason: ProposedSeatAssignment['reason'], groupId?: string) {
    proposed.push({
      passengerId: pid,
      passengerName: passengerNameById.get(pid) ?? pid,
      seatId: seat.id,
      seatNumber: seat.seatNumber,
      seatLabel: seat.seatLabel,
      reason,
      groupId,
    });
    takenSeatNumbers.add(seat.seatNumber);
  }

  // Same-row contiguous adjacent block for a group of n members.
  function findAdjacentBlock(n: number): SeatingProposalSeat[] | null {
    const free = freeSeats();
    const byRow = new Map<number, SeatingProposalSeat[]>();
    for (const s of free) {
      const row = byRow.get(s.rowNumber) ?? [];
      row.push(s);
      byRow.set(s.rowNumber, row);
    }
    const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, rowSeats] of rows) {
      const sorted = rowSeats.sort(seatOrder);
      let run: SeatingProposalSeat[] = [];
      let prevCol = -99;
      for (const s of sorted) {
        if (s.columnIndex === prevCol + 1) run.push(s);
        else run = [s];
        prevCol = s.columnIndex;
        if (run.length === n) return [...run];
      }
    }
    return null;
  }

  // Closest-possible fallback: minimal-span window of n free seats in sorted
  // seat order. The minimal-span n-subset of a sorted list is a contiguous
  // window of that list, so a sliding window is exhaustive and deterministic.
  function findClosestWindow(n: number): SeatingProposalSeat[] | null {
    const free = freeSeats();
    if (free.length < n) return null;
    let best: SeatingProposalSeat[] | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (let i = 0; i + n <= free.length; i++) {
      const window = free.slice(i, i + n);
      const span = window[window.length - 1].seatNumber - window[0].seatNumber;
      if (span < bestSpan) {
        bestSpan = span;
        best = window;
      }
    }
    return best;
  }

  // Step 2 — groups, deterministic order: group id asc; preference strength first
  // (keep_together before prefer_together before no_preference) then id.
  const prefRank = (p: string) => (p === 'keep_together' ? 0 : p === 'prefer_together' ? 1 : 2);
  const eligibleById = new Map(eligible.map((p) => [p.id, p]));
  const groupList = [...groups]
    .map((g) => ({
      ...g,
      members: g.passengerIds.filter((pid) => eligibleById.has(pid)).sort(),
    }))
    .filter((g) => g.members.length > 0)
    .sort((a, b) => {
      const r = prefRank(a.seatingPreference) - prefRank(b.seatingPreference);
      return r !== 0 ? r : a.id.localeCompare(b.id);
    });

  for (const g of groupList) {
    const n = g.members.length;
    const reason: ProposedSeatAssignment['reason'] =
      g.seatingPreference === 'keep_together'
        ? 'group_keep_together'
        : g.seatingPreference === 'prefer_together'
          ? 'group_prefer_together'
          : 'group_no_preference';

    if (g.seatingPreference === 'no_preference') {
      for (const pid of g.members) {
        const seat = freeSeats()[0];
        if (!seat) {
          unresolved.push({
            passengerId: pid,
            passengerName: passengerNameById.get(pid) ?? pid,
            reason: 'NO_AVAILABLE_SEAT',
            message: `No available active seat for ${passengerNameById.get(pid) ?? pid}`,
          });
          continue;
        }
        allocate(seat, pid, reason, g.id);
      }
      continue;
    }

    // keep_together / prefer_together: try adjacent block first.
    let block: SeatingProposalSeat[] | null = findAdjacentBlock(n);
    if (!block) block = findClosestWindow(n);

    if (block) {
      // If the block is not truly adjacent (same-row contiguous), record a warning
      // for keep_together groups — best-effort placement.
      const isAdjacent =
        block.every((s) => s.rowNumber === block[0].rowNumber) &&
        block.every((s, i) => i === 0 || s.columnIndex === block[i - 1].columnIndex + 1);
      if (!isAdjacent && g.seatingPreference === 'keep_together') {
        warnings.push(
          `Group "${g.name ?? g.id}" (${g.seatingPreference}) could not be placed in adjacent seats — placed in closest possible seats`,
        );
      }
      block.forEach((seat, i) => allocate(seat, g.members[i], reason, g.id));
      continue;
    }

    // Split: not enough free seats to place the group as a unit.
    const remaining = freeSeats();
    const placed: number[] = [];
    if (remaining.length > 0) {
      const window = findClosestWindow(Math.min(n, remaining.length)) ?? remaining;
      const chunk = window.slice(0, remaining.length);
      g.members.forEach((pid, i) => {
        if (i < chunk.length) {
          allocate(chunk[i], pid, reason, g.id);
          placed.push(chunk[i].seatNumber);
        } else {
          unresolved.push({
            passengerId: pid,
            passengerName: passengerNameById.get(pid) ?? pid,
            reason: 'NO_AVAILABLE_SEAT',
            message: `No available active seat for ${passengerNameById.get(pid) ?? pid}`,
          });
        }
      });
    } else {
      for (const pid of g.members) {
        unresolved.push({
          passengerId: pid,
          passengerName: passengerNameById.get(pid) ?? pid,
          reason: 'NO_AVAILABLE_SEAT',
          message: `No available active seat for ${passengerNameById.get(pid) ?? pid}`,
        });
      }
    }
    splitGroupWarnings.push({
      groupId: g.id,
      groupName: g.name,
      seatingPreference: g.seatingPreference,
      message: `Group "${g.name ?? g.id}" could not be seated together — split across available seats`,
      seatNumbers: placed,
    });
  }

  // Step 3 — remaining solo travelers, deterministic id order, first free seat.
  for (const p of eligible) {
    if (passengerGroupById.has(p.id)) continue; // groups handled above
    const seat = freeSeats()[0];
    if (!seat) {
      unresolved.push({
        passengerId: p.id,
        passengerName: p.fullName,
        reason: 'NO_AVAILABLE_SEAT',
        message: `No available active seat for ${p.fullName}`,
      });
      continue;
    }
    allocate(seat, p.id, 'individual_fill');
  }

  // Hard invariant: no duplicate proposed seats, no seat shared with preserved.
  const proposedNumbers = proposed.map((a) => a.seatNumber);
  if (new Set(proposedNumbers).size !== proposedNumbers.length) {
    return { error: 'INVALID_SEAT_STATE', detail: 'Internal error: duplicate seat proposed' };
  }
  for (const n of proposedNumbers) {
    if (preserved.some((pa) => pa.seatNumber === n)) {
      return { error: 'INVALID_SEAT_STATE', detail: `Internal error: proposed seat ${n} collides with preserved seat` };
    }
  }

  return {
    departureId,
    vehicle: {
      id: vehicle.id,
      vehicleLabel: vehicle.vehicleLabel,
      registrationNumber: vehicle.registrationNumber,
      capacity: vehicle.capacity,
      layoutType: vehicle.layoutType,
    },
    stateFingerprint: computeFingerprint(input),
    summary: {
      totalPassengers: passengers.length,
      preserved: preserved.length,
      proposed: proposed.length,
      unresolved: unresolved.length,
      activeSeats: seats.length,
    },
    preservedAssignments: preserved.sort((a, b) => a.passengerId.localeCompare(b.passengerId)),
    proposedAssignments: proposed,
    unresolved: unresolved.sort((a, b) => a.passengerId.localeCompare(b.passengerId)),
    warnings,
    splitGroupWarnings,
  };
}
