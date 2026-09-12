import { get } from './client';

export interface AnalyticsOverview {
  totalRevenue: number;
  totalBookings: number;
  totalCustomers: number;
  pendingBookings: number;
  cancellationRate: number;
  revenueChangePct?: number;
  bookingsChangePct?: number;
  customersChangePct?: number;
}

export interface DashboardStats {
  revenue: number;
  bookings_count: number;
  average_booking_value: number;
  revenue_by_month: { month: string; amount: number }[];
  top_packages: { name: string; revenue: number; bookings: number }[];
}

/**
 * Get analytics overview for the current organization
 */
export async function getAnalyticsOverview(from?: string, to?: string): Promise<AnalyticsOverview> {
  const { data } = await get<AnalyticsOverview>('/analytics/overview', {
    params: { from, to }
  });
  return data;
}

/**
 * Get dashboard stats for the current organization
 */
export async function getDashboardStats(params?: { from?: string; to?: string }): Promise<DashboardStats> {
  const { data } = await get<DashboardStats>('/analytics/dashboard', {
    params
  });
  return data;
}

// ============================================================================
// PHASE 2: ANALYTICS MVP
// ============================================================================

export interface OverviewAnalyticsV2 {
  // Reservation metrics
  reservations_count: number;
  total_amount_sum: number | null;
  total_paid_sum: number | null;
  total_balance_sum: number | null;

  // Payment status breakdown
  unpaid_count: number;
  partially_paid_count: number;
  paid_count: number;

  // Calculated metrics
  avg_reservation_value: number | null;

  // Payment metrics
  payments_count: number;
  payments_sum: number | null;
  currency?: string | null;
  availableCurrencies?: string[];
  multiCurrency?: boolean;
  currencyBreakdown?: Array<Record<string, unknown>>;

  // Date range
  date_from: string | null;
  date_to: string | null;
}

export interface PackageAnalyticsV2 {
  package_id: string;
  package_name: string;
  reservations_count: number;
  total_amount_sum: number;
  total_paid_sum: number;
  total_balance_sum: number;
  currency?: string | null;
}

export interface AnalyticsFilters {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  currency?: string;
}

/**
 * Get analytics overview (Phase 2)
 * 
 * @param filters - Optional date range filters
 * @returns Overview analytics with reservation and payment metrics
 */
export async function getAnalyticsOverviewV2(filters: AnalyticsFilters = {}): Promise<OverviewAnalyticsV2> {
  const params: Record<string, any> = {};

  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.currency) params.currency = filters.currency;

  const { data } = await get<OverviewAnalyticsV2>('/analytics/overview-v2', { params });
  return data;
}

/**
 * Get analytics grouped by package (Phase 2)
 * 
 * @param filters - Optional date range filters
 * @returns Array of package analytics sorted by revenue (descending)
 */
export async function getPackageAnalyticsV2(filters: AnalyticsFilters = {}): Promise<PackageAnalyticsV2[]> {
  const params: Record<string, any> = {};

  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.currency) params.currency = filters.currency;

  const { data } = await get<PackageAnalyticsV2[] | { data: PackageAnalyticsV2[] }>('/analytics/by-package', { params });
  return Array.isArray(data) ? data : data.data;
}

export interface RevenueSeriesDataPoint {
  date: string; // YYYY-MM-DD
  total_amount_sum: number;
  total_paid_sum: number;
  currency?: string;
}

/**
 * Get revenue time series (Phase 2)
 * 
 * @param filters - Date range and bucket filters
 * @returns Array of revenue data points by date
 */
export interface PaymentStatusBreakdown {
  [status: string]: { count: number; total: number };
}

export interface PaymentStatusResponse {
  breakdown: PaymentStatusBreakdown;
  totalPayments: number;
  totalAmount: number;
}

/**
 * Get payment status distribution (count + amount by status)
 */
export async function getPaymentStatusDistribution(): Promise<PaymentStatusResponse> {
  const { data } = await get<PaymentStatusResponse>('/analytics/payment-status');
  return data;
}

export async function getRevenueSeries(filters: AnalyticsFilters & { bucket?: 'daily' | 'weekly' } = {}): Promise<RevenueSeriesDataPoint[]> {
  const params: Record<string, any> = {};

  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.bucket) params.bucket = filters.bucket;
  if (filters.currency) params.currency = filters.currency;

  const { data } = await get<RevenueSeriesDataPoint[] | { data: RevenueSeriesDataPoint[] }>('/analytics/revenue-series', { params });
  return Array.isArray(data) ? data : data.data;
}
