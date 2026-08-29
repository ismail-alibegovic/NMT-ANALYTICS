import { describe, expect, it } from 'vitest'
import { generateRoomingProposal, type RoomingGroup, type RoomingPassenger, type RoomingRoom } from '../lib/roomingAlgorithm'

const ROOM_A = '40000000-0000-4000-8000-000000000001'
const ROOM_B = '40000000-0000-4000-8000-000000000002'
const ROOM_C = '40000000-0000-4000-8000-000000000003'
const GROUP_A = '70000000-0000-4000-8000-000000000001'
const GROUP_B = '70000000-0000-4000-8000-000000000002'

function buildRooms(): RoomingRoom[] {
  return [
    {
      id: ROOM_B,
      roomNumber: '102',
      type: 'double',
      capacity: 2,
      occupied: 0,
      buildingId: '50000000-0000-4000-8000-000000000001',
      buildingName: 'Hotel Alpha',
      floorId: '60000000-0000-4000-8000-000000000002',
      floorNumber: 1,
      floorLabel: '1',
    },
    {
      id: ROOM_A,
      roomNumber: '101',
      type: 'double',
      capacity: 2,
      occupied: 0,
      buildingId: '50000000-0000-4000-8000-000000000001',
      buildingName: 'Hotel Alpha',
      floorId: '60000000-0000-4000-8000-000000000001',
      floorNumber: 1,
      floorLabel: '1',
    },
    {
      id: ROOM_C,
      roomNumber: '201',
      type: 'single',
      capacity: 1,
      occupied: 0,
      buildingId: '50000000-0000-4000-8000-000000000002',
      buildingName: 'Hotel Beta',
      floorId: '60000000-0000-4000-8000-000000000003',
      floorNumber: 2,
      floorLabel: '2',
    },
  ]
}

function buildPassengers(): RoomingPassenger[] {
  return [
    { id: '30000000-0000-4000-8000-000000000003', fullName: 'Solo Three' },
    { id: '30000000-0000-4000-8000-000000000002', fullName: 'Group A Two', groupId: GROUP_A, groupName: 'Group A', groupColor: '#ff9900' },
    { id: '30000000-0000-4000-8000-000000000004', fullName: 'Group B One', groupId: GROUP_B, groupName: 'Group B', groupColor: '#00aaff' },
    { id: '30000000-0000-4000-8000-000000000001', fullName: 'Group A One', groupId: GROUP_A, groupName: 'Group A', groupColor: '#ff9900' },
  ]
}

function buildGroups(): RoomingGroup[] {
  return [
    {
      id: GROUP_B,
      name: 'Group B',
      color: '#00aaff',
      accommodationPreference: 'adjacent_rooms',
      memberIds: ['30000000-0000-4000-8000-000000000004'],
    },
    {
      id: GROUP_A,
      name: 'Group A',
      color: '#ff9900',
      accommodationPreference: 'same_room',
      memberIds: ['30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001'],
    },
  ]
}

function mappingSignature(
  proposal: ReturnType<typeof generateRoomingProposal>,
): Array<{ passengerId: string; roomId: string }> {
  return proposal.assignments
    .map((assignment) => ({ passengerId: assignment.passengerId, roomId: assignment.roomId }))
    .sort((a, b) => a.passengerId.localeCompare(b.passengerId))
}

describe('generateRoomingProposal determinism', () => {
  it('produces the same mapping when equal-capacity rooms arrive in different orders', () => {
    const passengers = buildPassengers()
    const groups = buildGroups()
    const forward = generateRoomingProposal(passengers, buildRooms(), groups)
    const reversedRooms = generateRoomingProposal(passengers, [...buildRooms()].reverse(), groups)

    expect(mappingSignature(reversedRooms)).toEqual(mappingSignature(forward))
  })

  it('produces the same mapping when passengers and groups arrive in different orders', () => {
    const rooms = buildRooms()
    const forward = generateRoomingProposal(buildPassengers(), rooms, buildGroups())
    const scrambled = generateRoomingProposal(
      [...buildPassengers()].reverse(),
      rooms,
      [...buildGroups()].reverse(),
    )

    expect(mappingSignature(scrambled)).toEqual(mappingSignature(forward))
  })

  it('keeps same-room group behavior intact while remaining deterministic', () => {
    const proposal = generateRoomingProposal(buildPassengers(), buildRooms(), buildGroups())
    const groupAssignments = proposal.assignments.filter((assignment) => assignment.groupId === GROUP_A)

    expect(groupAssignments).toHaveLength(2)
    expect(new Set(groupAssignments.map((assignment) => assignment.roomId))).toEqual(new Set([ROOM_A]))
    expect(proposal.groupResults.find((group) => group.groupId === GROUP_A)?.status).toBe('together')
  })
})
