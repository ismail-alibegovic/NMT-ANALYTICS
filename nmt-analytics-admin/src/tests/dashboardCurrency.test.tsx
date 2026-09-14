import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import Home from '../pages/Dashboard/Home';

let overviewResponse: any;
let dashboardResponse: any;
let revenueResponse: any;

const getAnalyticsOverview = vi.fn(async (_from?: string, _to?: string, _currency?: string) => overviewResponse);
const getDashboardStats = vi.fn(async (_params?: any) => dashboardResponse);
const getRevenueSeries = vi.fn(async (_from?: string, _to?: string, _granularity?: string, _currency?: string) => revenueResponse);
const getBookingsSeries = vi.fn(async (_from?: string, _to?: string, _granularity?: string) => []);

vi.mock('../api/analytics', () => ({
  getAnalyticsOverview: (from?: string, to?: string, currency?: string) => getAnalyticsOverview(from, to, currency),
  getDashboardStats: (params?: any) => getDashboardStats(params),
}));

vi.mock('../api/metrics', () => ({
  getRevenueSeries: (from: string, to: string, granularity?: string, currency?: string) => getRevenueSeries(from, to, granularity, currency),
  getBookingsSeries: (from: string, to: string, granularity?: string) => getBookingsSeries(from, to, granularity),
}));

vi.mock('../api/export', () => ({
  downloadAllData: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    userContext: { role: 'manager', org: { currency: 'BAM' } },
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../lib/i18n/context', () => ({
  useTranslation: () => ({
    common: { error: 'Error' },
    dashboard: {
      title: 'Dashboard',
      description: 'Dashboard description',
      exportData: 'Export',
      totalRevenue: 'Total Revenue',
      totalBookings: 'Total Bookings',
      totalCustomers: 'Total Customers',
      avgBooking: 'Avg Booking',
      cancelRate: 'Cancel Rate',
      revenueTrend: 'Revenue Trend',
      revenueGenerated: 'Revenue generated',
      bookingsTrend: 'Bookings Trend',
      bookingsOverTime: 'Bookings over time',
      yourBookings: 'Your bookings',
      reservationsOverview: 'Reservations overview',
      topPackages: 'Top Packages',
      unknownPackage: 'Unknown Package',
      bookings: 'bookings',
      revenue: 'Revenue',
      noData: 'No data',
      noDataDesc: 'No data description',
      noBookings: 'No bookings',
      noBookingsDesc: 'No bookings description',
      createPackage: 'Create package',
      viewReservations: 'View reservations',
      createReservation: 'Create reservation',
    },
  }),
}));

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

vi.mock('../components/common/OnboardingChecklist', () => ({
  default: () => null,
}));

vi.mock('../components/common/DateRangeFilter', () => ({
  default: function MockDateRangeFilter({ onRangeChange }: any) {
    useEffect(() => {
      onRangeChange({ from: '2026-01-01', to: '2026-01-31', granularity: 'day' });
      // The real DateRangeFilter emits from its own stable state. This mock emits once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="date-range" />;
  },
}));

vi.mock('../icons', () => {
  const Icon = (props: any) => <svg data-testid="icon" {...props} />;
  return {
    ArrowDownIcon: Icon,
    ArrowUpIcon: Icon,
    BoxIconLine: Icon,
    DollarLineIcon: Icon,
    CalenderIcon: Icon,
    DownloadIcon: Icon,
    GroupIcon: Icon,
    ShootingStarIcon: Icon,
  };
});

vi.mock('../components/charts/AnalyticsChart', () => ({
  default: ({ title, data, prefix }: any) => (
    <div data-testid={`chart-${title}`}>
      {title}:{prefix}:{JSON.stringify(data)}
    </div>
  ),
}));

function seedSingleCurrency(currency: string, revenue: number) {
  overviewResponse = {
    totalRevenue: revenue,
    totalBookings: 2,
    totalCustomers: 2,
    cancellationRate: 0,
    currency,
    availableCurrencies: [currency],
    multiCurrency: false,
  };
  dashboardResponse = {
    revenue,
    bookings_count: 2,
    average_booking_value: revenue / 2,
    revenue_by_month: [{ month: '2026-01', amount: revenue, currency }],
    top_packages: [{ name: `${currency} Package`, revenue, bookings: 2, currency }],
    currency,
    availableCurrencies: [currency],
    multiCurrency: false,
  };
  revenueResponse = {
    data: [{ date: '2026-01-15', value: revenue, currency }],
    currency,
    availableCurrencies: [currency],
    multiCurrency: false,
  };
}

function seedMixedCurrency() {
  overviewResponse = {
    totalRevenue: null,
    totalBookings: 2,
    totalCustomers: 2,
    cancellationRate: 0,
    currency: null,
    availableCurrencies: ['BAM', 'EUR'],
    multiCurrency: true,
  };
  dashboardResponse = {
    revenue: null,
    bookings_count: 2,
    average_booking_value: null,
    revenue_by_month: [],
    top_packages: [
      { name: 'BAM Package', revenue: 100, bookings: 1, currency: 'BAM' },
      { name: 'EUR Package', revenue: 200, bookings: 1, currency: 'EUR' },
    ],
    currency: null,
    availableCurrencies: ['BAM', 'EUR'],
    multiCurrency: true,
  };
  revenueResponse = {
    data: [
      { date: '2026-01-15', value: 100, currency: 'BAM' },
      { date: '2026-01-15', value: 200, currency: 'EUR' },
    ],
    currency: null,
    availableCurrencies: ['BAM', 'EUR'],
    multiCurrency: true,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seedSingleCurrency('BAM', 100);
});

describe('Dashboard currency handling', () => {
  it('renders BAM single-currency values as BAM/KM', async () => {
    seedSingleCurrency('BAM', 100);
    renderDashboard();

    await screen.findByText('Total Revenue');
    expect(screen.getAllByText(/100,00\s*KM/).length).toBeGreaterThan(0);
  });

  it('renders EUR single-currency values as EUR and never KM', async () => {
    seedSingleCurrency('EUR', 200);
    renderDashboard();

    await screen.findByText('Total Revenue');
    expect(screen.getAllByText(/200,00\s*€/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/200,00\s*KM/)).not.toBeInTheDocument();
  });

  it('shows a selector for mixed currencies and does not display a fake combined total', async () => {
    seedMixedCurrency();
    renderDashboard();

    await screen.findByRole('button', { name: 'BAM' });
    expect(screen.getByRole('button', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getAllByText('Select currency').length).toBeGreaterThan(0);
    expect(screen.queryByText(/300,00/)).not.toBeInTheDocument();
    expect(screen.queryByText('BAM Package')).not.toBeInTheDocument();
    expect(screen.queryByText('EUR Package')).not.toBeInTheDocument();
  });

  it('refetches monetary Dashboard data with the selected currency', async () => {
    seedMixedCurrency();
    renderDashboard();

    const eurButton = await screen.findByRole('button', { name: 'EUR' });
    seedSingleCurrency('EUR', 200);
    fireEvent.click(eurButton);

    await waitFor(() => {
      expect(getAnalyticsOverview).toHaveBeenLastCalledWith('2026-01-01', '2026-01-31', 'EUR');
      expect(getDashboardStats).toHaveBeenLastCalledWith({ from: '2026-01-01', to: '2026-01-31', currency: 'EUR' });
      expect(getRevenueSeries).toHaveBeenLastCalledWith('2026-01-01', '2026-01-31', 'day', 'EUR');
    });
    expect((await screen.findAllByText(/200,00\s*€/)).length).toBeGreaterThan(0);
  });
});
