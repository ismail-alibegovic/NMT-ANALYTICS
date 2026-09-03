import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoomingWorkspace from '../components/operations/RoomingWorkspace';

const getDepartureRoomSlots = vi.fn();
const assignPassengerToRoomSlot = vi.fn();
const moveRoomSlotAssignment = vi.fn();
const unassignPassengerFromRoomSlot = vi.fn();
const setRoomSlotAssignmentLocked = vi.fn();
const generateOperationalRoomingProposal = vi.fn();
const updateRoomSlotPhysicalNumber = vi.fn();
const useTMock = vi.hoisted(() =>
  vi.fn(() => ({
    t: {
      departures: {
        rooming: {
          loading: 'Loading accommodation…',
          unavailable: 'Accommodation data unavailable',
          unassigned: 'Unassigned passengers',
          allAssigned: 'All passengers assigned.',
          unassign: 'Unassign',
          accommodation: 'Accommodation',
          groups: 'Groups',
          room: 'Room',
          full: 'Full',
          free: 'free',
          incompatible: 'Not compatible',
          unknownHotel: 'Hotel',
          groupFallback: 'Group',
          noPassengers: 'No passengers assigned',
          assignFailed: 'Assign failed',
          unassignFailed: 'Unassign failed',
          loadFailed: 'Failed to load accommodation data',
          groupStatus: {
            unassigned: 'Unassigned',
            partial: 'Partial',
            together: 'Together',
            split: 'Split',
          },
          selectRoom: 'Select Room',
          selectRoomHint: 'Select a room for',
          move: 'Move',
          totalBeds: 'Total Beds',
          assignedCount: 'Assigned',
          unassignedCount: 'Unassigned',
          remainingBeds: 'Remaining',
          noAccommodationConfigured: 'Accommodation Not Configured',
          noAccommodationHint: 'Accommodation is part of this departure, but rooms are not yet configured.',
          locked: 'Locked',
          lock: 'Lock',
          unlock: 'Unlock',
          lockedMutationHint: 'Unlock the assignment before changing it.',
          lockFailed: 'Lock update failed',
          hotelRoomNumber: 'Hotel room number',
          setNumber: 'Set number',
          roomNumberNotAssigned: 'Room number not assigned',
          saveRoomNumber: 'Save',
          clearRoomNumber: 'Clear',
          roomNumberUpdateFailed: 'Room number update failed',
          proposalFailed: 'Proposal failed',
          generateProposal: 'Generate Rooming Proposal',
          proposalGenerating: 'Generating…',
          proposalTitle: 'Rooming proposal',
          proposalReadOnly: 'Review proposal — no assignments changed.',
          clearProposal: 'Close preview',
          proposalTotal: 'Total passengers',
          proposalPreserved: 'Preserved',
          proposalProposed: 'Proposed',
          proposalUnresolved: 'Unresolved',
          proposalNewAssignments: 'Proposed assignments',
          proposalToSlot: 'Room',
          proposalUnresolvedPassengers: 'Unresolved passengers',
        },
      },
    },
  })),
);

vi.mock('../api/departures', () => ({
  getDepartureRoomSlots: (...args: any[]) => getDepartureRoomSlots(...args),
  assignPassengerToRoomSlot: (...args: any[]) => assignPassengerToRoomSlot(...args),
  moveRoomSlotAssignment: (...args: any[]) => moveRoomSlotAssignment(...args),
  unassignPassengerFromRoomSlot: (...args: any[]) => unassignPassengerFromRoomSlot(...args),
  setRoomSlotAssignmentLocked: (...args: any[]) => setRoomSlotAssignmentLocked(...args),
  updateRoomSlotPhysicalNumber: (...args: any[]) => updateRoomSlotPhysicalNumber(...args),
  generateOperationalRoomingProposal: (...args: any[]) => generateOperationalRoomingProposal(...args),
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => useTMock(),
}));

vi.mock('../components/ui/button/Button', () => ({
  default: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../components/ui/badge/Badge', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

const passengers = [
  {
    id: 'passenger-1',
    passengerId: 'passenger-1',
    reservationId: 'reservation-1',
    fullName: 'Amina Hadžić',
    groupId: 'group-1',
    groupName: 'Porodica Hadžić',
    groupColor: '#2563eb',
    hotelId: 'hotel-1',
    hotelAllocationId: 'allocation-double',
    hotelName: 'Hotel Azure Antalya',
    roomType: 'double',
  },
  {
    id: 'passenger-2',
    passengerId: 'passenger-2',
    reservationId: 'reservation-1',
    fullName: 'Emir Hadžić',
    groupId: 'group-1',
    groupName: 'Porodica Hadžić',
    groupColor: '#2563eb',
    hotelId: 'hotel-1',
    hotelAllocationId: 'allocation-double',
    hotelName: 'Hotel Azure Antalya',
    roomType: 'double',
  },
];

const slots = [
  {
    id: 'slot-double-1',
    departureId: 'departure-1',
    hotelAllocationId: 'allocation-double',
    hotelId: 'hotel-1',
    roomType: 'double',
    slotNumber: 1,
    displayLabel: 'Double 01',
    capacity: 2,
    hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
    assignments: [],
  },
  {
    id: 'slot-triple-1',
    departureId: 'departure-1',
    hotelAllocationId: 'allocation-triple',
    hotelId: 'hotel-1',
    roomType: 'triple',
    slotNumber: 1,
    displayLabel: 'Triple 01',
    capacity: 3,
    hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
    assignments: [],
  },
];

describe('RoomingWorkspace room slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTMock.mockReturnValue({
      t: {
        departures: {
          rooming: {
            loading: 'Loading accommodation…',
            unavailable: 'Accommodation data unavailable',
            unassigned: 'Unassigned passengers',
            allAssigned: 'All passengers assigned.',
            unassign: 'Unassign',
            accommodation: 'Accommodation',
            groups: 'Groups',
            room: 'Room',
            full: 'Full',
            free: 'free',
            incompatible: 'Not compatible',
            unknownHotel: 'Hotel',
            groupFallback: 'Group',
            noPassengers: 'No passengers assigned',
            assignFailed: 'Assign failed',
            unassignFailed: 'Unassign failed',
            loadFailed: 'Failed to load accommodation data',
            groupStatus: {
              unassigned: 'Unassigned',
              partial: 'Partial',
              together: 'Together',
              split: 'Split',
            },
            selectRoom: 'Select Room',
            selectRoomHint: 'Select a room for',
            move: 'Move',
            totalBeds: 'Total Beds',
            assignedCount: 'Assigned',
            unassignedCount: 'Unassigned',
            remainingBeds: 'Remaining',
            noAccommodationConfigured: 'Accommodation Not Configured',
            noAccommodationHint: 'Accommodation is part of this departure, but rooms are not yet configured.',
            locked: 'Locked',
            lock: 'Lock',
            unlock: 'Unlock',
            lockedMutationHint: 'Unlock the assignment before changing it.',
            lockFailed: 'Lock update failed',
            hotelRoomNumber: 'Hotel room number',
            setNumber: 'Set number',
            roomNumberNotAssigned: 'Room number not assigned',
            saveRoomNumber: 'Save',
            clearRoomNumber: 'Clear',
            roomNumberUpdateFailed: 'Room number update failed',
          proposalFailed: 'Proposal failed',
          generateProposal: 'Generate Rooming Proposal',
          proposalGenerating: 'Generating…',
          proposalTitle: 'Rooming proposal',
          proposalReadOnly: 'Review proposal — no assignments changed.',
          clearProposal: 'Close preview',
          proposalTotal: 'Total passengers',
          proposalPreserved: 'Preserved',
          proposalProposed: 'Proposed',
          proposalUnresolved: 'Unresolved',
          proposalNewAssignments: 'Proposed assignments',
          proposalToSlot: 'Room',
          proposalUnresolvedPassengers: 'Unresolved passengers',
          },
        },
      },
    });
    getDepartureRoomSlots.mockResolvedValue(slots);
    assignPassengerToRoomSlot.mockResolvedValue({});
    moveRoomSlotAssignment.mockResolvedValue({});
    unassignPassengerFromRoomSlot.mockResolvedValue({});
    setRoomSlotAssignmentLocked.mockResolvedValue({});
    updateRoomSlotPhysicalNumber.mockResolvedValue({});
  });

  it('renders operational room slots and assigns passengers only to compatible slots', async () => {
    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect((await screen.findAllByText('Hotel Azure Antalya')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Double 01/).length).toBeGreaterThan(0);
    expect(screen.getByText('Triple 01')).toBeInTheDocument();
    expect(screen.getAllByText('Porodica Hadžić').length).toBeGreaterThan(0);
    expect(getDepartureRoomSlots).toHaveBeenCalledWith('departure-1');

    fireEvent.click(within(screen.getAllByText('Amina Hadžić')[0].closest('.rounded-lg.border') as HTMLElement).getByRole('button', { name: 'Select Room' }));

    const compatibleTarget = within(screen.getByRole('button', { name: /Hotel Azure Antalya · Double 01/ }));
    expect(compatibleTarget.getByText(/double · 0\/2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hotel Azure Antalya · Triple 01/ })).toBeDisabled();
    expect(screen.getByText('Not compatible')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hotel Azure Antalya · Double 01/ }));

    await waitFor(() => {
      expect(assignPassengerToRoomSlot).toHaveBeenCalledWith('slot-double-1', 'passenger-1');
    });
    expect(getDepartureRoomSlots).toHaveBeenCalledTimes(2);
  });

  it('treats display-label room types as compatible with canonical slot codes', async () => {
    const displayLabelPassengers = passengers.map((p, index) => ({
      ...p,
      roomType: index === 0 ? 'Double' : 'double',
    }));

    render(<RoomingWorkspace departureId="departure-1" passengers={displayLabelPassengers as any} />);

    await screen.findByText('Amina Hadžić');
    fireEvent.click(within(screen.getAllByText('Amina Hadžić')[0].closest('.rounded-lg.border') as HTMLElement).getByRole('button', { name: 'Select Room' }));

    const compatibleTarget = within(screen.getByRole('button', { name: /Hotel Azure Antalya · Double 01/ }));
    expect(compatibleTarget.queryByText('Not compatible')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hotel Azure Antalya · Triple 01/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Hotel Azure Antalya · Double 01/ }));

    await waitFor(() => {
      expect(assignPassengerToRoomSlot).toHaveBeenCalledWith('slot-double-1', 'passenger-1');
    });
  });

  it('renders fallback load failure text instead of crashing when translations are missing', async () => {
    useTMock.mockReturnValue({ t: { departures: {} } } as any);
    getDepartureRoomSlots.mockRejectedValueOnce(new Error());

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect(await screen.findByText('Accommodation data unavailable')).toBeInTheDocument();
    expect(screen.getByText('Failed to load accommodation data')).toBeInTheDocument();
  });

  it('shows manual actions for unlocked assignments and locks through the canonical API', async () => {
    getDepartureRoomSlots
      .mockResolvedValueOnce([
        {
          ...slots[0],
          assignments: [
            {
              id: 'assignment-1',
              passengerId: 'passenger-1',
              reservationId: 'reservation-1',
              passengerName: 'Amina Hadžić',
              isManual: true,
              locked: false,
            },
          ],
        },
      ])
      .mockResolvedValueOnce(slots);

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    await screen.findByText('Amina Hadžić');
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassign' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    await waitFor(() => {
      expect(setRoomSlotAssignmentLocked).toHaveBeenCalledWith('assignment-1', true);
    });
    expect(getDepartureRoomSlots).toHaveBeenCalledTimes(2);
  });

  it('makes locked assignments visibly protected and unlocks through the canonical API', async () => {
    getDepartureRoomSlots
      .mockResolvedValueOnce([
        {
          ...slots[0],
          assignments: [
            {
              id: 'assignment-1',
              passengerId: 'passenger-1',
              reservationId: 'reservation-1',
              passengerName: 'Amina Hadžić',
              isManual: true,
              locked: true,
            },
          ],
        },
      ])
      .mockResolvedValueOnce(slots);

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    await screen.findByText('Locked');
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unassign' })).not.toBeInTheDocument();
    expect(screen.getByText('Unlock the assignment before changing it.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(setRoomSlotAssignmentLocked).toHaveBeenCalledWith('assignment-1', false);
    });
  });

  it('shows lock API failures and does not falsely mutate local state', async () => {
    setRoomSlotAssignmentLocked.mockRejectedValueOnce(new Error('Lock rejected'));
    getDepartureRoomSlots.mockResolvedValueOnce([
      {
        ...slots[0],
        assignments: [
          {
            id: 'assignment-1',
            passengerId: 'passenger-1',
            reservationId: 'reservation-1',
            passengerName: 'Amina Hadžić',
            isManual: true,
            locked: false,
          },
        ],
      },
    ]);

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    await screen.findByText('Amina Hadžić');
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    expect(await screen.findByText('Lock rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
  });

  it('displays and updates the physical hotel room number separately from the operational slot label', async () => {
    getDepartureRoomSlots
      .mockResolvedValueOnce([
        {
          ...slots[0],
          actualHotelRoomNumber: '214',
          assignments: [],
        },
      ])
      .mockResolvedValueOnce(slots);

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect(await screen.findByText('Double 01')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText('Hotel room number')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set number' }));
    fireEvent.change(screen.getByLabelText('Hotel room number'), { target: { value: 'A-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateRoomSlotPhysicalNumber).toHaveBeenCalledWith('slot-double-1', 'A-12');
    });
  });

  it('clears the physical hotel room number as null', async () => {
    getDepartureRoomSlots.mockResolvedValueOnce([
      {
        ...slots[0],
        actualHotelRoomNumber: '214',
        assignments: [],
      },
    ]);

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    await screen.findByText('214');
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateRoomSlotPhysicalNumber).toHaveBeenCalledWith('slot-double-1', null);
    });
  });

  it('renders Generate Rooming Proposal button and review panel', async () => {
    getDepartureRoomSlots.mockResolvedValueOnce(slots);
    generateOperationalRoomingProposal.mockResolvedValueOnce({
      departureId: 'departure-1',
      stateFingerprint: 'abc123',
      summary: { totalPassengers: 2, fixedManualLocked: 0, proposedNew: 2, unresolved: 0 },
      fixedAssignments: [],
      replaceableAssignmentIds: [],
      proposedAssignments: [
        { passengerId: 'passenger-1', passengerName: 'Amina Hadžić', slotId: 'slot-double-1', slotLabel: 'Double 01', reason: 'capacity_fill' },
        { passengerId: 'passenger-2', passengerName: 'Emina Begić', slotId: 'slot-single-1', slotLabel: 'Single 01', reason: 'capacity_fill' },
      ],
      unresolved: [],
      warnings: [],
    });

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect(await screen.findByRole('button', { name: 'Generate Rooming Proposal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Rooming Proposal' }));

    expect(await screen.findByText('Rooming proposal')).toBeInTheDocument();
    expect(screen.getByText('Review proposal — no assignments changed.')).toBeInTheDocument();
    expect(screen.getByText('Total passengers')).toBeInTheDocument();
    expect(screen.getByText('Preserved')).toBeInTheDocument();
    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByText('Unresolved')).toBeInTheDocument();
    expect(screen.getAllByText('Amina Hadžić')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Emina Begić')[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Double 01/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Single 01/).length).toBeGreaterThan(0);
    expect(screen.getByText('Close preview')).toBeInTheDocument();
  });

  it('clears proposal preview after a manual assign mutation', async () => {
    getDepartureRoomSlots.mockResolvedValueOnce(slots);
    generateOperationalRoomingProposal.mockResolvedValueOnce({
      departureId: 'departure-1',
      stateFingerprint: 'abc123',
      summary: { totalPassengers: 2, fixedManualLocked: 0, proposedNew: 2, unresolved: 0 },
      fixedAssignments: [],
      replaceableAssignmentIds: [],
      proposedAssignments: [
        { passengerId: 'passenger-1', passengerName: 'Amina Hadžić', slotId: 'slot-double-1', slotLabel: 'Double 01', reason: 'capacity_fill' },
      ],
      unresolved: [],
      warnings: [],
    });

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect(await screen.findByRole('button', { name: 'Generate Rooming Proposal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Rooming Proposal' }));
    expect(await screen.findByText('Rooming proposal')).toBeInTheDocument();

    assignPassengerToRoomSlot.mockResolvedValueOnce({});
    getDepartureRoomSlots.mockResolvedValueOnce(slots);

    fireEvent.click(within(screen.getByText('Emir Hadžić').closest('.rounded-lg.border') as HTMLElement).getByRole('button', { name: 'Select Room' }));
    fireEvent.click(await screen.findByRole('button', { name: /Hotel Azure Antalya · Double 01/ }));

    await waitFor(() => {
      expect(assignPassengerToRoomSlot).toHaveBeenCalled();
    });
    expect(screen.queryByText('Rooming proposal')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close preview' })).not.toBeInTheDocument();
  });

});
