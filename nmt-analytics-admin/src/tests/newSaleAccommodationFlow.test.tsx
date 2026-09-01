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

  it('creates a reservation with automatic accommodation requirements for a standard booking', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Double/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Pregled prodaje')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Amina Hadžić',
      customerPhone: '+38761100001',
      departureId: 'departure-1',
      upsert: true,
      totalAmount: 2570,
      hotelName: 'Hotel Azure Antalya',
      roomType: 'Double',
      accommodationRequirements: [
        {
          hotelAllocationId: 'allocation-double',
          roomCount: 2,
          guestsExpected: 3,
          notes: undefined,
          passengerIndexes: [0, 1, 2],
        },
      ],
    }));
    expect(createReservation.mock.calls[0][0].options.accommodation).toEqual([
      expect.objectContaining({
        hotel_allocation_id: 'allocation-double',
        room_count: 2,
        total_sell_price: 1580,
        passenger_indexes: [0, 1, 2],
      }),
    ]);
    expect(toastSuccess).toHaveBeenCalledWith('Rezervacija kreirana');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enables Continue after a valid 4-traveler automatic double mapping', async () => {
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
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Ahmed Alić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100003' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Ahmed Alić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 2 - puno ime'), { target: { value: 'Kenan Alić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 3 - puno ime'), { target: { value: 'Faruk Alić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 4 - puno ime'), { target: { value: 'Nedim Alić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    const continueButton = screen.getByRole('button', { name: 'Dalje' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: /Hotel Azure Antalya/i })[0]);

    expect(screen.getByText('Ukupno pokriveno: 4 / 4 putnika')).toBeInTheDocument();
    expect(screen.queryByText('Smještaj mora pokriti sve putnike u rezervaciji.')).not.toBeInTheDocument();
    expect(continueButton.disabled).toBe(false);

    fireEvent.click(continueButton);
    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
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
    expect(screen.getByText('Odabrano')).toBeInTheDocument();

    fireEvent.click(accommodationCards[0]);
    expect(screen.getAllByText('Odabrano').length).toBe(1);
  });

  it('does not create a duplicate line when the same option is re-selected after adding a line', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj još smještaja' }));
    fireEvent.click(accommodationCards[0]);

    expect(screen.getAllByText('Odabrano').length).toBe(1);
    expect(screen.getAllByText(/Kapacitet linije/).length).toBe(1);
    expect(screen.getByText('Smještaj 1')).toBeInTheDocument();
    expect(screen.getByText('Smještaj 2')).toBeInTheDocument();
  });

  it('shows no legacy accommodation selector in Step 2, only in Step 3', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.queryByText('Tip smještaja')).not.toBeInTheDocument();
    expect(screen.queryByText('— Nepotrebno —')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel')).not.toBeInTheDocument();
    expect(screen.queryByText('Studentski smještaj')).not.toBeInTheDocument();
    expect(screen.queryByText('Apartman')).not.toBeInTheDocument();

    // Transport dropdown removed — departure is source of truth (M01.2)
    expect(screen.queryByRole('button', { name: '+ Prikaži prijevoz' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tip smještaja')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Test Kupac' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect((await screen.findAllByText('Hotel Azure Antalya')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Double/)).toBeInTheDocument();
    expect(screen.getByText(/Single/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Dodaj još smještaja' })).toBeInTheDocument();
  });

  it('shows a clear capacity message when the API rejects the sale', async () => {
    createReservation.mockRejectedValueOnce({
      code: 'DEPARTURE_CAPACITY_EXCEEDED',
      message: 'Departure capacity would be exceeded',
    });

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
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    // accommodation -> payment
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    // payment -> review
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    // -> review
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    await waitFor(() => expect(screen.getByText('Pregled prodaje')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nema dovoljno mjesta na odabranom polasku.'));
  });

  it('M04 acceptance: multi-line accommodation (4 travelers, Double + 2x Single rooms)', async () => {
    const onCreated = vi.fn();
    render(
      <NewSaleWizard
        isOpen
        onClose={vi.fn()}
        onCreated={onCreated}
        initialPackageId="package-1"
        initialDepartureId="departure-1"
      />,
    );

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));

    // Travelers: 4 passengers
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'MultiLine Test' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761000000' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Passenger 1' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 2 - puno ime'), { target: { value: 'Passenger 2' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 3 - puno ime'), { target: { value: 'Passenger 3' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 4 - puno ime'), { target: { value: 'Passenger 4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    // Accommodation: select Double card
    fireEvent.click(screen.getByRole('button', { name: /Double/ }));

    // Add a second line
    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj još smještaja' }));

    // Adjust line 0 (Double): roomCount 1, guestsExpected 2
    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[0], { target: { value: '1' } });
    fireEvent.change(spinButtons[1], { target: { value: '2' } });

    // Unassign passengers 3,4 (indexes 2,3) from line 0 -> line 0 keeps [0,1]
    fireEvent.click(screen.getAllByLabelText('Passenger 3')[0]);
    fireEvent.click(screen.getAllByLabelText('Passenger 4')[0]);

    // Select Single for line 1
    fireEvent.click(screen.getByRole('button', { name: /Single/ }));

    // Adjust line 1 (Single): roomCount 2, guestsExpected 2
    const spinButtonsAfter = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtonsAfter[2], { target: { value: '2' } });
    fireEvent.change(spinButtonsAfter[3], { target: { value: '2' } });

    // Attempt to proceed to Review
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    // Master Plan requires the wizard to reach Review and submit the exact payload.
    expect(await screen.findByText('Pregled prodaje')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    const payload = createReservation.mock.calls[0][0];
    const reqs = payload.accommodationRequirements.map((r: any) => ({
      hotelAllocationId: r.hotelAllocationId,
      roomCount: r.roomCount,
      guestsExpected: r.guestsExpected,
      passengerIndexes: [...r.passengerIndexes].sort((a: number, b: number) => a - b),
    })).sort((a: any, b: any) => a.hotelAllocationId.localeCompare(b.hotelAllocationId));

    expect(reqs).toEqual([
      {
        hotelAllocationId: 'allocation-double',
        roomCount: 1,
        guestsExpected: 2,
        passengerIndexes: [0, 1],
      },
      {
        hotelAllocationId: 'allocation-single',
        roomCount: 2,
        guestsExpected: 2,
        passengerIndexes: [2, 3],
      },
    ]);
  });

});
