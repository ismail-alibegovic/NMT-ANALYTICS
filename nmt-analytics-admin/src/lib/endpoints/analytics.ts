import { get } from '../apiClient';

export interface AnalyticsOverview {
  totalRevenue: number;
  totalBookings: number;
  pendingBookings: number;
  cancellationRate: number | null;
}

/**
 * Get analytics overview for the current organization
 */
export async function getAnalyticsOverview(from?: string, to?: string): Promise<AnalyticsOverview> {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const query = params.toString() ? `?${params.toString()}` : '';
  const { data } = await get<AnalyticsOverview>(`/analytics/overview${query}`);
  return data;
}
