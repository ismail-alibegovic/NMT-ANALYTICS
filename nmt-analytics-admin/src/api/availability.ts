import { get } from './client';

export interface AvailabilityRoom {
  hotel_id: string | null;
  hotel_name: string | null;
  room_type: string | null;
  total: number;
  allocated: number;
  available: number;
  check_in: string | null;
  check_out: string | null;
  price_per_night: number;
}

export interface AvailabilityResponse {
  departure_id: string;
  capacity: number;
  booked: number;
  available: number;
  occupancy_status: string;
  transport_type: string | null;
  package: { id: string; name: string } | null;
  rooms: AvailabilityRoom[];
  seats_occupied: string[];
}

export async function getAvailability(departureId: string): Promise<AvailabilityResponse> {
  const { data } = await get<AvailabilityResponse>(`/availability/${departureId}`);
  return data;
}
