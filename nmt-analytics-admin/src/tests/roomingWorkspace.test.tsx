import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomingWorkspace from '../components/operations/RoomingWorkspace'

const departureId = '10000000-0000-4000-8000-000000000001'
const passengerOne = '30000000-0000-4000-8000-000000000001'
const passengerTwo = '30000000-0000-4000-8000-000000000002'
const roomAlpha = '40000000-0000-4000-8000-000000000001'

const {
  successSpy,
  generateRoomingProposalMock,
  applyRoomingProposalMock,
  getAccommodationBuildingsMock,
} = vi.hoisted(() => ({
  successSpy: vi.fn(),
  generateRoomingProposalMock: vi.fn(),
  applyRoomingProposalMock: vi.fn(),
  getAccommodationBuildingsMock: vi.fn(),
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: successSpy, error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    t: {
      departures: {
        rooming: {
          loading: 'Loading accommodation…',
          unavailable: 'Accommodation data unavailable',
          noAccommodationConfigured: 'Accommodation Not Configured',
          noAccommodationHint: 'Hint',
          configureAccommodation: 'Configure Accommodation',
          unassigned: 'Unassigned passengers',
          allAssigned: 'All passengers assigned.',
          selectRoom: 'Select Room',
          groupStatus: { unassigned: 'Unassigned', partial: 'Partial', together: 'Together', split: 'Split' },
          totalBeds: 'Total Beds',
          assignedCount: 'Assigned',
          unassignedCount: 'Unassigned',
          remainingBeds: 'Remaining',
          accommodation: 'Accommodation',
          autoRoom: 'Auto room',
          room: 'Room',
          floors: 'floors',
          floor: 'floor',
          floorLabel: 'Floor',
          full: 'Full',
          free: 'free',
          noPassengers: 'No passengers assigned',
          proposalTitle: 'Rooming Proposal',
          placed: 'Placed',
          groupsKeptTogether: 'Groups Together',
          groupsSplit: 'Groups Split',
          groups: 'Groups',
          passengers: 'Passengers',
          warnings: 'Warnings',
          noProposal: 'No proposal',
          cancel: 'Cancel',
          apply: 'Apply',
          proposalFailed: 'Failed to generate rooming proposal',
          proposalApplyFailed: 'Failed to apply rooming proposal',
          proposalStale: 'Rooming state changed. Generate a fresh proposal.',
          proposalApplied: 'Rooming proposal applied.',
          loadFailed: 'Failed to load accommodation data',
          assignFailed: 'Assign failed',
          unassignFailed: 'Unassign failed',
          moveFailed: 'Move failed',
          roomFull: 'Room full',
        },
      },
    },
  }),
}))

vi.mock('../api/departures', () => ({
  getAccommodationBuildings: getAccommodationBuildingsMock,
  generateRoomingProposal: generateRoomingProposalMock,
  applyRoomingProposal: applyRoomingProposalMock,
  assignPassengerToRoom: vi.fn(),
  unassignPassengerFromRoom: vi.fn(),
  moveAccommodationAssignment: vi.fn(),
}))

describe('RoomingWorkspace proposal apply', () => {
  beforeEach(() => {
    successSpy.mockReset()
    generateRoomingProposalMock.mockReset()
    applyRoomingProposalMock.mockReset()
    getAccommodationBuildingsMock.mockReset()

    getAccommodationBuildingsMock.mockResolvedValue([
      {
        id: 'building-1',
        name: 'Main Hotel',
        type: 'hotel',
        floors: [
          {
            id: 'floor-1',
            floor_number: 1,
            rooms: [
              { id: roomAlpha, room_number: '101', type: 'double', capacity: 2, assignments: [] },
            ],
          },
        ],
      },
    ])

    generateRoomingProposalMock.mockResolvedValue({
      assignments: [
        { passengerId: passengerOne, passengerName: 'Ada One', roomId: roomAlpha, roomNumber: '101', buildingName: 'Main Hotel', floorNumber: 1, floorLabel: '1' },
        { passengerId: passengerTwo, passengerName: 'Ada Two', roomId: roomAlpha, roomNumber: '101', buildingName: 'Main Hotel', floorNumber: 1, floorLabel: '1' },
      ],
      items: [
        { passengerId: passengerOne, passengerName: 'Ada One', roomId: roomAlpha, roomNumber: '101', buildingName: 'Main Hotel', floorNumber: 1, floorLabel: '1' },
        { passengerId: passengerTwo, passengerName: 'Ada Two', roomId: roomAlpha, roomNumber: '101', buildingName: 'Main Hotel', floorNumber: 1, floorLabel: '1' },
      ],
      groupResults: [
        { groupId: 'group-1', groupName: 'Family', groupColor: '#ff9900', status: 'together', memberCount: 2, assignedCount: 2, assignedRoomIds: [roomAlpha] },
      ],
      groups: [
        { groupId: 'group-1', groupName: 'Family', groupColor: '#ff9900', status: 'together', memberCount: 2, assignedCount: 2, assignedRoomIds: [roomAlpha] },
      ],
      unplaced: [],
      warnings: [],
      summary: {
        totalPassengers: 2,
        passengersProposed: 2,
        groupsTogether: 1,
        groupsSplit: 0,
        unplacedCount: 0,
        remainingCapacity: 0,
      },
      placedCount: 2,
      unplacedCount: 0,
      groupsKeptTogether: 1,
      groupsSplit: 0,
    })
    applyRoomingProposalMock.mockResolvedValue({ applied: 2 })
  })

  it('sends canonical passenger IDs from the reviewed proposal when applying', async () => {
    render(
      <RoomingWorkspace
        departureId={departureId}
        passengers={[
          { passengerId: passengerOne, fullName: 'Ada One', groupId: 'group-1', groupName: 'Family', groupColor: '#ff9900', reservationId: 'res-1' },
          { passengerId: passengerTwo, fullName: 'Ada Two', groupId: 'group-1', groupName: 'Family', groupColor: '#ff9900', reservationId: 'res-2' },
        ] as any}
      />,
    )

    await waitFor(() => expect(getAccommodationBuildingsMock).toHaveBeenCalledWith(departureId))

    fireEvent.click(screen.getByRole('button', { name: 'Auto room' }))
    await screen.findByText('Rooming Proposal')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(applyRoomingProposalMock).toHaveBeenCalledWith(
        departureId,
        [passengerOne, passengerTwo],
        [
          { passengerId: passengerOne, roomId: roomAlpha },
          { passengerId: passengerTwo, roomId: roomAlpha },
        ],
      ),
    )
    expect(successSpy).toHaveBeenCalledWith('Rooming proposal applied.')
  })
})
