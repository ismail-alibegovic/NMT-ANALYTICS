import { get, post, patch, del } from './client';

export interface Flight {
  id: string;
  orgId: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  capacity: number;
  basePrice: number;
  currency: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

export async function getFlights(params?: { search?: string; active?: string; page?: number; limit?: number }): Promise<{ data: Flight[]; total: number; page: number; limit: number }> {
  const { data } = await get<{ data: Flight[]; total: number; page: number; limit: number }>('/flights', params);
  return data;
}

export async function createFlight(payload: {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  capacity?: number;
  basePrice?: number;
  currency?: string;
  notes?: string | null;
  active?: boolean;
}): Promise<Flight> {
  const { data } = await post<Flight>('/flights', payload);
  return data;
}

export async function updateFlight(id: string, payload: Partial<Flight>): Promise<Flight> {
  const { data } = await patch<Flight>(`/flights/${id}`, payload);
  return data;
}

export async function deleteFlight(id: string): Promise<void> {
  await del(`/flights/${id}`);
}
