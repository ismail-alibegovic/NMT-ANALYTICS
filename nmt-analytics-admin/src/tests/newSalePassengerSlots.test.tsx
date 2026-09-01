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

function renderWizard(extra: Record<string, unknown> = {}) {
  return render(
    <NewSaleWizard
      isOpen
      onClose={vi.fn()}
      onCreated={vi.fn()}
      initialPackageId="package-1"
      initialDepartureId="departure-1"
      {...extra}
    />,
  );
}

function passengerInputs() {
  return screen.queryAllByPlaceholderText(/Putnik \d+ - puno ime/);
}

async function goToTravelers() {
  expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
  await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  expect(screen.getByText('Ime i prezime klijenta *')).toBeInTheDocument();
}

describe('NewSaleWizard — passenger slot initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture] });
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
  });

  it('default open → exactly 1 passenger slot', async () => {
    renderWizard();
    await goToTravelers();
    expect(passengerInputs().length).toBe(1);
  });

  it('partySize 1 → 3 → exactly 3 passenger slots', async () => {
    renderWizard();
    await goToTravelers();
    expect(passengerInputs().length).toBe(1);

    const sizeInput = screen.getByRole('spinbutton');
    fireEvent.change(sizeInput, { target: { value: '3' } });
    await waitFor(() => expect(passengerInputs().length).toBe(3));
  });

  it('partySize 3 → 2 → exactly 2 passenger slots', async () => {
    renderWizard();
    await goToTravelers();

    const sizeInput = screen.getByRole('spinbutton');
    fireEvent.change(sizeInput, { target: { value: '3' } });
    await waitFor(() => expect(passengerInputs().length).toBe(3));

    fireEvent.change(sizeInput, { target: { value: '2' } });
    await waitFor(() => expect(passengerInputs().length).toBe(2));
  });

  it('reset / close / reopen → exactly 1 passenger slot', async () => {
    const view = render(
      <NewSaleWizard
        isOpen={false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.queryByText('Ime i prezime klijenta *')).not.toBeInTheDocument();

    view.rerender(
      <NewSaleWizard
        isOpen
        onClose={vi.fn()}
        onCreated={vi.fn()}
        initialPackageId="package-1"
        initialDepartureId="departure-1"
      />,
    );

    await goToTravelers();
    expect(passengerInputs().length).toBe(1);
  });
});
