import ApiClient from "../lib/apiClient";

interface Metric {
  date: string;
  value: number;
}

interface OverviewMetrics {
  totalRevenue: number;
  totalBookings: number;
  pendingBookings: number;
  cancellationRate: number | null;
}

interface TrendsData {
  revenue: Metric[];
  bookings: Metric[];
  cancellations: Metric[];
}

interface GetOverviewParams {
  from?: string;
  to?: string;
}

interface GetTrendsParams {
  from?: string;
  to?: string;
  groupBy?: 'day' | 'week';
}

export class AnalyticsService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getOverview(params: GetOverviewParams = {}): Promise<OverviewMetrics> {
    const { from, to } = params;
    return this.client.get(`/api/analytics/overview`, { from, to });
  }

  public async getTrends(params: GetTrendsParams = {}): Promise<TrendsData> {
    const { from, to, groupBy = 'day' } = params;
    return this.client.get(`/api/analytics/trends`, { from, to, groupBy });
  }
}
