import { describe, expect, it } from 'vitest';
import {
  generateRoomingProposal,
  type RoomingProposalInput,
} from '../services/roomingProposal';

function makeInput(overrides: Partial<RoomingProposalInput> = {}): RoomingProposalInput {
  return {
    departureId: '10000000-0000-4000-8000-000000000001',
    slots: [
      { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      { id: 's2', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      { id: 's3', roomType: 'single', capacity: 1, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
    ],
    passengers: [
      { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
      { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
    ],
    existingAssignments: [],
    groups: [],
    ...overrides,
  };
}

describe('generateRoomingProposal', () => {
  it('is deterministic for the same input', () => {
    const input = makeInput();
    const a = generateRoomingProposal(input);
    const b = generateRoomingProposal(input);
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
    expect(a.proposedAssignments).toEqual(b.proposedAssignments);
  });

  it('produces the same result regardless of input ordering', () => {
    const base = makeInput();
    const shuffled = makeInput({
      passengers: [...base.passengers].reverse(),
      slots: [...base.slots].reverse(),
    });
    const a = generateRoomingProposal(base);
    const b = generateRoomingProposal(shuffled);
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
    expect(a.proposedAssignments.map((x) => x.passengerId)).toEqual(
      b.proposedAssignments.map((x) => x.passengerId),
    );
    expect(a.proposedAssignments.map((x) => x.slotId)).toEqual(
      b.proposedAssignments.map((x) => x.slotId),
    );
  });

  it('preserves manual/locked assignments', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: true, locked: true, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(1);
    expect(out.fixedAssignments[0].passengerId).toBe('p1');
    expect(out.fixedAssignments[0].slotId).toBe('s1');
    expect(out.summary.fixedManualLocked).toBe(1);
    expect(out.proposedAssignments.map((a) => a.passengerId)).toEqual(['p2']);
  });

  it('manual unlocked assignment is fixed (not replaceable)', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: true, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(1);
    expect(out.fixedAssignments[0].passengerId).toBe('p1');
    expect(out.replaceableAssignmentIds).toHaveLength(0);
    expect(out.proposedAssignments.map((a) => a.passengerId)).toEqual(['p2']);
  });

  it('locked non-manual assignment is fixed', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: true, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(1);
    expect(out.fixedAssignments[0].passengerId).toBe('p1');
    expect(out.replaceableAssignmentIds).toHaveLength(0);
    expect(out.proposedAssignments.map((a) => a.passengerId)).toEqual(['p2']);
  });

  it('replaceable assignments are only manual=false + locked=false', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(0);
    expect(out.replaceableAssignmentIds).toEqual(['as1']);
  });

  it('replaceable assignment old slot capacity is released for proposal', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p3', fullName: 'P3', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(2);
    expect(out.unresolved).toHaveLength(1);
  });

  it('never exceeds slot capacity', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p3', fullName: 'P3', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p4', fullName: 'P4', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p5', fullName: 'P5', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's2', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    const out = generateRoomingProposal(input);
    const perSlot = new Map<string, number>();
    for (const a of out.proposedAssignments) {
      perSlot.set(a.slotId, (perSlot.get(a.slotId) ?? 0) + 1);
    }
    for (const [slotId, count] of perSlot) {
      const slot = input.slots.find((s) => s.id === slotId)!;
      expect(count).toBeLessThanOrEqual(slot.capacity);
    }
    expect(out.unresolved).toHaveLength(1);
  });

  it('respects accommodation requirement (room type)', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'single' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's2', roomType: 'single', capacity: 1, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(1);
    expect(out.proposedAssignments[0].slotId).toBe('s2');
  });

  it('never duplicates a passenger', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
      ],
    });
    const out = generateRoomingProposal(input);
    const ids = out.proposedAssignments.map((a) => a.passengerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps same_room group together when possible', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      groups: [{ id: 'g1', name: 'Group A', accommodationPreference: 'same_room', passengerIds: ['p1', 'p2'] }],
    });
    const out = generateRoomingProposal(input);
    const assignedSlotIds = new Set(out.proposedAssignments.map((a) => a.slotId));
    expect(assignedSlotIds.size).toBe(1);
    expect(out.warnings).toHaveLength(0);
  });

  it('falls back with a warning when group preference is impossible', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p3', fullName: 'P3', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
      groups: [{ id: 'g1', name: 'Group A', accommodationPreference: 'same_room', passengerIds: ['p1', 'p2', 'p3'] }],
    });
    const out = generateRoomingProposal(input);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.unresolved).toHaveLength(1);
  });

  it('marks passengers unresolved when no compatible room exists', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'triple' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toBe('NO_COMPATIBLE_ROOM_CAPACITY');
  });

  it('passenger without accommodation requirement is unresolved', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toBe('NO_ACCOMMODATION_REQUIREMENT');
  });

  it('passenger with missing requirement mapping is unresolved', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toBe('PASSENGER_REQUIREMENT_UNASSIGNED');
  });

  it('keeps fingerprint stable for same state and changes for different state', () => {
    const base = makeInput();
    const same = makeInput();
    expect(generateRoomingProposal(base).stateFingerprint).toBe(
      generateRoomingProposal(same).stateFingerprint,
    );
    const changed = makeInput({
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: true, locked: true, passengerName: 'P1' },
      ],
    });
    expect(generateRoomingProposal(changed).stateFingerprint).not.toBe(
      generateRoomingProposal(base).stateFingerprint,
    );
  });

  it('fingerprint changes when slot allocation changes', () => {
    const base = makeInput();
    const changed = makeInput({
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a2', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    expect(generateRoomingProposal(changed).stateFingerprint).not.toBe(
      generateRoomingProposal(base).stateFingerprint,
    );
  });

  it('proposed assignments include slotLabel', () => {
    const input = makeInput({
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0, displayLabel: 'Double 01' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments[0].slotLabel).toBe('Double 01');
  });

  it('does not mutate its input', () => {
    const input = makeInput();
    const snapshot = JSON.stringify(input);
    generateRoomingProposal(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('M10.1 correctness', () => {
  it('manual=true locked=false → FIXED, not replaceable', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: true, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(1);
    expect(out.fixedAssignments[0].passengerId).toBe('p1');
    expect(out.replaceableAssignmentIds).toHaveLength(0);
    expect(out.summary.fixedManualLocked).toBe(1);
  });

  it('manual=false locked=true → FIXED', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: true, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(1);
    expect(out.replaceableAssignmentIds).toHaveLength(0);
  });

  it('manual=false locked=false → replaceable', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.fixedAssignments).toHaveLength(0);
    expect(out.replaceableAssignmentIds).toEqual(['as1']);
  });

  it('replaceable capacity released — old slot not consuming proposal capacity', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p3', fullName: 'P3', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's2', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: false, passengerName: 'P1' },
      ],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(3);
    const perSlot = new Map<string, number>();
    for (const a of out.proposedAssignments) {
      perSlot.set(a.slotId, (perSlot.get(a.slotId) ?? 0) + 1);
    }
    for (const [, count] of perSlot) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('passenger without any requirement fields → unresolved NO_ACCOMMODATION_REQUIREMENT', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'NR', hotelAllocationId: undefined, roomType: undefined },
      ],
      existingAssignments: [],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toBe('NO_ACCOMMODATION_REQUIREMENT');
  });

  it('passenger with hotelAllocationId but no roomType → PASSENGER_REQUIREMENT_UNASSIGNED', () => {
    const input = makeInput({
      passengers: [
        { id: 'p1', fullName: 'PR', hotelAllocationId: 'a1', roomType: undefined },
      ],
      existingAssignments: [],
    });
    const out = generateRoomingProposal(input);
    expect(out.proposedAssignments).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toBe('PASSENGER_REQUIREMENT_UNASSIGNED');
  });

  it('fingerprint changes when slot capacity changes', () => {
    const base = makeInput();
    const changed = makeInput({
      slots: [
        { id: 's1', roomType: 'double', capacity: 3, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's2', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's3', roomType: 'single', capacity: 1, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    expect(generateRoomingProposal(base).stateFingerprint).not.toBe(
      generateRoomingProposal(changed).stateFingerprint,
    );
  });

  it('fingerprint changes when assignment isManual changes', () => {
    const base = makeInput({
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: false, locked: false, passengerName: 'P1' },
      ],
    });
    const changed = makeInput({
      existingAssignments: [
        { id: 'as1', passengerId: 'p1', slotId: 's1', isManual: true, locked: false, passengerName: 'P1' },
      ],
    });
    expect(generateRoomingProposal(base).stateFingerprint).not.toBe(
      generateRoomingProposal(changed).stateFingerprint,
    );
  });

  it('proposed assignments include slotLabel', () => {
    const input = makeInput();
    const out = generateRoomingProposal(input);
    for (const a of out.proposedAssignments) {
      expect(a).toHaveProperty('slotLabel');
      expect(typeof a.slotLabel).toBe('string');
    }
  });

  it('shuffled input produces identical proposed assignment ordering (determinism)', () => {
    const base = makeInput({
      passengers: [
        { id: 'p1', fullName: 'P1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p2', fullName: 'P2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p3', fullName: 'P3', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'p4', fullName: 'P4', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
        { id: 's2', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
    });
    const shuffled = makeInput({
      passengers: [...base.passengers].reverse(),
      slots: [...base.slots].reverse(),
    });
    expect(generateRoomingProposal(base).proposedAssignments).toEqual(
      generateRoomingProposal(shuffled).proposedAssignments,
    );
  });

  it('shuffled input with two competing groups produces identical full output', () => {
    const base = makeInput({
      passengers: [
        { id: 'pa1', fullName: 'A1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'pa2', fullName: 'A2', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'pb1', fullName: 'B1', hotelAllocationId: 'a1', roomType: 'double' },
        { id: 'pb2', fullName: 'B2', hotelAllocationId: 'a1', roomType: 'double' },
      ],
      slots: [
        { id: 's1', roomType: 'double', capacity: 2, hotelAllocationId: 'a1', hotelId: 'h1', assignedCount: 0 },
      ],
      groups: [
        { id: 'ga', name: 'Group A', accommodationPreference: 'same_room', passengerIds: ['pa1', 'pa2'] },
        { id: 'gb', name: 'Group B', accommodationPreference: 'same_room', passengerIds: ['pb1', 'pb2'] },
      ],
    });
    const shuffled = makeInput({
      passengers: [...base.passengers].reverse(),
      slots: [...base.slots].reverse(),
      groups: [...base.groups].reverse(),
    });
    const a = generateRoomingProposal(base);
    const b = generateRoomingProposal(shuffled);
    expect(a.proposedAssignments).toEqual(b.proposedAssignments);
    expect(a.unresolved).toEqual(b.unresolved);
    expect(a.warnings).toEqual(b.warnings);
    expect(a.fixedAssignments).toEqual(b.fixedAssignments);
    expect(a.replaceableAssignmentIds).toEqual(b.replaceableAssignmentIds);
    expect(a.stateFingerprint).toBe(b.stateFingerprint);
  });
});
