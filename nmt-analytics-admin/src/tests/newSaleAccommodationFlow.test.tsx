import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewSaleWizard from '../components/reservations/NewSaleWizard';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getCustomers = vi.fn();
const createReservation = vi.fn();
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
}));

vi.mock('../api/customers', () => ({
  getCustomers: (...args: any[]) => getCustomers(...args),
}));

vi.mock('../api/reservations', () => ({
  createReservation: (...args: any[]) => createReservation(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

const pkg = {
  id: 'package-1',
  name: 'Antalya Summer 2027',
  destination: 'Antalya',
  price: 990,
  base_price: 990,
  currency: 'BAM',
  variants: [],
};

const departure = {
  id: 'departure-1',
  package_id: 'package-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 0,
  capacity: 50,
  status: 'active',
  transport_type: 'flight',
  capabilities: { hasFlight: true },
};

const accommodationOption = {
  id: 'allocation-double',
  departureId: 'departure-1',
  hotelId: 'hotel-1',
  roomType: 'double',
  roomLabel: 'Double',
  departureRooms: 10,
  reservedRooms: 0,
  availableRooms: 10,
  capacityPerRoom: 2,
  availableGuestCapacity: 20,
  unitSellPrice: 790,
  unitNetPrice: 650,
  checkIn: '2027-06-10',
  checkOut: '2027-06-17',
  hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
};

describe('NewSaleWizard accommodation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [departure] });
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [accommodationOption] });
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('creates a reservation with canonical accommodation requirement from selected allotment', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <NewSaleWizard
        isOpen
        onClose={onClose}
        onCreated={onCreated}
        initialPackageId="package-1"
        initialDepartureId="departure-1"
      />,
    );

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Hotel Azure Antalya')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hotel Azure Antalya/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Amina Hadžić',
      customerPhone: '+38761100001',
      departureId: 'departure-1',
      totalAmount: 1780,
      hotelName: 'Hotel Azure Antalya',
      roomType: 'Double',
      accommodationRequirement: {
        hotelAllocationId: 'allocation-double',
        roomCount: 1,
        guestsExpected: 1,
        notes: undefined,
      },
    }));
    expect(createReservation.mock.calls[0][0].options.accommodation).toMatchObject({
      hotel_allocation_id: 'allocation-double',
      room_count: 1,
      total_sell_price: 790,
    });
    expect(toastSuccess).toHaveBeenCalledWith('Rezervacija kreirana');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
