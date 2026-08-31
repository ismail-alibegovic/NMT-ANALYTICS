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

const accommodationSingleOption = {
  ...accommodationOption,
  id: 'allocation-single',
  roomType: 'single',
  roomLabel: 'Single',
  capacityPerRoom: 1,
  availableGuestCapacity: 10,
  unitSellPrice: 590,
  unitNetPrice: 450,
};

describe('NewSaleWizard accommodation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [departure] });
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [accommodationOption, accommodationSingleOption] });
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('creates a reservation with plural accommodation requirements and passenger mapping', async () => {
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
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 2 - puno ime'), { target: { value: 'Emir Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 3 - puno ime'), { target: { value: 'Haris Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect((await screen.findAllByText('Hotel Azure Antalya')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj još smještaja' }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'allocation-double' } });
    let spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[0], { target: { value: '1' } });
    fireEvent.change(spinButtons[1], { target: { value: '2' } });
    fireEvent.click(screen.getAllByLabelText('Amina Hadžić')[0]);
    fireEvent.click(screen.getAllByLabelText('Emir Hadžić')[0]);

    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj još smještaja' }));
    const updatedSelects = screen.getAllByRole('combobox');
    fireEvent.change(updatedSelects[1], { target: { value: 'allocation-single' } });
    spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[2], { target: { value: '1' } });
    fireEvent.change(spinButtons[3], { target: { value: '1' } });
    fireEvent.click(screen.getAllByLabelText('Haris Hadžić')[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Amina Hadžić',
      customerPhone: '+38761100001',
      departureId: 'departure-1',
      totalAmount: 2370,
      hotelName: 'Hotel Azure Antalya',
      roomType: 'Double',
      accommodationRequirements: [
        {
          hotelAllocationId: 'allocation-double',
          roomCount: 1,
          guestsExpected: 2,
          notes: undefined,
          passengerIndexes: [0, 1],
        },
        {
          hotelAllocationId: 'allocation-single',
          roomCount: 1,
          guestsExpected: 1,
          notes: undefined,
          passengerIndexes: [2],
        },
      ],
    }));
    expect(createReservation.mock.calls[0][0].options.accommodation).toEqual([
      expect.objectContaining({
        hotel_allocation_id: 'allocation-double',
        room_count: 1,
        total_sell_price: 790,
        passenger_indexes: [0, 1],
      }),
      expect.objectContaining({
        hotel_allocation_id: 'allocation-single',
        room_count: 1,
        total_sell_price: 590,
        passenger_indexes: [2],
      }),
    ]);
    expect(toastSuccess).toHaveBeenCalledWith('Rezervacija kreirana');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('selects a visible accommodation card without creating duplicate empty lines', async () => {
    render(
      <NewSaleWizard
        isOpen
        onClose={vi.fn()}
        onCreated={vi.fn()}
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

    const accommodationCards = screen.getAllByRole('button', { name: /Hotel Azure Antalya/i });
    fireEvent.click(accommodationCards[0]);

    expect(accommodationCards[0]).toHaveAttribute('aria-pressed', 'true');
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects).toHaveLength(1);
    expect(selects[0].value).toBe('allocation-double');

    fireEvent.click(accommodationCards[0]);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });
});
