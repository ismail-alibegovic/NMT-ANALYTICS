import { get } from './client';

export interface CalendarDeparture {
  id: string;
  departAt: string;
  returnAt: string | null;
  capacity: number;
  booked: number;
  available: number;
  status: string;
  packageId: string | null;
  packageName: string | null;
  destination: string | null;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
}

export interface CalendarResponse {
  month: string;
  events: CalendarDeparture[];
}

export async function getCalendarMonth(month: string): Promise<CalendarResponse> {
  const { data } = await get<CalendarResponse>('/calendar', { params: { month } });
  return data;
}
