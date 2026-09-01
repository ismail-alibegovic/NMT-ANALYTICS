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

const sharedPackage = { id: 'pkg-shared', name: 'Antalya Summer', destination: 'Antalya', price: 990, base_price: 990, currency: 'BAM', variants: [] };

const busDeparture = {
  id: 'dep-bus',
  package_id: 'pkg-shared',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 0,
  capacity: 50,
  status: 'active',
  transport_type: 'bus',
};

const flightDeparture = {
  id: 'dep-flight',
  package_id: 'pkg-shared',
  depart_at: '2027-06-10T12:00:00.000Z',
  return_at: '2027-06-17T22:00:00.000Z',
  booked: 0,
  capacity: 25,
  status: 'active',
  transport_type: 'flight',
};

async function completeSale(
  customerName: string,
  customerPhone: string,
) {
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: customerName } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: customerPhone } });
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Ukupan iznos (BAM)')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Pregled prodaje')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));
  await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
}

describe('NewSaleWizard — departure transport identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDepartureAccommodationOptions.mockResolvedValue({ items: [] });
    getPackageServices.mockResolvedValue([]);
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('Bus departure: no transport dropdown in details, Review shows Autobus', async () => {
    getPackages.mockResolvedValue({ data: [sharedPackage] });
    getDepartures.mockResolvedValue({ data: [busDeparture] });

    render(<NewSaleWizard isOpen onClose={vi.fn()} onCreated={vi.fn()} initialPackageId="pkg-shared" initialDepartureId="dep-bus" />);
    expect(await screen.findByText('Antalya Summer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.queryByText('+ Prikaži prijevoz')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prijevoz')).not.toBeInTheDocument();

    await completeSale('Kupac Bus', '+38761000001');

    expect(screen.getByText('Autobus')).toBeInTheDocument();
    expect(screen.queryByText('Avion')).not.toBeInTheDocument();
  });

  it('Flight departure: no transport dropdown in details, Review shows Avion', async () => {
    getPackages.mockResolvedValue({ data: [sharedPackage] });
    getDepartures.mockResolvedValue({ data: [flightDeparture] });

    render(<NewSaleWizard isOpen onClose={vi.fn()} onCreated={vi.fn()} initialPackageId="pkg-shared" initialDepartureId="dep-flight" />);
    expect(await screen.findByText('Antalya Summer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.queryByText('+ Prikaži prijevoz')).not.toBeInTheDocument();

    await completeSale('Kupac Flight', '+38761000002');

    expect(screen.getByText('Avion')).toBeInTheDocument();
  });

  it('Bus and Flight departures of same package are two separate choices', async () => {
    getPackages.mockResolvedValue({ data: [sharedPackage] });
    getDepartures.mockResolvedValue({ data: [busDeparture, flightDeparture] });

    render(<NewSaleWizard isOpen onClose={vi.fn()} onCreated={vi.fn()} initialPackageId="pkg-shared" />);
    expect(await screen.findByText('Antalya Summer')).toBeInTheDocument();

    const busText = screen.getByText('🚌 Autobus');
    const flightText = screen.getByText('✈️ Avion');
    expect(busText).toBeInTheDocument();
    expect(flightText).toBeInTheDocument();
  });

  it('After Flight departure selection, options has transport_type and no transport_request', async () => {
    getPackages.mockResolvedValue({ data: [sharedPackage] });
    getDepartures.mockResolvedValue({ data: [flightDeparture] });

    render(<NewSaleWizard isOpen onClose={vi.fn()} onCreated={vi.fn()} initialPackageId="pkg-shared" initialDepartureId="dep-flight" />);
    expect(await screen.findByText('Antalya Summer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    await completeSale('Kupac Flight2', '+38761000003');

    const callOptions = createReservation.mock.calls[0][0].options;
    expect(callOptions.transport_type).toBe('flight');
    expect(callOptions.transport_request).toBeUndefined();
  });
});
