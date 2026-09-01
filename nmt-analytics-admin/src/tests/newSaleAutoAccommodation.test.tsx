import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewSaleWizard from '../components/reservations/NewSaleWizard';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getPackageServices = vi.fn();
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

vi.mock('../api/operations', () => ({
  getPackageServices: (...args: any[]) => getPackageServices(...args),
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
  transport_type: 'bus',
};

const singleOption = {
  id: 'allocation-single',
  departureId: 'departure-1',
  hotelId: 'hotel-1',
  roomType: 'single',
  roomLabel: 'Single',
  departureRooms: 10,
  reservedRooms: 0,
  availableRooms: 10,
  capacityPerRoom: 1,
  availableGuestCapacity: 10,
  unitSellPrice: 590,
  unitNetPrice: 450,
  checkIn: '2027-06-10',
  checkOut: '2027-06-17',
  hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
};

const doubleOption = {
  ...singleOption,
  id: 'allocation-double',
  roomType: 'double',
  roomLabel: 'Double',
  capacityPerRoom: 2,
  unitSellPrice: 790,
};

const tripleOption = {
  ...singleOption,
  id: 'allocation-triple',
  roomType: 'triple',
  roomLabel: 'Triple',
  capacityPerRoom: 3,
  unitSellPrice: 990,
};

function renderWizard(option: any) {
  getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [option] });
  render(
    <NewSaleWizard
      isOpen
      onClose={vi.fn()}
      onCreated={vi.fn()}
      initialPackageId="package-1"
      initialDepartureId="departure-1"
    />,
  );
}

async function goToAccommodation(partySize: number, passengerNames?: string[]) {
  expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
  await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));

  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });

  if (partySize !== 1) {
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: String(partySize) } });
  }

  const names = passengerNames ?? Array.from({ length: partySize }, (_, index) => `Putnik ${index + 1}`);
  names.forEach((name, index) => {
    fireEvent.change(screen.getByPlaceholderText(`Putnik ${index + 1} - puno ime`), { target: { value: name } });
  });

  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  expect(await screen.findByText(/Hotel Azure Antalya/)).toBeInTheDocument();
}

function selectAccommodationCard(label: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('NewSaleWizard — M04.1c auto accommodation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [departure] });
    getPackageServices.mockResolvedValue([]);
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('1 traveler + Single => roomCount 1', async () => {
    renderWizard(singleOption);
    await goToAccommodation(1, ['Amina Hadžić']);

    selectAccommodationCard(/Single/);

    expect(screen.getByText('Potrebno soba')).toBeInTheDocument();
    expect(screen.getByText('Kapacitet sobe')).toBeInTheDocument();
    expect(screen.getByText('Slobodno soba')).toBeInTheDocument();
    expect(screen.getByText('Ukupno pokriveno: 1 / 1 putnika')).toBeInTheDocument();
    expect(screen.getByText('590 BAM')).toBeInTheDocument();
  });

  it('2 travelers + Double => roomCount 1', async () => {
    renderWizard(doubleOption);
    await goToAccommodation(2, ['Amina Hadžić', 'Emir Hadžić']);

    selectAccommodationCard(/Double/);

    expect(screen.getByText('Ukupno pokriveno: 2 / 2 putnika')).toBeInTheDocument();
    expect(screen.getByText('790 BAM')).toBeInTheDocument();
    expect(screen.getByText('Potrebno soba').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Kapacitet sobe').parentElement).toHaveTextContent('2');
  });

  it('4 travelers + Double => roomCount 2', async () => {
    renderWizard(doubleOption);
    await goToAccommodation(4, ['Amina Hadžić', 'Emir Hadžić', 'Haris Hadžić', 'Nedim Hadžić']);

    selectAccommodationCard(/Double/);

    expect(screen.getByText('Ukupno pokriveno: 4 / 4 putnika')).toBeInTheDocument();
    expect(screen.getByText('1580 BAM')).toBeInTheDocument();
    expect(screen.getByText('Putnika').parentElement).toHaveTextContent('4');
    expect(screen.getByText('Potrebno soba').parentElement).toHaveTextContent('2');
  });

  it('auto-maps all passenger indexes for standard single-line flow', async () => {
    renderWizard(tripleOption);
    await goToAccommodation(5, ['Amina Hadžić', 'Emir Hadžić', 'Haris Hadžić', 'Nedim Hadžić', 'Sara Hadžić']);

    selectAccommodationCard(/Triple/);
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation.mock.calls[0][0].accommodationRequirements).toEqual([
      {
        hotelAllocationId: 'allocation-triple',
        roomCount: 2,
        guestsExpected: 5,
        notes: undefined,
        passengerIndexes: [0, 1, 2, 3, 4],
      },
    ]);
  });

  it('hides manual passenger checkboxes in standard single-line flow', async () => {
    renderWizard(doubleOption);
    await goToAccommodation(2, ['Amina Hadžić', 'Emir Hadžić']);

    selectAccommodationCard(/Double/);

    expect(screen.queryByText('Dodijeljeni putnici')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Broj soba')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Putnika')).not.toBeInTheDocument();
  });

  it('recalculates roomCount and mapping when partySize changes after selection', async () => {
    renderWizard(doubleOption);
    await goToAccommodation(2, ['Amina Hadžić', 'Emir Hadžić']);

    selectAccommodationCard(/Double/);
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 3 - puno ime'), { target: { value: 'Haris Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 4 - puno ime'), { target: { value: 'Nedim Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Ukupno pokriveno: 4 / 4 putnika')).toBeInTheDocument();
    expect(screen.getByText('1580 BAM')).toBeInTheDocument();
  });

  it('blocks Next when any passenger name is empty', async () => {
    renderWizard(doubleOption);
    await goToAccommodation(2, ['Amina Hadžić', '']);

    selectAccommodationCard(/Double/);
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.getByText('Unesite ime svih putnika prije nastavka sa smještajem.')).toBeInTheDocument();
    expect(screen.queryByText('Ukupan iznos (BAM)')).not.toBeInTheDocument();
  });

  it('blocks Next with a clear inventory message when required rooms exceed available rooms', async () => {
    renderWizard({ ...doubleOption, availableRooms: 1, availableGuestCapacity: 2 });
    await goToAccommodation(4, ['Amina Hadžić', 'Emir Hadžić', 'Haris Hadžić', 'Nedim Hadžić']);

    selectAccommodationCard(/Double/);

    expect(screen.getByText('Potrebno soba').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Slobodno soba').parentElement).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.getAllByText('Nema dovoljno slobodnih Double soba. Potrebno: 2, dostupno: 1.')).toHaveLength(2);
    expect(screen.queryByText('Ukupan iznos (BAM)')).not.toBeInTheDocument();
  });

  it('allows Next when available rooms cover the auto-calculated requirement', async () => {
    renderWizard({ ...doubleOption, availableRooms: 2, availableGuestCapacity: 4 });
    await goToAccommodation(4, ['Amina Hadžić', 'Emir Hadžić', 'Haris Hadžić', 'Nedim Hadžić']);

    selectAccommodationCard(/Double/);

    expect(screen.getByText('Potrebno soba').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Slobodno soba').parentElement).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
    expect(screen.queryByText('Nema dovoljno slobodnih Double soba. Potrebno: 2, dostupno: 1.')).not.toBeInTheDocument();
  });
});
