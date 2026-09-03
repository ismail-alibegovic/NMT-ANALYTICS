import { createHash } from 'node:crypto';

export interface RoomingProposalInput {
  departureId: string;
  slots: {
    id: string;
    roomType: string;
    capacity: number;
    hotelAllocationId: string;
    hotelId: string;
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
      .map((s) => ({ id: s.id, capacity: s.capacity, assignedCount: s.assignedCount }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    passengerIds: passengers.map((p) => p.id).sort(),
    passengerRequirements: passengers
      .map((p) => ({
        id: p.id,
        hotelAllocationId: p.hotelAllocationId,
        hotelId: p.hotelId,
        roomType: p.roomType,
        groupId: p.groupId,
      }))
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
  const existingAssignmentMap = new Map<string, typeof existingAssignments[0]>();
  const existingSlotOccupancy = new Map<string, number>();

  for (const a of existingAssignments) {
    existingAssignmentMap.set(a.passengerId, a);
    if (a.slotId) {
      existingSlotOccupancy.set(a.slotId, (existingSlotOccupancy.get(a.slotId) ?? 0) + 1);
    }
  }

  const fixedAssignments: ProposedAssignment[] = [];
  const replaceableAssignmentIds: string[] = [];
  const proposedAssignments: ProposedAssignment[] = [];
  const unresolved: UnresolvedPassenger[] = [];
  const warnings: string[] = [];

  const pendingSlotOccupancy = new Map<string, number>();
  for (const [slotId, count] of existingSlotOccupancy) {
    pendingSlotOccupancy.set(slotId, count);
  }

  const passengerRequirementMap = new Map(
    passengers.map((p) => [p.id, p]),
  );

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const passengerGroups = new Map<string, string>();
  for (const g of groups) {
    for (const pid of g.passengerIds) {
      passengerGroups.set(pid, g.id);
    }
  }

  for (const a of existingAssignments) {
    if (a.locked) {
      fixedAssignments.push({
        passengerId: a.passengerId,
        passengerName: a.passengerName,
        slotId: a.slotId,
        reason: 'manual_locked',
      });
    } else {
      replaceableAssignmentIds.push(a.id);
    }
  }

  const fixedPassengerIds = new Set(fixedAssignments.map((a) => a.passengerId));

  const unassigned = passengers.filter(
    (p) => !existingAssignmentMap.has(p.id) && !fixedPassengerIds.has(p.id),
  );

  const unlockedAssignmentIds = new Set(replaceableAssignmentIds);

  const passengersToPropose: typeof passengers = [
    ...unassigned,
    ...passengers.filter((p) => unlockedAssignmentIds.has(existingAssignmentMap.get(p.id)?.id ?? '')),
  ];

  const groupPassengers = new Map<string, (typeof passengersToPropose)[number][]>();
  for (const p of passengersToPropose) {
    const groupId = passengerGroups.get(p.id);
    if (groupId) {
      if (!groupPassengers.has(groupId)) groupPassengers.set(groupId, []);
      groupPassengers.get(groupId)!.push(p);
    }
  }

  const proposedPassengerIds = new Set<string>();
  const usedSlotOccupancy = new Map<string, number>();

  function remainingCapacity(slotId: string): number {
    const slot = slotMap.get(slotId);
    if (!slot) return 0;
    const occupied = (usedSlotOccupancy.get(slotId) ?? 0) + (pendingSlotOccupancy.get(slotId) ?? 0);
    return Math.max(0, slot.capacity - occupied);
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
      reason,
    });
    proposedPassengerIds.add(p.id);
    usedSlotOccupancy.set(slotId, (usedSlotOccupancy.get(slotId) ?? 0) + 1);
  }

  const slotOrder = [...slots]
    .sort((a, b) => (b.capacity - (usedSlotOccupancy.get(b.id) ?? 0)) - (a.capacity - (usedSlotOccupancy.get(a.id) ?? 0)));

  for (const [groupId, members] of groupPassengers) {
    const group = groupById.get(groupId);
    const pref = group?.accommodationPreference || 'no_preference';
    const isSameRoom = pref === 'same_room';
    const sortedMembers = [...members].sort((a, b) => a.id.localeCompare(b.id));

    if (isSameRoom && sortedMembers.length > 0) {
      let placed = false;
      for (const slot of slotOrder) {
        const cap = remainingCapacity(slot.id);
        const allCompatible = sortedMembers.every((p) => slotCompatible(slot.id, p));
        if (allCompatible && cap >= sortedMembers.length) {
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
          if (proposedPassengerIds.has(p.id)) continue;
          let assigned = false;
          for (const slot of slotOrder) {
            if (slotCompatible(slot.id, p) && remainingCapacity(slot.id) > 0) {
              assignToSlot(p, slot.id, 'preference_match');
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            unresolved.push({
              passengerId: p.id,
              passengerName: p.fullName,
              reason: 'NO_COMPATIBLE_ROOM_CAPACITY',
              message: `No compatible room with available capacity for ${p.fullName}`,
            });
          }
        }
      }
      continue;
    }

    for (const p of sortedMembers) {
      if (proposedPassengerIds.has(p.id)) continue;
      let assigned = false;
      for (const slot of slotOrder) {
        if (slotCompatible(slot.id, p) && remainingCapacity(slot.id) > 0) {
          assignToSlot(p, slot.id, 'preference_match');
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        unresolved.push({
          passengerId: p.id,
          passengerName: p.fullName,
          reason: 'NO_COMPATIBLE_ROOM_CAPACITY',
          message: `No compatible room with available capacity for ${p.fullName}`,
        });
      }
    }
  }

  const ungroupedProposed = passengersToPropose.filter(
    (p) => !passengerGroups.has(p.id) && !proposedPassengerIds.has(p.id),
  );

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
      unresolved.push({
        passengerId: p.id,
        passengerName: p.fullName,
        reason: 'NO_COMPATIBLE_ROOM_CAPACITY',
        message: `No compatible room with available capacity for ${p.fullName}`,
      });
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
    fixedAssignments,
    replaceableAssignmentIds,
    proposedAssignments,
    unresolved,
    warnings,
  };
}
