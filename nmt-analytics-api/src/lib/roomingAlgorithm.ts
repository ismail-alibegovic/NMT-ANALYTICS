// Phase 6C — Group-Aware Auto-Rooming Algorithm
// Pure function: takes canonical data, returns a proposal. Does NOT write to DB.

export interface RoomingPassenger {
  id: string;
  fullName: string;
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
  accommodationPreference?: string | null;
}

export interface RoomingRoom {
  id: string;
  roomNumber: string;
  type: string;
  capacity: number;
  occupied: number;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorNumber: number;
  floorLabel?: string | null;
}

export interface RoomingGroup {
  id: string;
  name?: string | null;
  color?: string | null;
  accommodationPreference: string;
  memberIds: string[];
}

export interface ProposedAssignment {
  passengerId: string;
  passengerName: string;
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
  roomId: string;
  roomNumber: string;
  buildingName: string;
  floorNumber: number;
  floorLabel?: string | null;
}

export interface GroupResult {
  groupId: string;
  groupName?: string | null;
  groupColor?: string | null;
  status: 'together' | 'partial' | 'split' | 'unassigned';
  assignedRoomIds: string[];
  memberCount: number;
  assignedCount: number;
}

export interface RoomingSummary {
  totalPassengers: number;
  passengersProposed: number;
  groupsTogether: number;
  groupsSplit: number;
  unplacedCount: number;
  remainingCapacity: number;
}

export interface RoomingProposal {
  assignments: ProposedAssignment[];
  groupResults: GroupResult[];
  unplaced: RoomingPassenger[];
  warnings: string[];
  summary: RoomingSummary;
}

const PREFERENCE_PRIORITY: Record<string, number> = {
  same_room: 0,
  adjacent_rooms: 1,
  same_floor: 2,
  nearby: 3,
  no_preference: 4,
};

function remainingCapacity(room: RoomingRoom): number {
  return room.capacity - room.occupied;
}

function roomsByPreference(rooms: RoomingRoom[], preference: string, occupiedRoomIds: Set<string>): RoomingRoom[] {
  const avail = rooms.filter(r => remainingCapacity(r) > 0 && !occupiedRoomIds.has(r.id));
  if (preference === 'same_floor') {
    const floorCounts = new Map<number, RoomingRoom[]>();
    for (const r of avail) {
      const arr = floorCounts.get(r.floorNumber) || [];
      arr.push(r);
      floorCounts.set(r.floorNumber, arr);
    }
    const bestFloor = [...floorCounts.values()].sort((a, b) => b.length - a.length)[0] || [];
    return bestFloor.sort((a, b) => a.capacity - b.capacity);
  }
  return avail.sort((a, b) => a.capacity - b.capacity);
}

function tryFitGroupInOneRoom(rooms: RoomingRoom[], groupSize: number): RoomingRoom | null {
  const fit = rooms.filter(r => remainingCapacity(r) >= groupSize);
  if (fit.length === 0) return null;
  return fit.sort((a, b) => remainingCapacity(a) - remainingCapacity(b))[0];
}

function tryFitGroupInMultipleRooms(
  rooms: RoomingRoom[],
  groupSize: number,
  preferSameFloor: boolean,
  preferSameBuilding: boolean,
): RoomingRoom[] | null {
  let candidates = [...rooms];
  if (preferSameBuilding) {
    const byBuilding = new Map<string, RoomingRoom[]>();
    for (const r of candidates) {
      const arr = byBuilding.get(r.buildingId) || [];
      arr.push(r);
      byBuilding.set(r.buildingId, arr);
    }
    candidates = [...byBuilding.values()].sort((a, b) => totalCap(b) - totalCap(a))[0] || candidates;
  }
  if (preferSameFloor) {
    const byFloor = new Map<string, RoomingRoom[]>();
    for (const r of candidates) {
      const key = `${r.buildingId}:${r.floorNumber}`;
      const arr = byFloor.get(key) || [];
      arr.push(r);
      byFloor.set(key, arr);
    }
    candidates = [...byFloor.values()].sort((a, b) => totalCap(b) - totalCap(a))[0] || candidates;
  }

  const sorted = candidates.sort((a, b) => remainingCapacity(b) - remainingCapacity(a));
  const selected: RoomingRoom[] = [];
  let remaining = groupSize;
  for (const r of sorted) {
    const cap = remainingCapacity(r);
    if (cap <= 0) continue;
    selected.push(r);
    remaining -= cap;
    if (remaining <= 0) return selected;
  }
  return remaining <= 0 ? selected : null;
}

function totalCap(rooms: RoomingRoom[]): number {
  return rooms.reduce((sum, r) => sum + remainingCapacity(r), 0);
}

export function generateRoomingProposal(
  passengers: RoomingPassenger[],
  rooms: RoomingRoom[],
  groups: RoomingGroup[],
): RoomingProposal {
  const passengerMap = new Map(passengers.map(p => [p.id, p]));
  const unplacedPassengerIds = new Set(passengers.map(p => p.id));
  const occupiedRoomIds = new Set<string>();
  const assignments: ProposedAssignment[] = [];
  const warnings: string[] = [];

  const groupMap = new Map<string, RoomingGroup>();
  for (const g of groups) groupMap.set(g.id, g);

  const groupPassengers = new Map<string, RoomingPassenger[]>();
  const groupPrefs = new Map<string, string>();
  for (const p of passengers) {
    if (p.groupId && groupMap.has(p.groupId)) {
      const arr = groupPassengers.get(p.groupId) || [];
      arr.push(p);
      groupPassengers.set(p.groupId, arr);
    }
  }

  if (groupPassengers.size > 0) {
    for (const [gid, members] of groupPassengers) {
      const g = groupMap.get(gid)!;
      if (g.accommodationPreference) groupPrefs.set(gid, g.accommodationPreference);
    }
  }

  const sortedGroups = [...groupPassengers.entries()].sort(([, a], [, b]) => {
    const pa = PREFERENCE_PRIORITY[groupPrefs.get(a[0].groupId!) || 'no_preference'] ?? 99;
    const pb = PREFERENCE_PRIORITY[groupPrefs.get(b[0].groupId!) || 'no_preference'] ?? 99;
    return pa - pb;
  });

  const buildingMap = new Map<string, { name: string; rooms: RoomingRoom[] }>();
  for (const r of rooms) {
    const entry = buildingMap.get(r.buildingId) || { name: r.buildingName, rooms: [] };
    entry.rooms.push(r);
    buildingMap.set(r.buildingId, entry);
  }

  for (const [groupId, members] of sortedGroups) {
    const group = groupMap.get(groupId)!;
    const pref = group.accommodationPreference || 'prefer_together';
    const groupSize = members.length;

    let roomsForGroup = rooms.filter(r => remainingCapacity(r) > 0);

    if (pref === 'same_room') {
      const singleRoom = tryFitGroupInOneRoom(roomsForGroup, groupSize);
      if (singleRoom) {
        for (const p of members) {
          if (!unplacedPassengerIds.has(p.id)) continue;
          assignments.push({
            passengerId: p.id, passengerName: p.fullName,
            groupId, groupName: group.name, groupColor: group.color,
            roomId: singleRoom.id, roomNumber: singleRoom.roomNumber,
            buildingName: singleRoom.buildingName,
            floorNumber: singleRoom.floorNumber,
            floorLabel: singleRoom.floorLabel,
          });
          singleRoom.occupied++;
          unplacedPassengerIds.delete(p.id);
        }
        occupiedRoomIds.add(singleRoom.id);
      } else {
        warnings.push(`Group "${group.name || groupId}" (${groupSize}p) preference: same_room — no single room with ${groupSize} free capacity`);
        const multi = tryFitGroupInMultipleRooms(roomsForGroup, groupSize, true, true);
        if (multi) {
          placeGroupInRooms(members, multi, group, assignments, unplacedPassengerIds, occupiedRoomIds);
        }
      }
      continue;
    }

    if (pref === 'same_floor' || pref === 'adjacent_rooms') {
      const sameFloor = tryFitGroupInMultipleRooms(
        roomsForGroup.filter(r => {
          const b = buildingMap.get(r.buildingId);
          if (!b) return false;
          const floorRoomCount = b.rooms.filter(br => br.floorNumber === r.floorNumber && remainingCapacity(br) > 0).length;
          return remainingCapacity(r) > 0 && floorRoomCount > 0;
        }),
        groupSize, true, pref === 'adjacent_rooms',
      );
      if (sameFloor) {
        placeGroupInRooms(members, sameFloor, group, assignments, unplacedPassengerIds, occupiedRoomIds);
        continue;
      }
      warnings.push(`Group "${group.name || groupId}" (${groupSize}p) preference: ${pref} — could not fit on single floor, falling back`);
    }

    const multi = tryFitGroupInMultipleRooms(roomsForGroup, groupSize, false, true);
    if (multi) {
      placeGroupInRooms(members, multi, group, assignments, unplacedPassengerIds, occupiedRoomIds);
    } else if (pref === 'same_room') {
      // tried and warned already above
    }
  }

  const soloPassengers = passengers.filter(p => unplacedPassengerIds.has(p.id) && !p.groupId);
  const availRooms = rooms.filter(r => remainingCapacity(r) > 0).sort((a, b) => remainingCapacity(a) - remainingCapacity(b));
  for (const solo of soloPassengers) {
    const room = availRooms.find(r => remainingCapacity(r) > 0 && !occupiedRoomIds.has(r.id)) || availRooms.find(r => remainingCapacity(r) > 0);
    if (room) {
      assignments.push({
        passengerId: solo.id, passengerName: solo.fullName,
        groupId: null, groupName: null, groupColor: null,
        roomId: room.id, roomNumber: room.roomNumber,
        buildingName: room.buildingName,
        floorNumber: room.floorNumber,
        floorLabel: room.floorLabel,
      });
      room.occupied++;
      unplacedPassengerIds.delete(solo.id);
    }
  }

  const unplaced = passengers.filter(p => unplacedPassengerIds.has(p.id));
  if (unplaced.length > 0) {
    warnings.push(`${unplaced.length} passenger(s) could not be placed — insufficient total capacity`);
  }

  const groupResults: GroupResult[] = [];
  for (const [groupId, g] of groupMap) {
    const members = groupPassengers.get(groupId) || [];
    const assignedRoomIds = new Set(assignments.filter(a => a.groupId === groupId).map(a => a.roomId));
    const assignedCount = members.filter(m => assignments.some(a => a.passengerId === m.id)).length;
    const status: GroupResult['status'] =
      assignedCount === 0 ? 'unassigned' :
      assignedRoomIds.size === 1 && assignedCount === members.length ? 'together' :
      assignedRoomIds.size > 1 ? 'split' : 'partial';
    groupResults.push({
      groupId, groupName: g.name, groupColor: g.color, status,
      assignedRoomIds: [...assignedRoomIds],
      memberCount: members.length,
      assignedCount,
    });
  }

  const summary: RoomingSummary = {
    totalPassengers: passengers.length,
    passengersProposed: assignments.length,
    groupsTogether: groupResults.filter(g => g.status === 'together').length,
    groupsSplit: groupResults.filter(g => g.status === 'split').length,
    unplacedCount: unplaced.length,
    remainingCapacity: rooms.reduce((s, r) => s + remainingCapacity(r), 0),
  };

  return { assignments, groupResults, unplaced, warnings, summary };
}

function placeGroupInRooms(
  members: RoomingPassenger[],
  roomList: RoomingRoom[],
  group: RoomingGroup,
  assignments: ProposedAssignment[],
  unplacedIds: Set<string>,
  occupiedRoomIds: Set<string>,
) {
  let memberIdx = 0;
  for (const room of roomList) {
    while (memberIdx < members.length && remainingCapacity(room) > 0) {
      const p = members[memberIdx];
      if (!unplacedIds.has(p.id)) { memberIdx++; continue; }
      assignments.push({
        passengerId: p.id, passengerName: p.fullName,
        groupId: group.id, groupName: group.name, groupColor: group.color,
        roomId: room.id, roomNumber: room.roomNumber,
        buildingName: room.buildingName,
        floorNumber: room.floorNumber,
        floorLabel: room.floorLabel,
      });
      room.occupied++;
      occupiedRoomIds.add(room.id);
      unplacedIds.delete(p.id);
      memberIdx++;
    }
    if (memberIdx >= members.length) break;
  }
}
