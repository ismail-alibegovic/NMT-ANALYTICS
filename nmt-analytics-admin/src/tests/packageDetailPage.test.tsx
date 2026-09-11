import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import PackageDetail from '../pages/PackageDetail';

const getPackageById = vi.fn();
const getPackageCosting = vi.fn();
const createPackageCostItem = vi.fn();
const updatePackageCostItem = vi.fn();
const deletePackageCostItem = vi.fn();
const getSuppliers = vi.fn();
const showError = vi.fn();
let role = 'manager';

vi.mock('../api/packages', () => ({
  getPackageById: (...args: any[]) => getPackageById(...args),
  getPackageCosting: (...args: any[]) => getPackageCosting(...args),
  createPackageCostItem: (...args: any[]) => createPackageCostItem(...args),
  updatePackageCostItem: (...args: any[]) => updatePackageCostItem(...args),
  deletePackageCostItem: (...args: any[]) => deletePackageCostItem(...args),
}));

vi.mock('../api/suppliers', () => ({
  getSuppliers: (...args: any[]) => getSuppliers(...args),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'user-1' }, userContext: { role }, loading: false }),
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

vi.mock('../components/ui/modal', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) => isOpen ? <div><h2>{title}</h2>{children}</div> : null,
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    t: {
      common: { error: 'Error', cancel: 'Cancel', save: 'Save', saving: 'Saving...' },
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
        costing: {
          title: 'Costing',
          description: 'Internal package cost defaults.',
          totalPackageCost: 'Total package cost',
          currency: 'Currency',
          items: 'Items',
          costItems: 'Cost items',
          addItem: 'Add cost',
          editItem: 'Edit cost',
          edit: 'Edit',
          delete: 'Delete',
          retry: 'Retry',
          errorTitle: 'Costing could not be loaded',
          loadError: 'Failed to load package costing.',
          saveError: 'Failed to save package cost.',
          deleteError: 'Failed to delete package cost.',
          validationError: 'Validation error',
          currencyMismatch: 'Currency mismatch',
          emptyTitle: 'No package costs recorded',
          emptyDescription: 'Add internal costs.',
          manualCost: 'Manual cost',
          supplierService: 'Supplier service',
          category: 'Category',
          label: 'Label',
          unit: 'Unit',
          quantity: 'Quantity',
          unitCost: 'Unit cost',
          totalCost: 'Total cost',
          notes: 'Notes',
          categories: { hotel: 'Hotel', transport: 'Transport', flight: 'Flight', tour: 'Tour', insurance: 'Insurance', supplier: 'Supplier', extra_service: 'Extra service', other: 'Other' },
          units: { per_person: 'Per person', per_room: 'Per room', per_night: 'Per night', per_vehicle: 'Per vehicle', per_group: 'Per group', per_booking: 'Per booking', per_day: 'Per day', per_hour: 'Per hour', fixed: 'Fixed' },
        },
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
    role = 'manager';
    getPackageCosting.mockResolvedValue({
      packageId: 'pkg-1',
      currency: 'BAM',
      totalCost: 0,
      costItems: [],
      categoryBreakdown: [],
      warnings: [],
    });
    getSuppliers.mockResolvedValue([]);
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

  it('shows costing to manager and director roles only', async () => {
    getPackageById.mockResolvedValue(packageFixture());

    role = 'manager';
    const manager = render(<PackageRoute />);
    expect(await screen.findByText('Costing')).toBeInTheDocument();
    await waitFor(() => expect(getPackageCosting).toHaveBeenCalledWith('pkg-1'));
    manager.unmount();

    vi.clearAllMocks();
    getPackageById.mockResolvedValue(packageFixture());
    getPackageCosting.mockResolvedValue({ packageId: 'pkg-1', currency: 'BAM', totalCost: 0, costItems: [], categoryBreakdown: [], warnings: [] });
    getSuppliers.mockResolvedValue([]);
    role = 'director';
    const director = render(<PackageRoute />);
    expect(await screen.findByText('Costing')).toBeInTheDocument();
    director.unmount();

    vi.clearAllMocks();
    getPackageById.mockResolvedValue(packageFixture());
    role = 'agent';
    const agent = render(<PackageRoute />);
    await screen.findByText('Umrah Gold');
    expect(screen.queryByText('Costing')).not.toBeInTheDocument();
    expect(getPackageCosting).not.toHaveBeenCalled();
    agent.unmount();

    vi.clearAllMocks();
    getPackageById.mockResolvedValue(packageFixture());
    role = 'viewer';
    render(<PackageRoute />);
    await screen.findByText('Umrah Gold');
    expect(screen.queryByText('Costing')).not.toBeInTheDocument();
    expect(getPackageCosting).not.toHaveBeenCalled();
  });

  it('renders empty state and KPI summary from package costing API', async () => {
    getPackageById.mockResolvedValue(packageFixture());
    getPackageCosting.mockResolvedValue({
      packageId: 'pkg-1',
      currency: 'BAM',
      totalCost: 3750,
      costItems: [],
      categoryBreakdown: [{ category: 'transport', amount: 3750 }],
      warnings: [],
    });

    render(<PackageRoute />);

    expect(await screen.findByText('Total package cost')).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes('3.750,00')).length).toBeGreaterThan(0);
    expect(screen.getByText('No package costs recorded')).toBeInTheDocument();
  });

  it('creates, edits, deletes, and prefills from supplier service without exposing package services', async () => {
    const user = userEvent.setup();
    getPackageById.mockResolvedValue({
      ...packageFixture(),
      package_services: [{ id: 'svc-sell', service_type: 'addon', provider_name: 'Sell add-on', quantity: 1, unit_price: 999, currency: 'BAM' }],
    });
    getSuppliers.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Transport Co',
        category: 'transport',
        status: 'active',
        defaultCurrency: 'BAM',
        services: [
          { id: 'catalog-1', supplierId: 'supplier-1', name: 'Coach net', category: 'transport', unit: 'per_group', netPrice: 100, currency: 'BAM', taxRate: 0, defaultMarkup: 0, validFrom: null, validTo: null, minQuantity: null, maxQuantity: null, active: true, notes: null, createdAt: '', updatedAt: '' },
          { id: 'catalog-inactive', supplierId: 'supplier-1', name: 'Inactive coach net', category: 'transport', unit: 'per_group', netPrice: 75, currency: 'BAM', taxRate: 0, defaultMarkup: 0, validFrom: null, validTo: null, minQuantity: null, maxQuantity: null, active: false, notes: null, createdAt: '', updatedAt: '' },
        ],
      },
    ]);
    getPackageCosting.mockResolvedValueOnce({ packageId: 'pkg-1', currency: 'BAM', totalCost: 0, costItems: [], categoryBreakdown: [], warnings: [] });
    getPackageCosting.mockResolvedValue({ packageId: 'pkg-1', currency: 'BAM', totalCost: 100, costItems: [{ id: 'cost-1', packageId: 'pkg-1', category: 'transport', label: 'Coach net', supplierId: 'supplier-1', supplierName: 'Transport Co', supplierServiceId: 'catalog-1', supplierServiceName: 'Coach net', unit: 'per_group', quantity: 1, unitCost: 100, totalCost: 100, currency: 'BAM', notes: null, createdAt: '', updatedAt: '' }], categoryBreakdown: [], warnings: [] });
    createPackageCostItem.mockResolvedValue({});
    updatePackageCostItem.mockResolvedValue({});
    deletePackageCostItem.mockResolvedValue({});

    render(<PackageRoute />);
    await waitFor(() => expect(screen.getAllByTestId('table').some((node) => node.textContent === '1')).toBe(true));
    await user.click(screen.getAllByRole('button', { name: 'Add cost' })[0]);
    expect(screen.getByRole('option', { name: /Coach net/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Inactive coach net/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Supplier service'), 'catalog-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createPackageCostItem).toHaveBeenCalledWith('pkg-1', expect.objectContaining({
      supplierServiceId: 'catalog-1',
      supplierId: 'supplier-1',
      label: 'Coach net',
      unitCost: 100,
      currency: 'BAM',
    }));

    await waitFor(() => expect(screen.getAllByText('Coach net').length).toBeGreaterThan(0));
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[editButtons.length - 1]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updatePackageCostItem).toHaveBeenCalledWith('pkg-1', 'cost-1', expect.any(Object));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deletePackageCostItem).toHaveBeenCalledWith('pkg-1', 'cost-1');
    expect(screen.getAllByTestId('table').some((node) => node.textContent === '1')).toBe(true);
  });

  it('edits a historical inactive supplier-service cost without exposing it for new selection', async () => {
    const user = userEvent.setup();
    getPackageById.mockResolvedValue(packageFixture());
    getSuppliers.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Transport Co',
        category: 'transport',
        status: 'active',
        defaultCurrency: 'BAM',
        services: [
          { id: 'catalog-active', supplierId: 'supplier-1', name: 'Active coach net', category: 'transport', unit: 'per_group', netPrice: 120, currency: 'BAM', taxRate: 0, defaultMarkup: 0, validFrom: null, validTo: null, minQuantity: null, maxQuantity: null, active: true, notes: null, createdAt: '', updatedAt: '' },
          { id: 'catalog-inactive', supplierId: 'supplier-1', name: 'Inactive coach net', category: 'transport', unit: 'per_group', netPrice: 75, currency: 'BAM', taxRate: 0, defaultMarkup: 0, validFrom: null, validTo: null, minQuantity: null, maxQuantity: null, active: false, notes: null, createdAt: '', updatedAt: '' },
        ],
      },
    ]);
    getPackageCosting.mockResolvedValue({
      packageId: 'pkg-1',
      currency: 'BAM',
      totalCost: 100,
      costItems: [{
        id: 'cost-inactive',
        packageId: 'pkg-1',
        category: 'transport',
        label: 'Inactive coach net',
        supplierId: 'supplier-1',
        supplierName: 'Transport Co',
        supplierServiceId: 'catalog-inactive',
        supplierServiceName: 'Inactive coach net',
        unit: 'per_group',
        quantity: 1,
        unitCost: 100,
        totalCost: 100,
        currency: 'BAM',
        notes: null,
        createdAt: '',
        updatedAt: '',
      }],
      categoryBreakdown: [],
      warnings: [],
    });
    updatePackageCostItem.mockResolvedValue({});

    render(<PackageRoute />);
    await screen.findByText('Total package cost');
    await user.click(screen.getAllByRole('button', { name: 'Add cost' })[0]);
    expect(screen.getByRole('option', { name: /Active coach net/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Inactive coach net/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add cost' })).not.toBeInTheDocument());

    expect((await screen.findAllByText('Inactive coach net')).length).toBeGreaterThan(0);
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[editButtons.length - 1]);
    const dialog = screen.getByText('Edit cost').closest('div')!;
    expect(within(dialog).getByRole('option', { name: /Inactive coach net/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Supplier service')).toHaveValue('catalog-inactive');
    expect(within(dialog).getByLabelText('Quantity')).toHaveValue(1);
    expect(within(dialog).getByLabelText('Unit cost')).toHaveValue(100);
  });
});

function packageFixture() {
  return {
    id: 'pkg-1',
    name: 'Umrah Gold',
    destination: 'Medina',
    price: 1200,
    currency: 'BAM',
    active: true,
    created_at: '2026-08-30T10:00:00.000Z',
    package_services: [],
    packageHotels: [],
    departures: [],
  };
}

function PackageRoute() {
  return (
    <MemoryRouter initialEntries={['/packages/pkg-1?tab=costing']}>
      <Routes>
        <Route path="/packages/:id" element={<PackageDetail />} />
      </Routes>
    </MemoryRouter>
  );
}
