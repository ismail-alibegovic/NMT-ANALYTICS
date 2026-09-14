import { get } from './client';

export interface DataPoint {
  date: string;
  value: number;
  currency?: string;
}

// Backend returns { data: DataPoint[] } directly
export interface RevenueSeriesResponse {
  data: DataPoint[];
  currency?: string | null;
  availableCurrencies?: string[];
  multiCurrency?: boolean;
}

export async function getRevenueSeries(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day', currency?: string): Promise<RevenueSeriesResponse> {
  const { data } = await get<DataPoint[] | RevenueSeriesResponse>('/metrics/revenue-series', {
    params: { from, to, granularity, currency },
  });
  return Array.isArray(data) ? { data } : data;
}

export async function getBookingsSeries(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day'): Promise<DataPoint[]> {
  const { data } = await get<DataPoint[]>('/metrics/bookings-series', {
    params: { from, to, granularity },
  });
  return data;
}
