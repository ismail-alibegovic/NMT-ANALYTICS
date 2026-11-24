import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nProvider, useT } from '../lib/i18n/context';
import { en } from '../lib/i18n/en';

const apiMocks = vi.hoisted(() => ({
  getDepartureRoomSlots: vi.fn(),
  assignPassengerToRoomSlot: vi.fn(),
  moveRoomSlotAssignment: vi.fn(),
  unassignPassengerFromRoomSlot: vi.fn(),
  setRoomSlotAssignmentLocked: vi.fn(),
  updateRoomSlotPhysicalNumber: vi.fn(),
  generateOperationalRoomingProposal: vi.fn(),
  applyRoomingProposal: vi.fn(),
  getDepartureVehicle: vi.fn(),
  updateDepartureVehicle: vi.fn(),
  assignPassengerSeat: vi.fn(),
  lockPassengerSeat: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../api/departures', () => ({
  ...apiMocks,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => toastMock,
}));

import RoomingWorkspace from '../components/operations/RoomingWorkspace';
import ManualBusSeating from '../components/operations/ManualBusSeating';

const baseSlots = [
  {
    id: 'slot-1',
    orgId: 'org-1',
    departureId: 'dep-1',
    hotelId: 'hotel-1',
    hotelAllocationId: 'alloc-1',
    roomType: 'double',
    slotIndex: 1,
    displayLabel: 'Double 01',
    actualHotelRoomNumber: null,
    capacity: 2,
    hotel: { id: 'hotel-1', name: 'Hotel Azure' },
    assignments: [
      {
        id: 'assign-1',
        passengerId: 'pax-1',
        passengerName: 'Amina Hadžić',
        locked: false,
      },
    ],
  },
];

const samplePassengers = [
  {
    id: 'pax-1',
    passengerId: 'pax-1',
    fullName: 'Amina Hadžić',
    hotelId: 'hotel-1',
    hotelAllocationId: 'alloc-1',
    roomType: 'double',
    seat_number: null,
    seat_is_manual: false,
    seat_locked: false,
  },
  {
    id: 'pax-2',
    passengerId: 'pax-2',
    fullName: 'Emir Kovač',
    hotelId: 'hotel-1',
    hotelAllocationId: 'alloc-1',
    roomType: 'double',
    seat_number: null,
    seat_is_manual: false,
    seat_locked: false,
  },
];

function RoomingLangHarness() {
  const { lang, toggleLang } = useT();
  const [departureId, setDepartureId] = useState('dep-1');
  return (
    <div>
      <span data-testid="active-lang">{lang}</span>
      <button type="button" onClick={toggleLang}>
        Switch Language
      </button>
      <button type="button" onClick={() => setDepartureId('dep-2')}>
        Switch Departure
      </button>
      <RoomingWorkspace departureId={departureId} passengers={samplePassengers as any} />
    </div>
  );
}

describe('FLOW-01 operator rooming & seating UI state matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('travline_lang', 'en');
    apiMocks.getDepartureRoomSlots.mockResolvedValue(baseSlots);
    apiMocks.setRoomSlotAssignmentLocked.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('preserves RoomingWorkspace state without re-fetching when UI language toggles, and reloads cleanly on departure change', async () => {
    render(
      <I18nProvider>
        <RoomingLangHarness />
      </I18nProvider>,
    );

    await screen.findByText('Double 01');
    expect(apiMocks.getDepartureRoomSlots).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('active-lang')).toHaveTextContent('en');
    expect(screen.getByText('Unassigned passengers')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch Language' }));
    await waitFor(() => {
      expect(screen.getByTestId('active-lang')).toHaveTextContent('bs');
    });
    expect(apiMocks.getDepartureRoomSlots).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Switch Departure' }));
    await waitFor(() => {
      expect(apiMocks.getDepartureRoomSlots).toHaveBeenCalledWith('dep-2');
    });
    expect(apiMocks.getDepartureRoomSlots).toHaveBeenCalledTimes(2);
  });

  it('reloads authoritative room slots after lock toggle and after 409 STALE_PROPOSAL', async () => {
    const lockedSlots = [
      {
        ...baseSlots[0],
        assignments: [{ ...baseSlots[0].assignments[0], locked: true }],
      },
    ];
    apiMocks.getDepartureRoomSlots
      .mockResolvedValueOnce(baseSlots)
      .mockResolvedValueOnce(lockedSlots)
      .mockResolvedValueOnce(baseSlots);

    render(
      <I18nProvider>
        <RoomingWorkspace departureId="dep-1" passengers={samplePassengers as any} />
      </I18nProvider>,
    );

    await screen.findByText('Double 01');
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    await waitFor(() => {
      expect(apiMocks.setRoomSlotAssignmentLocked).toHaveBeenCalledWith('assign-1', true);
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull();

    // Now simulate stale proposal on apply -> clears proposal, shows error, triggers load()
    apiMocks.generateOperationalRoomingProposal.mockResolvedValueOnce({
      departureId: 'dep-1',
      stateFingerprint: 'fp-old',
      summary: { totalPassengers: 2, fixedManualLocked: 1, proposedNew: 1, unresolved: 0 },
      fixedAssignments: [],
      replaceableAssignmentIds: [],
      proposedAssignments: [{ passengerId: 'pax-2', slotId: 'slot-1', slotLabel: 'Double 01', reason: 'group' }],
      unresolved: [],
      warnings: [],
    });
    apiMocks.applyRoomingProposal.mockRejectedValueOnce(Object.assign(new Error('Proposal is stale. Generate a new proposal.'), { status: 409 }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate Rooming Proposal' }));
    expect(await screen.findByText('Rooming proposal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Proposal' }));

    await waitFor(() => {
      expect(screen.queryByText('Rooming proposal')).not.toBeInTheDocument();
      expect(screen.getByText('Proposal is stale. Generate a new proposal.')).toBeInTheDocument();
    });
    expect(apiMocks.getDepartureRoomSlots).toHaveBeenCalledTimes(3);
  });

  it('handles ManualBusSeating lock enforcement and vehicle capacity conflict recovery', async () => {
    const vehicle = {
      vehicle: {
        id: 'v1',
        departure_id: 'dep-1',
        org_id: 'org-1',
        vehicle_label: 'Sprinter',
        registration_number: 'T1234AB',
        capacity: 4,
        layout_type: '2+2',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
      seats: [
        { id: 's1', seat_number: 1, seat_label: '1A', row_number: 1, column_index: 0, side: 'left', is_active: true },
        { id: 's2', seat_number: 2, seat_label: '1B', row_number: 1, column_index: 1, side: 'right', is_active: true },
      ],
    };

    apiMocks.getDepartureVehicle.mockResolvedValue(vehicle);
    apiMocks.lockPassengerSeat.mockResolvedValue({});
    apiMocks.updateDepartureVehicle.mockRejectedValueOnce({ code: 'VEHICLE_CHANGE_CONFLICT', message: 'Conflict' });

    const assignedLocked = { ...samplePassengers[0], seat_number: 1, seat_is_manual: true, seat_locked: true };
    render(
      <I18nProvider>
        <ManualBusSeating departureId="dep-1" transportType="bus" passengers={[assignedLocked]} />
      </I18nProvider>,
    );

    await screen.findByText('1A');
    await userEvent.click(screen.getByText('1A'));
    expect(screen.queryByRole('button', { name: en.departure.busSeating.move })).toBeNull();
    expect(screen.queryByRole('button', { name: en.departure.busSeating.unassign })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en.departure.busSeating.unlock }));
    expect(apiMocks.lockPassengerSeat).toHaveBeenCalledWith('pax-1', false);

    await userEvent.click(screen.getByRole('button', { name: en.departure.busSeating.saveVehicle }));
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(en.departure.busSeating.vehicleChangeConflict);
    });
  });
});
