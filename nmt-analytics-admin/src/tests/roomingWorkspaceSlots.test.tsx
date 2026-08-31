import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RoomingWorkspace from '../components/operations/RoomingWorkspace';

const getDepartureRoomSlots = vi.fn();
const assignPassengerToRoomSlot = vi.fn();
const moveRoomSlotAssignment = vi.fn();
const unassignPassengerFromRoomSlot = vi.fn();
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
          },
        },
      },
    });
    getDepartureRoomSlots.mockResolvedValue(slots);
    assignPassengerToRoomSlot.mockResolvedValue({});
    moveRoomSlotAssignment.mockResolvedValue({});
    unassignPassengerFromRoomSlot.mockResolvedValue({});
  });

  it('renders operational room slots and assigns passengers only to compatible slots', async () => {
    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect((await screen.findAllByText('Hotel Azure Antalya')).length).toBeGreaterThan(0);
    expect(screen.getByText('Double 01')).toBeInTheDocument();
    expect(screen.getByText('Triple 01')).toBeInTheDocument();
    expect(screen.getAllByText('Porodica Hadžić').length).toBeGreaterThan(0);
    expect(getDepartureRoomSlots).toHaveBeenCalledWith('departure-1');

    fireEvent.click(within(screen.getByText('Amina Hadžić').closest('.rounded-lg.border') as HTMLElement).getByRole('button', { name: 'Select Room' }));

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

  it('renders fallback load failure text instead of crashing when translations are missing', async () => {
    useTMock.mockReturnValue({ t: { departures: {} } } as any);
    getDepartureRoomSlots.mockRejectedValueOnce(new Error());

    render(<RoomingWorkspace departureId="departure-1" passengers={passengers as any} />);

    expect(await screen.findByText('Accommodation data unavailable')).toBeInTheDocument();
    expect(screen.getByText('Failed to load accommodation data')).toBeInTheDocument();
  });
});
