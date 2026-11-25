import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import { ToastProvider } from '../context/ToastContext';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';

const capturedApex = vi.hoisted(() => ({ options: null as any }));
const stableAuth = vi.hoisted(() => ({
  user: { id: 'u-1', email: 'director@test.invalid' },
  loading: false,
  userContext: { org: { id: 'o-1', name: 'Org', currency: 'BAM' }, role: 'director', modules: [] },
}));
const apiMocks = vi.hoisted(() => ({
  getPackages: vi.fn(),
  deletePackage: vi.fn(),
  getCustomers: vi.fn(),
  deleteCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  getCalendarMonth: vi.fn(),
  getDepartures: vi.fn(),
  getAvailability: vi.fn(),
  getDepartureRoomSlots: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../context/ToastContext', () => ({
  useToast: () => toastMock,
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../lib/apiClient', () => ({
  default: { post: vi.fn(), get: vi.fn(), defaults: { baseURL: '/api' } },
  get: vi.fn(),
}));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../context/AppContext', () => ({
  useApp: () => stableAuth,
}));
vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons');
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = () => <span data-icon={key} />;
  }
  return mocked;
});
vi.mock('react-apexcharts', () => ({
  default: ({ options }: { options: any }) => {
    capturedApex.options = options;
    return <div data-testid="mock-donut-chart" />;
  },
}));
vi.mock('../components/import/ImportModal', () => ({ default: () => null }));
vi.mock('../components/packages/PackageEditorModal', () => ({ default: () => null }));
vi.mock('../api/packages', () => ({
  getPackages: (...args: unknown[]) => apiMocks.getPackages(...args),
  deletePackage: (...args: unknown[]) => apiMocks.deletePackage(...args),
}));
vi.mock('../api/customers', () => ({
  getCustomers: (...args: unknown[]) => apiMocks.getCustomers(...args),
  deleteCustomer: (...args: unknown[]) => apiMocks.deleteCustomer(...args),
  createCustomer: (...args: unknown[]) => apiMocks.createCustomer(...args),
  updateCustomer: (...args: unknown[]) => apiMocks.updateCustomer(...args),
}));
vi.mock('../api/calendar', () => ({
  getCalendarMonth: (...args: unknown[]) => apiMocks.getCalendarMonth(...args),
}));
vi.mock('../api/departures', () => ({
  getDepartures: (...args: unknown[]) => apiMocks.getDepartures(...args),
  getDepartureRoomSlots: (...args: unknown[]) => apiMocks.getDepartureRoomSlots(...args),
  assignPassengerToRoomSlot: vi.fn(),
  moveRoomSlotAssignment: vi.fn(),
  unassignPassengerFromRoomSlot: vi.fn(),
  setRoomSlotAssignmentLocked: vi.fn(),
  updateRoomSlotPhysicalNumber: vi.fn(),
  generateOperationalRoomingProposal: vi.fn(),
  applyRoomingProposal: vi.fn(),
}));
vi.mock('../api/availability', () => ({
  getAvailability: (...args: unknown[]) => apiMocks.getAvailability(...args),
}));

import RoomingWorkspace from '../components/operations/RoomingWorkspace';
import CreateReservationModal from '../components/reservations/CreateReservationModal';
import Calendar from '../pages/operations/Calendar';
import Availability from '../pages/operations/Availability';
import Packages from '../pages/admin/Packages';
import Customers from '../pages/admin/Customers';
import DonutChart from '../components/charts/DonutChart';

describe('Final BS/EN parity sweep — zero cross-language mixing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    capturedApex.options = null;
    apiMocks.getPackages.mockResolvedValue({ data: [{ id: 'pkg-1', name: 'Mostar', destination: 'BiH', currency: 'BAM', price: 250, active: true }], total: 1 });
    apiMocks.getCustomers.mockResolvedValue({ data: [{ id: 'c-1', full_name: 'Amina Hadžić', phone: '+38761000111', email: 'amina@test.invalid', status: 'active' }], total: 1 });
    apiMocks.getCalendarMonth.mockResolvedValue({ events: [] });
    apiMocks.getDepartures.mockResolvedValue({
      data: [{
        id: 'dep-1',
        package_id: 'pkg-1',
        depart_at: '2041-04-23T08:00:00Z',
        capacity: 40,
        booked: 10,
        status: 'active',
      }],
    });
    apiMocks.getAvailability.mockResolvedValue({
      capacity: 40,
      booked: 10,
      available: 30,
      occupancy_status: 'available',
      transport_type: 'bus',
      seats_occupied: [],
      rooms: [],
    });
    apiMocks.getDepartureRoomSlots.mockResolvedValue([
      {
        id: 'slot-1',
        orgId: 'o-1',
        departureId: 'dep-1',
        hotelId: 'h-1',
        hotelAllocationId: 'ha-1',
        roomType: 'double',
        slotIndex: 1,
        displayLabel: 'Double 01',
        actualHotelRoomNumber: null,
        capacity: 2,
        hotel: { id: 'h-1', name: 'Hotel Azure' },
        assignments: [{ id: 'a-1', passengerId: 'pax-1', passengerName: 'Amina Hadžić', locked: false }],
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it.each([
    ['bs', bs],
    ['en', en],
  ] as const)('renders RoomingWorkspace, CreateReservationModal, Calendar, Availability, and DonutChart strictly in %s', async (lang, copy) => {
    localStorage.setItem('travline_lang', lang);
    const now = new Date();

    render(
      <I18nProvider>
        <ToastProvider>
          <RoomingWorkspace departureId="dep-1" passengers={[{ id: 'pax-2', passengerId: 'pax-2', fullName: 'Emir Kovač' }] as any} />
          <CreateReservationModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
          <MemoryRouter><Calendar /></MemoryRouter>
          <MemoryRouter><Availability /></MemoryRouter>
          <DonutChart title="Payments" labels={['Paid']} series={[1250]} />
          <DonutChart title="Empty" labels={['Paid']} series={[]} />
        </ToastProvider>
      </I18nProvider>,
    );

    // RoomingWorkspace uses operations.rooming in selected language
    await screen.findByText('Double 01');
    expect(screen.getByText(copy.operations.rooming.unassigned)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.operations.rooming.generateProposal })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.operations.rooming.lock })).toBeInTheDocument();

    // CreateReservationModal is fully localized
    expect(screen.getByRole('heading', { name: copy.createReservationModal.title })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: copy.createReservationModal.noPackageOption })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.createReservationModal.submit })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.createReservationModal.cancel })).toBeInTheDocument();

    // Calendar weekdays/months/legend in active language
    expect(screen.getAllByText(copy.operations.calendar.legendAvailable).length).toBeGreaterThan(0);
    expect(screen.getAllByText(copy.operations.calendar.legendFull).length).toBeGreaterThan(0);
    expect(screen.getByText(copy.operations.calendar.weekdays[0])).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `${copy.operations.calendar.months[now.getMonth()]} ${now.getFullYear()}` })).toBeInTheDocument();

    // Availability status & unknown package localized
    await waitFor(() => {
      expect(screen.getAllByText(copy.operations.availability.statuses.available).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('option', { name: copy.operations.availability.unknownPackage })).toBeInTheDocument();

    // DonutChart total & empty state localized
    expect(screen.getByText(copy.common.noPaymentData)).toBeInTheDocument();
    expect(capturedApex.options?.plotOptions?.pie?.donut?.labels?.total?.label).toBe(copy.common.total);
  });

  it.each([
    ['bs', bs],
    ['en', en],
  ] as const)('renders Packages and Customers empty/error/status copy strictly in %s', async (lang, copy) => {
    localStorage.setItem('travline_lang', lang);
    apiMocks.getPackages.mockRejectedValueOnce(new Error('Network down'));
    apiMocks.getCustomers.mockResolvedValueOnce({ data: [], total: 0 });

    render(
      <I18nProvider>
        <ToastProvider>
          <MemoryRouter><Packages /></MemoryRouter>
          <MemoryRouter><Customers /></MemoryRouter>
        </ToastProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: copy.common.tryAgain })).toBeInTheDocument();
    });
    expect(toastMock.error).toHaveBeenCalledWith(copy.packages.loadError);
    expect(screen.getByText(copy.customers.noCustomers)).toBeInTheDocument();
    expect(screen.getByText(copy.customers.emptyFirstDescription)).toBeInTheDocument();
  });
});
