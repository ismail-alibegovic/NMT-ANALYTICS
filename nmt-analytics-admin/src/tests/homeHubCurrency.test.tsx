import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeHub from '../pages/Hub/HomeHub';

let overviewResponse: any;
let revenueResponse: any[];

const getAnalyticsOverviewV2 = vi.fn(async (_filters?: any) => overviewResponse);
const getRevenueSeries = vi.fn(async (_filters?: any) => revenueResponse);
const getDepartures = vi.fn(async (_params?: any) => ({ data: [] }));
const getReservations = vi.fn(async (_params?: any) => ({ total: 0, data: [] }));
const getPaymentDashboard = vi.fn(async () => ({ metrics: { overdueCount: 0 }, overdueReservations: [] }));

vi.mock('../api/analytics', () => ({
  getAnalyticsOverviewV2: (filters?: any) => getAnalyticsOverviewV2(filters),
  getRevenueSeries: (filters?: any) => getRevenueSeries(filters),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (params?: any) => getDepartures(params),
  getDeparture: vi.fn(),
  getDeparturePassengers: vi.fn(),
  generateRoomingProposal: vi.fn(),
}));

vi.mock('../api/reservations', () => ({
  getReservations: (params?: any) => getReservations(params),
}));

vi.mock('../api/payments', () => ({
  getPaymentDashboard: () => getPaymentDashboard(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ userContext: { role: 'manager', org: { name: 'Travline', currency: 'BAM' } } }),
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

const hub = {
  title: 'Hub',
  subtitle: 'Hub subtitle',
  good_night: 'Good night',
  good_morning: 'Good morning',
  good_afternoon: 'Good afternoon',
  good_evening: 'Good evening',
  focusNewReservation: 'New reservation',
  untitledDeparture: 'Untitled departure',
  alertFlightMissing: 'Flight missing',
  alertDocumentsAttention: 'Documents {count}',
  alertRoomingMissingConfig: 'Rooming missing',
  alertGroupSplit: 'Groups {count}',
  alertRoomingUnassigned: 'Unassigned {count}',
  needsAttentionTitle: 'Needs attention',
  todayQueueTitle: 'Today queue',
  needsAttentionSubtitle: 'Queue subtitle',
  todayQueueSubtitle: 'Queue subtitle',
  todayPendingReservations: 'Pending reservations',
  attentionOutstanding: 'Outstanding',
  todayNearDepartures: 'Near departures',
  needsAttentionError: 'Queue error',
  todayQueueError: 'Queue error',
  needsAttentionClear: 'All clear',
  todayQueueClear: 'All clear',
  needsAttentionClearDetail: 'Nothing pending',
  todayQueueClearDetail: 'Nothing pending',
  recentDepartures: 'Recent departures',
  quietPeriod: 'Quiet period',
  recent: 'Recent',
  kpiRevenue: 'Revenue',
  kpiOutstanding: 'Outstanding',
  focusOutstanding: 'Outstanding focus',
  paymentsPanel: 'Payments panel',
  allSettled: 'All settled',
  finTitle: 'Finance',
  sysTitle: 'System',
  sReservations: 'Reservations',
  sPackages: 'Packages',
  sCalendar: 'Calendar',
  sCustomers: 'Customers',
  sReports: 'Reports',
  sBranding: 'Branding',
};

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({ t: { hub, reservations: { customer: 'Customer' }, common: { amount: 'Amount' } }, lang: 'bs' }),
}));

function seedSingle(currency: string) {
  overviewResponse = {
    reservations_count: 2,
    total_amount_sum: currency === 'EUR' ? 200 : 100,
    total_paid_sum: currency === 'EUR' ? 150 : 80,
    total_balance_sum: currency === 'EUR' ? 50 : 20,
    unpaid_count: 0,
    partially_paid_count: 2,
    paid_count: 0,
    avg_reservation_value: currency === 'EUR' ? 100 : 50,
    payments_count: 1,
    payments_sum: currency === 'EUR' ? 150 : 80,
    currency,
    availableCurrencies: [currency],
    multiCurrency: false,
    date_from: '2026-01-01',
    date_to: '2026-01-31',
  };
  revenueResponse = [
    { date: '2026-01-14', total_amount_sum: currency === 'EUR' ? 100 : 50, total_paid_sum: currency === 'EUR' ? 80 : 40, currency },
    { date: '2026-01-15', total_amount_sum: currency === 'EUR' ? 100 : 50, total_paid_sum: currency === 'EUR' ? 70 : 40, currency },
  ];
}

function seedMixed() {
  overviewResponse = {
    reservations_count: 2,
    total_amount_sum: null,
    total_paid_sum: null,
    total_balance_sum: null,
    unpaid_count: 0,
    partially_paid_count: 2,
    paid_count: 0,
    avg_reservation_value: null,
    payments_count: 2,
    payments_sum: null,
    currency: null,
    availableCurrencies: ['BAM', 'EUR'],
    multiCurrency: true,
    date_from: '2026-01-01',
    date_to: '2026-01-31',
  };
  revenueResponse = [
    { date: '2026-01-15', total_amount_sum: 100, total_paid_sum: 80, currency: 'BAM' },
    { date: '2026-01-15', total_amount_sum: 200, total_paid_sum: 150, currency: 'EUR' },
  ];
}

function renderHub() {
  return render(
    <MemoryRouter>
      <HomeHub />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seedSingle('BAM');
});

describe('HomeHub currency handling', () => {
  it('renders BAM-only finance data without mixed selector', async () => {
    seedSingle('BAM');
    renderHub();

    await screen.findByText('Revenue');
    expect(screen.queryByRole('button', { name: 'EUR' })).not.toBeInTheDocument();
    expect(screen.queryByText('Select currency')).not.toBeInTheDocument();
  });

  it('renders EUR-only finance data without relabeling it as KM', async () => {
    seedSingle('EUR');
    renderHub();

    await screen.findByText('Revenue');
    expect(screen.getAllByText(/50 EUR/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/50 KM/)).not.toBeInTheDocument();
  });

  it('does not chart mixed currencies or show all settled for mixed balances', async () => {
    seedMixed();
    renderHub();

    expect(await screen.findByRole('button', { name: 'BAM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getAllByText('Select currency').length).toBeGreaterThan(0);
    expect(screen.queryByText('All settled')).not.toBeInTheDocument();
  });

  it('refetches monetary Hub analytics with EUR after selection', async () => {
    seedMixed();
    renderHub();

    const eur = await screen.findByRole('button', { name: 'EUR' });
    seedSingle('EUR');
    fireEvent.click(eur);

    await waitFor(() => {
      expect(getAnalyticsOverviewV2).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'EUR' }));
      expect(getRevenueSeries).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'EUR' }));
    });
  });
});
