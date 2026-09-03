import { createHash } from 'node:crypto';

export interface RoomingProposalInput {
  departureId: string;
  slots: {
    id: string;
    roomType: string;
    capacity: number;
    hotelAllocationId: string;
    hotelId: string;
    slotNumber?: number | null;
    assignedCount: number;
    displayLabel?: string;
  }[];
  passengers: {
    id: string;
    fullName: string;
    hotelAllocationId?: string;
    hotelId?: string;
    roomType?: string;
    groupId?: string;
    groupAccommodationPreference?: string;
    groupColor?: string;
    reservationHasAccommodation?: boolean;
    groupName?: string;
  }[];
  existingAssignments: {
    id: string;
    passengerId: string;
    slotId: string;
    isManual: boolean;
    locked: boolean;
    passengerName: string;
  }[];
  groups: {
    id: string;
    name: string;
    accommodationPreference: string;
    color?: string;
    passengerIds: string[];
  }[];
}

export interface ProposedAssignment {
  passengerId: string;
  passengerName: string;
  slotId: string;
  slotLabel?: string;
  reason: 'manual_locked' | 'same_room_group' | 'preference_match' | 'capacity_fill';
}

export interface UnresolvedPassenger {
  passengerId: string;
  passengerName: string;
  reason:
    | 'PASSENGER_REQUIREMENT_UNASSIGNED'
    | 'NO_ACCOMMODATION_REQUIREMENT'
    | 'NO_COMPATIBLE_ROOM_CAPACITY';
  message: string;
}

export interface RoomingProposalOutput {
  departureId: string;
  stateFingerprint: string;
  summary: {
    totalPassengers: number;
    fixedManualLocked: number;
    proposedNew: number;
    unresolved: number;
  };
  fixedAssignments: ProposedAssignment[];
  replaceableAssignmentIds: string[];
  proposedAssignments: ProposedAssignment[];
  unresolved: UnresolvedPassenger[];
  warnings: string[];
}

function stableSlotKey(slot: RoomingProposalInput['slots'][number]): string {
  return [
    slot.hotelAllocationId ?? '',
    slot.roomType ?? '',
    String(slot.slotNumber ?? ''),
    slot.id,
  ].join('|');
}

function computeFingerprint(
  departureId: string,
  slots: RoomingProposalInput['slots'],
  passengers: RoomingProposalInput['passengers'],
  existingAssignments: RoomingProposalInput['existingAssignments'],
  groups: RoomingProposalInput['groups'],
): string {
  const material = JSON.stringify({
    departureId,
    slots: slots
      .map((s) => ({
        id: s.id,
        hotelId: s.hotelId,
        hotelAllocationId: s.hotelAllocationId,
        roomType: s.roomType,
        slotNumber: s.slotNumber ?? null,
        capacity: s.capacity,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    passengerIds: passengers.map((p) => p.id).sort(),
    passengerRequirements: passengers
      .map((p) => ({
        id: p.id,
        hotelAllocationId: p.hotelAllocationId ?? null,
        hotelId: p.hotelId ?? null,
        roomType: p.roomType ?? null,
        groupId: p.groupId ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    passengerReservationAccommodation: passengers
      .map((p) => ({ id: p.id, reservationHasAccommodation: p.reservationHasAccommodation ?? false }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    assignments: existingAssignments
      .map((a) => ({
        id: a.id,
        passengerId: a.passengerId,
        slotId: a.slotId,
        locked: a.locked,
        isManual: a.isManual,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    groups: groups
      .map((g) => ({
        id: g.id,
        accommodationPreference: g.accommodationPreference,
        passengerIds: [...g.passengerIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

export function generateRoomingProposal(input: RoomingProposalInput): RoomingProposalOutput {
  const { departureId, slots, passengers, existingAssignments, groups } = input;

  const fingerprint = computeFingerprint(departureId, slots, passengers, existingAssignments, groups);

  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const existingAssignmentMap = new Map<string, (typeof existingAssignments)[number]>();
  function labelForSlot(slotId: string): string { const slot = slotMap.get(slotId); return slot?.displayLabel ?? (slot?.roomType ?? slotId); }
  for (const a of existingAssignments) {
    existingAssignmentMap.set(a.passengerId, a);
  }

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const passengerGroups = new Map<string, string>();
  for (const g of groups) {
    for (const pid of g.passengerIds) {
      passengerGroups.set(pid, g.id);
    }
  }

  // FIXED = isManual OR locked. REPLACEABLE = manual=false AND locked=false.
  const fixedAssignments: ProposedAssignment[] = [];
  const replaceableAssignmentIds: string[] = [];
  const fixedSlotOccupancy = new Map<string, number>();

  for (const a of existingAssignments) {
    const slotLabel = labelForSlot(a.slotId);
    if (a.isManual || a.locked) {
      fixedAssignments.push({
        passengerId: a.passengerId,
        passengerName: a.passengerName,
        slotId: a.slotId,
        slotLabel,
        reason: 'manual_locked',
      });
      fixedSlotOccupancy.set(a.slotId, (fixedSlotOccupancy.get(a.slotId) ?? 0) + 1);
    } else {
      replaceableAssignmentIds.push(a.id);
    }
  }

  const fixedPassengerIds = new Set(fixedAssignments.map((a) => a.passengerId));
  const replaceableAssignmentIdSet = new Set(replaceableAssignmentIds);

  // Only FIXED existing assignments consume proposal capacity. Replaceable
  // automatic assignments are being replanned, so their old slots are released.
  const pendingSlotOccupancy = new Map<string, number>(fixedSlotOccupancy);

  const unresolved: UnresolvedPassenger[] = [];
  const proposedAssignments: ProposedAssignment[] = [];
  const warnings: string[] = [];
  const proposedPassengerIds = new Set<string>();
  const usedSlotOccupancy = new Map<string, number>();

  function remainingCapacity(slotId: string): number {
    const slot = slotMap.get(slotId);
    if (!slot) return 0;
    const occupied = (usedSlotOccupancy.get(slotId) ?? 0) + (pendingSlotOccupancy.get(slotId) ?? 0);
    return Math.max(0, slot.capacity - occupied);
  }

  function hasFullRequirement(p: (typeof passengers)[number]): boolean {
    return Boolean(p.hotelAllocationId && p.roomType);
  }

  function slotCompatible(slotId: string, p: (typeof passengers)[number]): boolean {
    const slot = slotMap.get(slotId);
    if (!slot) return false;
    if (p.hotelAllocationId && p.hotelAllocationId !== slot.hotelAllocationId) return false;
    if (p.hotelId && p.hotelId !== slot.hotelId) return false;
    if (p.roomType && p.roomType !== slot.roomType) return false;
    return true;
  }

  function assignToSlot(p: (typeof passengers)[number], slotId: string, reason: ProposedAssignment['reason']) {
    proposedAssignments.push({
      passengerId: p.id,
      passengerName: p.fullName,
      slotId,
      slotLabel: labelForSlot(slotId),
      reason,
    });
    proposedPassengerIds.add(p.id);
    usedSlotOccupancy.set(slotId, (usedSlotOccupancy.get(slotId) ?? 0) + 1);
  }

  // Stable slot ordering: hotelAllocationId, roomType, slotNumber, slotId.
  const slotOrder = [...slots].sort((a, b) => stableSlotKey(a).localeCompare(stableSlotKey(b)));

  // Determine which passengers are (re)planned: not fixed, and either unassigned
  // or currently in a replaceable (automatic) assignment.
  const passengersToPropose = passengers.filter((p) => {
    if (fixedPassengerIds.has(p.id)) return false;
    const existing = existingAssignmentMap.get(p.id);
    if (existing && !replaceableAssignmentIdSet.has(existing.id)) return false;
    return true;
  });

  const groupPassengers = new Map<string, (typeof passengersToPropose)[number][]>();
  for (const p of passengersToPropose) {
    const groupId = passengerGroups.get(p.id);
    if (groupId) {
      if (!groupPassengers.has(groupId)) groupPassengers.set(groupId, []);
      groupPassengers.get(groupId)!.push(p);
    }
  }

  function resolveUnresolved(p: (typeof passengers)[number], reason: UnresolvedPassenger['reason'], message: string) {
    unresolved.push({ passengerId: p.id, passengerName: p.fullName, reason, message });
  }

  // Classify passengers without a sold accommodation requirement BEFORE proposing.
  const eligibleForProposal = new Set<string>();
  for (const p of passengersToPropose) {
    if (!p.reservationHasAccommodation) {
      // Distinguish "no requirement" vs "requirement exists but not mapped".
      if (!p.hotelAllocationId && !p.hotelId && !p.roomType) {
        resolveUnresolved(p, 'NO_ACCOMMODATION_REQUIREMENT', `${p.fullName} has no accommodation requirement`);
      } else if (!hasFullRequirement(p)) {
        resolveUnresolved(p, 'PASSENGER_REQUIREMENT_UNASSIGNED', `${p.fullName} has no mapped room requirement`);
      } else {
        eligibleForProposal.add(p.id);
      }
    } else {
      eligibleForProposal.add(p.id);
    }
  }

  const sortedGroupEntries = [...groupPassengers.entries()].sort(([aId], [bId]) => aId.localeCompare(bId));
  for (const [groupId, members] of sortedGroupEntries) {
    const group = groupById.get(groupId);
    const pref = group?.accommodationPreference || 'no_preference';
    const isSameRoom = pref === 'same_room';
    const sortedMembers = members
      .filter((p) => eligibleForProposal.has(p.id))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (isSameRoom && sortedMembers.length > 0) {
      let placed = false;
      for (const slot of slotOrder) {
        const allCompatible = sortedMembers.every((p) => slotCompatible(slot.id, p));
        if (allCompatible && remainingCapacity(slot.id) >= sortedMembers.length) {
          for (const p of sortedMembers) {
            assignToSlot(p, slot.id, 'same_room_group');
          }
          placed = true;
          break;
        }
      }
      if (!placed) {
        warnings.push(
          `Group "${group?.name ?? groupId}" (same_room preference) could not be placed together — falling back to best-effort placement`,
        );
        for (const p of sortedMembers) {
          let assigned = false;
          for (const slot of slotOrder) {
            if (slotCompatible(slot.id, p) && remainingCapacity(slot.id) > 0) {
              assignToSlot(p, slot.id, 'preference_match');
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            resolveUnresolved(p, 'NO_COMPATIBLE_ROOM_CAPACITY', `No compatible room with available capacity for ${p.fullName}`);
          }
        }
      }
      continue;
    }

    for (const p of sortedMembers) {
      let assigned = false;
      for (const slot of slotOrder) {
        if (slotCompatible(slot.id, p) && remainingCapacity(slot.id) > 0) {
          assignToSlot(p, slot.id, 'preference_match');
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        resolveUnresolved(p, 'NO_COMPATIBLE_ROOM_CAPACITY', `No compatible room with available capacity for ${p.fullName}`);
      }
    }
  }

  const ungroupedProposed = passengersToPropose
    .filter((p) => !passengerGroups.has(p.id))
    .filter((p) => eligibleForProposal.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const p of ungroupedProposed) {
    let assigned = false;
    for (const slot of slotOrder) {
      if (slotCompatible(slot.id, p) && remainingCapacity(slot.id) > 0) {
        assignToSlot(p, slot.id, 'capacity_fill');
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      resolveUnresolved(p, 'NO_COMPATIBLE_ROOM_CAPACITY', `No compatible room with available capacity for ${p.fullName}`);
    }
  }

  return {
    departureId,
    stateFingerprint: fingerprint,
    summary: {
      totalPassengers: passengers.length,
      fixedManualLocked: fixedAssignments.length,
      proposedNew: proposedAssignments.length,
      unresolved: unresolved.length,
    },
    fixedAssignments: fixedAssignments.sort((a, b) => a.passengerId.localeCompare(b.passengerId)),
    replaceableAssignmentIds: [...replaceableAssignmentIds].sort(),
    proposedAssignments,
    unresolved: unresolved.sort((a, b) => a.passengerId.localeCompare(b.passengerId)),
    warnings,
  };
}
