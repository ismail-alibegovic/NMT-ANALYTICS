import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditReservationModal from '../components/reservations/EditReservationModal';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getDeparturePassengers = vi.fn();
const getReservation = vi.fn();
const getReservationAccommodation = vi.fn();
const updateReservation = vi.fn();
const updateReservationAccommodation = vi.fn();
const deleteReservationAccommodation = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: any) => isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

vi.mock('../api/packages', () => ({
  getPackages: (...args: any[]) => getPackages(...args),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
  getDepartureAccommodationOptions: (...args: any[]) => getDepartureAccommodationOptions(...args),
  getDeparturePassengers: (...args: any[]) => getDeparturePassengers(...args),
}));

vi.mock('../api/reservations', () => ({
  getReservation: (...args: any[]) => getReservation(...args),
  getReservationAccommodation: (...args: any[]) => getReservationAccommodation(...args),
  updateReservation: (...args: any[]) => updateReservation(...args),
  updateReservationAccommodation: (...args: any[]) => updateReservationAccommodation(...args),
  deleteReservationAccommodation: (...args: any[]) => deleteReservationAccommodation(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return { ChevronDownIcon: stub };
});

const reservation = {
  id: 'reservation-1',
  customerName: 'Amina Hadžić',
  customerPhone: '+38761100001',
  departureId: 'departure-1',
  participants: 2,
  partySize: 2,
  totalAmount: 1780,
  status: 'confirmed',
};

const departure = {
  id: 'departure-1',
  package_id: 'package-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 2,
  capacity: 50,
  status: 'active',
};

const accommodationOptions = [
  {
    id: 'allocation-double',
    departureId: 'departure-1',
    hotelId: 'hotel-1',
    roomType: 'double',
    roomLabel: 'Double',
    departureRooms: 10,
    reservedRooms: 1,
    availableRooms: 9,
    capacityPerRoom: 2,
    availableGuestCapacity: 18,
    unitSellPrice: 790,
    unitNetPrice: 650,
    checkIn: '2027-06-10',
    checkOut: '2027-06-17',
    hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
  },
  {
    id: 'allocation-triple',
    departureId: 'departure-1',
    hotelId: 'hotel-1',
    roomType: 'triple',
    roomLabel: 'Triple',
    departureRooms: 5,
    reservedRooms: 0,
    availableRooms: 5,
    capacityPerRoom: 3,
    availableGuestCapacity: 15,
    unitSellPrice: 990,
    unitNetPrice: 820,
    checkIn: '2027-06-10',
    checkOut: '2027-06-17',
    hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
  },
];

describe('EditReservationModal accommodation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [{ id: 'package-1', name: 'Antalya Summer 2027', destination: 'Antalya' }] });
    getDepartures.mockResolvedValue({ data: [departure] });
    getReservation.mockResolvedValue(reservation);
    getReservationAccommodation.mockResolvedValue([
      {
        id: 'requirement-1',
        reservationId: 'reservation-1',
        departureId: 'departure-1',
        hotelAllocationId: 'allocation-double',
        hotelId: 'hotel-1',
        roomType: 'double',
        roomLabel: 'Double',
        roomCount: 1,
        guestsExpected: 2,
        capacityPerRoom: 2,
        unitSellPrice: 790,
        unitNetPrice: 650,
        totalSellPrice: 790,
        notes: 'existing note',
        passengerIds: ['passenger-1', 'passenger-2'],
        hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya' },
      },
    ]);
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: accommodationOptions });
    getDeparturePassengers.mockResolvedValue({
      manifest: [
        { id: 'row-1', passengerId: 'passenger-1', reservationId: 'reservation-1', fullName: 'Amina Hadžić' },
        { id: 'row-2', passengerId: 'passenger-2', reservationId: 'reservation-1', fullName: 'Emir Hadžić' },
      ],
    });
    updateReservation.mockResolvedValue(reservation);
    updateReservationAccommodation.mockResolvedValue([]);
    deleteReservationAccommodation.mockResolvedValue(undefined);
  });

  it('persists edited canonical reservation accommodation after reservation core update', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<EditReservationModal isOpen onClose={onClose} onSuccess={onSuccess} reservationId="reservation-1" />);

    expect(await screen.findByText('Smještaj')).toBeInTheDocument();
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1', 'reservation-1'));

    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(3));
    const comboBoxes = screen.getAllByRole('combobox');
    const accommodationSelect = comboBoxes[comboBoxes.length - 1] as HTMLSelectElement;
    fireEvent.change(accommodationSelect, { target: { value: 'allocation-triple' } });
    fireEvent.click(screen.getByLabelText('Amina Hadžić'));
    fireEvent.click(screen.getByLabelText('Emir Hadžić'));
    fireEvent.click(screen.getByRole('button', { name: 'Spremi izmjene' }));

    await waitFor(() => expect(updateReservation).toHaveBeenCalledWith('reservation-1', expect.objectContaining({
      customerName: 'Amina Hadžić',
      partySize: 2,
      departureId: 'departure-1',
    })));
    expect(updateReservationAccommodation).toHaveBeenCalledWith('reservation-1', [
      {
        hotelAllocationId: 'allocation-triple',
        roomCount: 1,
        guestsExpected: 2,
        notes: 'existing note',
        passengerIds: ['passenger-1', 'passenger-2'],
      },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith('Rezervacija ažurirana');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps modal open and shows an error if accommodation persistence fails', async () => {
    updateReservationAccommodation.mockRejectedValueOnce(new Error('Accommodation overbooked'));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<EditReservationModal isOpen onClose={onClose} onSuccess={onSuccess} reservationId="reservation-1" />);

    await screen.findByText('Smještaj');
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1', 'reservation-1'));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: 'Spremi izmjene' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Accommodation overbooked'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
