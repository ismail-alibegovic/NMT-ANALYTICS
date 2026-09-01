import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewSaleWizard from '../components/reservations/NewSaleWizard';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getCustomers = vi.fn();
const createReservation = vi.fn();

vi.mock('../components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
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
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const pkg = {
  id: 'pkg-1',
  name: 'Antalya Summer 2027',
  destination: 'Antalya',
  price: 990,
  base_price: 990,
  currency: 'BAM',
  variants: [],
};

const busDeparture = {
  id: 'dep-bus',
  package_id: 'pkg-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 18,
  capacity: 50,
  status: 'active',
  transport_type: 'bus',
};

const flightDeparture = {
  id: 'dep-flight',
  package_id: 'pkg-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 20,
  capacity: 25,
  status: 'active',
  transport_type: 'flight',
};

function renderWizard(initialPackageId?: string) {
  return render(
    <NewSaleWizard
      isOpen
      onClose={vi.fn()}
      onCreated={vi.fn()}
      initialPackageId={initialPackageId}
    />
  );
}

describe('NewSaleWizard — clear transport alternatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDepartureAccommodationOptions.mockResolvedValue({ items: [] });
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('shows no transport alternatives banner when package has a single bus departure', async () => {
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture] });

    renderWizard('pkg-1');

    await waitFor(() => expect(screen.getByText(/Antalya Summer/)).toBeInTheDocument());

    // Single transport type: no "Dostupan prijevoz" banner
    expect(screen.queryByText(/Dostupan prijevoz/)).not.toBeInTheDocument();

    // Bus badge present on the card
    expect(screen.getByText('🚌 Autobus')).toBeInTheDocument();

    // Remaining seats rendered as human-readable context (50 - 18 = 32)
    expect(screen.getByText('32 mjesta')).toBeInTheDocument();
    expect(screen.getByText('18/50 popunjeno')).toBeInTheDocument();
  });

  it('shows transport alternatives banner when package has Bus + Flight departures', async () => {
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture, flightDeparture] });

    renderWizard('pkg-1');

    await waitFor(() => expect(screen.getByText(/Antalya Summer/)).toBeInTheDocument());

    expect(screen.getByText('Dostupan prijevoz:')).toBeInTheDocument();
    expect(screen.getByText('🚌 Autobus · ✈️ Avion')).toBeInTheDocument();
  });

  it('keeps Bus and Flight departures distinct and selectable on the same date', async () => {
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture, flightDeparture] });

    renderWizard('pkg-1');

    await waitFor(() => expect(screen.getByText(/Antalya Summer/)).toBeInTheDocument());

    // Both cards render their own transport badge and remaining seats
    const busCard = screen.getByText('🚌 Autobus').closest('button')!;
    const flightCard = screen.getByText('✈️ Avion').closest('button')!;
    expect(busCard).not.toBe(flightCard);

    expect(within(busCard).getByText('32 mjesta')).toBeInTheDocument();
    expect(within(flightCard).getByText('5 mjesta')).toBeInTheDocument();

    // Selecting the bus departure does not select the flight departure
    fireEvent.click(busCard);
    expect(busCard.className).toContain('border-brand-500');
    expect(flightCard.className).not.toContain('border-brand-500');
  });

  it('correctly reports remaining capacity (not ambiguous booked/capacity ratio)', async () => {
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [flightDeparture] });

    renderWizard('pkg-1');

    await waitFor(() => expect(screen.getByText(/Antalya Summer/)).toBeInTheDocument());

    expect(screen.getByText('✈️ Avion')).toBeInTheDocument();
    expect(screen.getByText('5 mjesta')).toBeInTheDocument();
    expect(screen.getByText('20/25 popunjeno')).toBeInTheDocument();
  });

  it('selecting one departure does not mutate the other departure data', async () => {
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [busDeparture, flightDeparture] });

    renderWizard('pkg-1');

    await waitFor(() => expect(screen.getByText(/Antalya Summer/)).toBeInTheDocument());

    const busCard = screen.getByText('🚌 Autobus').closest('button')!;
    const flightCard = screen.getByText('✈️ Avion').closest('button')!;

    fireEvent.click(flightCard);
    expect(flightCard.className).toContain('border-brand-500');
    expect(busCard.className).not.toContain('border-brand-500');
  });
});
