import { get } from './client';

export interface DataPoint {
  date: string;
  value: number;
}

// Backend returns { data: DataPoint[] } directly
export async function getRevenueSeries(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day'): Promise<DataPoint[]> {
  const { data } = await get<DataPoint[]>('/metrics/revenue-series', {
    params: { from, to, granularity },
  });
  return data;
}

export async function getBookingsSeries(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day'): Promise<DataPoint[]> {
  const { data } = await get<DataPoint[]>('/metrics/bookings-series', {
    params: { from, to, granularity },
  });
  return data;
}
