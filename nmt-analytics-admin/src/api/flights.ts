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
  linkedDepartureCount?: number;
  linkedDepartures?: Array<{
    id: string;
    departAt: string;
    returnAt: string;
    status: string;
    packageName: string;
    destination: string;
  }>;
}

export interface FlightSegment {
  id: string;
  flightId: string;
  direction: 'outbound' | 'return' | 'other';
  segmentOrder: number;
  flight: Flight | null;
}

export interface FlightListResponse {
  data: Flight[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getFlights(params?: {
  search?: string;
  active?: string;
  page?: number;
  limit?: number;
}): Promise<FlightListResponse> {
  const { data } = await get<FlightListResponse>('/flights', params);
  return data;
}

export async function getFlight(id: string): Promise<Flight> {
  const { data } = await get<Flight>(`/flights/${id}`);
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

export async function updateFlight(id: string, payload: Partial<Flight & { flightNumber?: string; departureAirport?: string; arrivalAirport?: string; departureTime?: string; arrivalTime?: string }>): Promise<Flight> {
  const { data } = await patch<Flight>(`/flights/${id}`, payload);
  return data;
}

export async function deleteFlight(id: string): Promise<void> {
  await del(`/flights/${id}`);
}

export async function getDepartureFlightSegments(departureId: string): Promise<FlightSegment[]> {
  const { data } = await get<{ data: FlightSegment[] }>(`/departures/${departureId}/flights`);
  return data.data ?? [];
}

export async function linkFlightToDeparture(departureId: string, flightId: string, direction: string, segmentOrder: number): Promise<FlightSegment> {
  const { data } = await post<FlightSegment>(`/departures/${departureId}/flights`, { flightId, direction, segmentOrder });
  return data;
}

export async function unlinkFlightFromDeparture(departureId: string, segmentId: string): Promise<void> {
  await del(`/departures/${departureId}/flights/${segmentId}`);
}

export async function reorderFlightSegments(departureId: string, segments: Array<{ id: string; direction: string; segmentOrder: number }>): Promise<void> {
  await patch(`/departures/${departureId}/flights/reorder`, { segments });
}
