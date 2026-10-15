import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeHub from '../pages/Hub/HomeHub';

let readinessResponse: any = { departures: [] };
let currentUserRole = 'manager';

const getReadinessSummary = vi.fn(async () => readinessResponse);
const getAnalyticsOverviewV2 = vi.fn(async () => ({
  reservations_count: 5,
  confirmed_count: 5,
  active_packages_count: 2,
  active_departures_count: 2,
  total_revenue: '1000',
  currency: 'BAM',
}));
const getRevenueSeries = vi.fn(async () => []);
const getDepartures = vi.fn(async () => ({ data: [] }));
const getReservations = vi.fn(async () => ({ total: 0, data: [] }));
const getPaymentDashboard = vi.fn(async () => ({ metrics: { overdueCount: 0 }, overdueReservations: [] }));

vi.mock('../api/analytics', () => ({
  getAnalyticsOverviewV2: () => getAnalyticsOverviewV2(),
  getRevenueSeries: () => getRevenueSeries(),
}));

vi.mock('../api/departures', () => ({
  getDepartures: () => getDepartures(),
  getReadinessSummary: () => getReadinessSummary(),
}));

vi.mock('../api/reservations', () => ({
  getReservations: () => getReservations(),
}));

vi.mock('../api/payments', () => ({
  getPaymentDashboard: () => getPaymentDashboard(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ userContext: { role: currentUserRole, org: { name: 'Travline', currency: 'BAM' } } }),
}));

vi.mock('../context/QuickCreateContext', () => ({
  useQuickCreate: () => ({ openQuickCreate: vi.fn() }),
}));

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/hub/QuickStart', () => ({ default: () => <div data-testid="quick-start" /> }));

vi.mock('../icons', () => {
  const Icon = (props: any) => <svg data-testid="icon" {...props} />;
  return {
    ArrowRightIcon: Icon,
    PlusIcon: Icon,
    CalenderIcon: Icon,
    DollarLineIcon: Icon,
    TableIcon: Icon,
    BoxIconLine: Icon,
    PieChartIcon: Icon,
    UserCircleIcon: Icon,
    GroupIcon: Icon,
    CheckCircleIcon: Icon,
    LockIcon: Icon,
  };
});

import { I18nProvider } from '../lib/i18n/context';

function renderHub() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('HomeHub Trip Readiness Alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserRole = 'manager';
    readinessResponse = { departures: [] };
  });

  it('renders unassigned bus seating alert and links to passengers tab', async () => {
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-bus-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Sarajevo - Istanbul',
          hasBusTransport: true,
          unassignedSeats: 8,
        },
      ],
    };

    renderHub();

    const alert = await screen.findByText('8 passengers need seat assignment');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('a')).toHaveAttribute('href', '/departures/dep-bus-1?tab=passengers');
  });

  it('renders capacity full alert and links to overview tab', async () => {
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-full-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Paris Weekend',
          capacity: 40,
          booked: 40,
          isCapacityFull: true,
        },
      ],
    };

    renderHub();

    const alert = await screen.findByText('Capacity full (40/40)');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('a')).toHaveAttribute('href', '/departures/dep-full-1?tab=overview');
  });

  it('renders accommodation unconfigured alert and links to hotels tab', async () => {
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-hotel-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Rome Getaway',
          hasAccommodation: true,
          accommodationConfigured: false,
        },
      ],
    };

    renderHub();

    const alert = await screen.findByText('Accommodation is not configured');
    expect(alert).toBeInTheDocument();
    expect(alert.closest('a')).toHaveAttribute('href', '/departures/dep-hotel-1?tab=hotels');
  });

  it('renders rooming unassigned and group split alerts with correct links', async () => {
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-room-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Vienna Tour',
          hasAccommodation: true,
          accommodationConfigured: true,
          splitOrPartialGroups: 2,
          unassignedAccommodation: 4,
        },
      ],
    };

    renderHub();

    const splitAlert = await screen.findByText('2 passenger groups are split or partial');
    expect(splitAlert.closest('a')).toHaveAttribute('href', '/departures/dep-room-1?tab=hotels');

    const unassignedAlert = await screen.findByText('4 passengers still need rooming');
    expect(unassignedAlert.closest('a')).toHaveAttribute('href', '/departures/dep-room-1?tab=hotels');
  });

  it('renders operational alerts for agent role without exposing supplier alerts', async () => {
    currentUserRole = 'agent';
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-agent-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Budapest Express',
          hasBusTransport: true,
          unassignedSeats: 5,
          supplierIssues: 0,
        },
      ],
    };

    renderHub();

    const alert = await screen.findByText('5 passengers need seat assignment');
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText(/Supplier confirmations outstanding/)).not.toBeInTheDocument();
  });

  it('renders operational alerts in Bosnian when language is bs', async () => {
    localStorage.setItem('travline_lang', 'bs');
    readinessResponse = {
      departures: [
        {
          departureId: 'dep-bs-1',
          departAt: new Date(Date.now() + 86400000).toISOString(),
          departureLabel: 'Sarajevo Tura',
          hasBusTransport: true,
          unassignedSeats: 8,
          capacity: 40,
          booked: 40,
          isCapacityFull: true,
        },
      ],
    };

    renderHub();

    const seatAlert = await screen.findByText('8 putnika nema dodijeljeno sjedište');
    expect(seatAlert).toBeInTheDocument();
    expect(seatAlert.closest('a')).toHaveAttribute('href', '/departures/dep-bs-1?tab=passengers');

    const capAlert = await screen.findByText('Kapacitet popunjen (40/40)');
    expect(capAlert).toBeInTheDocument();
    expect(capAlert.closest('a')).toHaveAttribute('href', '/departures/dep-bs-1?tab=overview');
    localStorage.removeItem('travline_lang');
  });
});
