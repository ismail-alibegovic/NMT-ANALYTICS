import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reports from '../pages/Reports';

let overviewResponse: any;
let packagesResponse: any[];
let seriesResponse: any[];

const getAnalyticsOverviewV2 = vi.fn(async (_filters?: any) => overviewResponse);
const getPackageAnalyticsV2 = vi.fn(async (_filters?: any) => packagesResponse);
const getRevenueSeries = vi.fn(async (_filters?: any) => seriesResponse);
const showError = vi.fn();

vi.mock('../api/analytics', () => ({
  getAnalyticsOverviewV2: (filters?: any) => getAnalyticsOverviewV2(filters),
  getPackageAnalyticsV2: (filters?: any) => getPackageAnalyticsV2(filters),
  getRevenueSeries: (filters?: any) => getRevenueSeries(filters),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'user-1' }, loading: false }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: showError }),
}));

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));

vi.mock('../components/analytics/RevenueChart', () => ({
  default: ({ data, currency }: any) => (
    <div data-testid="revenue-chart" data-currency={currency}>{JSON.stringify(data)}</div>
  ),
}));

function seedSingle(currency: string) {
  overviewResponse = {
    reservations_count: 1,
    total_amount_sum: currency === 'EUR' ? 200 : 100,
    total_paid_sum: currency === 'EUR' ? 150 : 80,
    total_balance_sum: currency === 'EUR' ? 50 : 20,
    unpaid_count: 0,
    partially_paid_count: 1,
    paid_count: 0,
    avg_reservation_value: currency === 'EUR' ? 200 : 100,
    payments_count: 1,
    payments_sum: currency === 'EUR' ? 150 : 80,
    currency,
    availableCurrencies: [currency],
    multiCurrency: false,
    date_from: '2026-01-01',
    date_to: '2026-01-31',
  };
  packagesResponse = [{
    package_id: `pkg-${currency}`,
    package_name: `${currency} Package`,
    reservations_count: 1,
    total_amount_sum: currency === 'EUR' ? 200 : 100,
    total_paid_sum: currency === 'EUR' ? 150 : 80,
    total_balance_sum: currency === 'EUR' ? 50 : 20,
    currency,
  }];
  seriesResponse = [{ date: '2026-01-15', total_amount_sum: currency === 'EUR' ? 200 : 100, total_paid_sum: currency === 'EUR' ? 150 : 80, currency }];
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
  packagesResponse = [
    { package_id: 'pkg-bam', package_name: 'BAM Package', reservations_count: 1, total_amount_sum: 100, total_paid_sum: 80, total_balance_sum: 20, currency: 'BAM' },
    { package_id: 'pkg-eur', package_name: 'EUR Package', reservations_count: 1, total_amount_sum: 200, total_paid_sum: 150, total_balance_sum: 50, currency: 'EUR' },
  ];
  seriesResponse = [
    { date: '2026-01-15', total_amount_sum: 100, total_paid_sum: 80, currency: 'BAM' },
    { date: '2026-01-15', total_amount_sum: 200, total_paid_sum: 150, currency: 'EUR' },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  seedSingle('BAM');
});

describe('Reports currency handling', () => {
  it('renders single BAM reports normally', async () => {
    seedSingle('BAM');
    render(<Reports />);

    expect(await screen.findByTestId('revenue-chart')).toHaveAttribute('data-currency', 'BAM');
    expect(screen.getAllByText(/100,00\s*KM/).length).toBeGreaterThan(0);
  });

  it('renders single EUR reports as EUR and not KM', async () => {
    seedSingle('EUR');
    render(<Reports />);

    expect(await screen.findByTestId('revenue-chart')).toHaveAttribute('data-currency', 'EUR');
    expect(screen.getAllByText(/200,00\s*€/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/200,00\s*KM/)).not.toBeInTheDocument();
  });

  it('shows selector and blocks mixed money chart/ranking until currency is selected', async () => {
    seedMixed();
    render(<Reports />);

    expect(await screen.findByRole('button', { name: 'BAM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.queryByTestId('revenue-chart')).not.toBeInTheDocument();
    expect(screen.getAllByText('Select currency').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mixed currencies').length).toBeGreaterThan(0);
  });

  it('refetches monetary report APIs with EUR and charts only EUR rows after selection', async () => {
    seedMixed();
    render(<Reports />);

    const eurButton = await screen.findByRole('button', { name: 'EUR' });
    seedSingle('EUR');
    fireEvent.click(eurButton);

    await waitFor(() => {
      expect(getAnalyticsOverviewV2).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'EUR' }));
      expect(getPackageAnalyticsV2).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'EUR' }));
      expect(getRevenueSeries).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'EUR' }));
    });
    const chart = await screen.findByTestId('revenue-chart');
    expect(chart).toHaveAttribute('data-currency', 'EUR');
    expect(chart.textContent).toContain('EUR');
    expect(chart.textContent).not.toContain('BAM');
  });
});
