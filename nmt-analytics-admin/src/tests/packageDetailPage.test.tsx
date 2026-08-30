import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import PackageDetail from '../pages/PackageDetail';

const getPackageById = vi.fn();
const showError = vi.fn();

vi.mock('../api/packages', () => ({
  getPackageById: (...args: any[]) => getPackageById(...args),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'user-1' }, loading: false }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: showError }),
}));

vi.mock('../components/packages/PackageEditorModal', () => ({
  default: () => null,
}));

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

vi.mock('../components/ui/PageToolbar', () => ({
  default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <div><h1>{title}</h1>{actions}</div>,
}));

vi.mock('../components/ui/DataTable', () => ({
  DataTable: ({ data }: { data: Array<{ id: string }> }) => <div data-testid="table">{data.length}</div>,
}));

vi.mock('../components/ui/button/Button', () => ({
  default: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}));

vi.mock('../components/ui/badge/Badge', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('../components/ui/EmptyState', () => ({
  default: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onClick: () => void } }) => (
    <div>
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
      {action ? <button onClick={action.onClick}>{action.label}</button> : null}
    </div>
  ),
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    t: {
      common: { error: 'Error' },
      payments: { note: 'Note' },
      departures: { title: 'Departures' },
      operations: { hotels: {} },
      packages: {
        edit: 'Edit package',
        overview: 'Overview',
        pricingAndDefaults: 'Pricing & Defaults',
        linkedServices: 'Linked services',
        linkedHotels: 'Linked hotels',
        noLinkedServices: 'No linked services',
        noLinkedHotels: 'No linked hotels',
        noLinkedHotelsDescription: 'No package accommodation has been configured yet. Open the editor to attach hotels and room options.',
        departures: 'Departures',
        packageNotFound: 'Package not found',
        packageNotFoundDescription: 'Package missing',
        backToPackages: 'Back to packages',
        active: 'Active',
        inactive: 'Inactive',
        noDescription: 'No description',
        basePrice: 'Base Price',
        currency: 'Currency',
        duration: 'Duration',
        maxParticipants: 'Max Participants',
        tripType: 'Trip type',
        transportType: 'Transport',
        createdAt: 'Created',
        provider: 'Provider',
        quantity: 'Quantity',
        routeToHotel: 'Open in Hotels',
        openDeparture: 'Open departure',
        booked: 'Booked',
        status: 'Status',
        roomOptions: 'Room options',
        priceModifier: 'Price modifier',
        editor: {
          sortOrderLabel: 'Sort order',
          roomTypeLabels: {
            single: 'Single',
            double: 'Double',
            triple: 'Triple',
            apartment: 'Apartment',
            studio: 'Studio',
            suite: 'Suite',
          },
          netPriceLabel: 'Net price',
          sellPriceLabel: 'Sell price',
          availableLabel: 'Available quantity',
          noHotelDestination: 'No destination',
        },
      },
    },
  }),
}));

describe('PackageDetail accommodation display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders canonical package hotel room options', async () => {
    getPackageById.mockResolvedValue({
      id: 'pkg-1',
      name: 'Umrah Gold',
      destination: 'Medina',
      price: 1200,
      currency: 'BAM',
      active: true,
      created_at: '2026-08-30T10:00:00.000Z',
      package_services: [],
      packageHotels: [
        {
          id: 'link-1',
          packageId: 'pkg-1',
          hotelId: 'hotel-1',
          priceModifier: 50,
          sortOrder: 2,
          hotel: { id: 'hotel-1', name: 'Hotel Bosna', destination: 'Sarajevo', stars: 4 },
          roomOptions: [
            { type: 'double', label: 'Double room', net_price: 80, sell_price: 100, available: 5 },
          ],
        },
      ],
      departures: [],
    });

    render(
      <MemoryRouter initialEntries={['/packages/pkg-1']}>
        <Routes>
          <Route path="/packages/:id" element={<PackageDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPackageById).toHaveBeenCalledWith('pkg-1'));
    expect(await screen.findByText('Hotel Bosna')).toBeInTheDocument();
    expect(screen.getByText('Double room')).toBeInTheDocument();
    expect(screen.getByText('Double')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Price modifier'))).toBeInTheDocument();
  });

  it('renders an accommodation empty state with an edit action', async () => {
    getPackageById.mockResolvedValue({
      id: 'pkg-1',
      name: 'No Hotels Package',
      destination: 'Istanbul',
      price: 900,
      currency: 'BAM',
      active: true,
      created_at: '2026-08-30T10:00:00.000Z',
      package_services: [],
      packageHotels: [],
      departures: [],
    });

    render(
      <MemoryRouter initialEntries={['/packages/pkg-1']}>
        <Routes>
          <Route path="/packages/:id" element={<PackageDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No linked hotels')).toBeInTheDocument();
    expect(screen.getByText('No package accommodation has been configured yet. Open the editor to attach hotels and room options.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit package' }).length).toBeGreaterThan(0);
  });
});
