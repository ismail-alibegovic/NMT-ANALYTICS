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

const busDeparture = {
  id: 'departure-1',
  package_id: 'package-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 0,
  capacity: 50,
  status: 'active',
  transport_type: 'bus',
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

function renderWizard() {
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

describe('NewSaleWizard — M03.1 step structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture] });
    getPackageServices.mockResolvedValue([]);
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('departure without accommodation: Trip → Travelers → Payment → Review', async () => {
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));

    // Stepper shows 4 steps, no accommodation
    expect(screen.getByText('Putovanje')).toBeInTheDocument();
    expect(screen.getByText('Klijent i putnici')).toBeInTheDocument();
    expect(screen.queryByText('Smještaj')).not.toBeInTheDocument();
    expect(screen.getByText('Cijena i plaćanje')).toBeInTheDocument();
    expect(screen.getByText('Pregled')).toBeInTheDocument();

    // Trip → Travelers
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(screen.getByText('Ime i prezime klijenta *')).toBeInTheDocument();

    // Travelers → Payment (skips accommodation)
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
  });

  it('departure with accommodation: Trip → Travelers → Accommodation → Payment → Review', async () => {
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [accommodationOption] });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));

    // Stepper shows 5 steps with accommodation
    expect(screen.getByText('Smještaj')).toBeInTheDocument();

    // Trip → Travelers
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });

    // Travelers → Accommodation
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText(/Hotel Azure Antalya/)).toBeInTheDocument();

    // Back from Accommodation → Travelers
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    expect(screen.getByText('Ime i prezime klijenta *')).toBeInTheDocument();

    // Travelers → Accommodation → Payment
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    await waitFor(() => expect(screen.getByText(/Hotel Azure Antalya/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
  });

  it('payment controls are on the payment step, not on Review', async () => {
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();

    // Payment step
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Način plaćanja')).toBeInTheDocument();

    // Move to Review
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Pregled prodaje')).toBeInTheDocument();

    // Payment controls (plan selector buttons) are NOT on review
    expect(screen.queryByRole('button', { name: 'Puna uplata' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Depozit + ostatak' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rate' })).not.toBeInTheDocument();
  });

  it('Review shows read-only payment terms', async () => {
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    // Select deposit plan on payment step
    fireEvent.click(await screen.findByRole('button', { name: 'Depozit + ostatak' }));

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Pregled prodaje')).toBeInTheDocument();

    // Review shows the read-only payment terms
    expect(screen.getByText('Depozit 50% + ostatak')).toBeInTheDocument();
  });

  it('attempting Next with missing customer data shows a clear validation message', async () => {
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();

    // Trip → Travelers
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    // Attempt Next without customer name/phone
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Unesite ime klijenta.')).toBeInTheDocument();

    // Fill name but not phone
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Unesite telefon.')).toBeInTheDocument();
  });
});
