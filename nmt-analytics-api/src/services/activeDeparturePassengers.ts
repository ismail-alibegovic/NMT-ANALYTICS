import { supabaseAdmin } from '../lib/supabase';

// Operational proposals exclude cancelled bookings, while the general manifest
// and reservation detail keep traveler history available. DB assignment guards
// remain authoritative if a booking is cancelled after this read.
export async function activeDeparturePassengers<T extends { reservation_id?: string | null }>(
  orgId: string, departureId: string, passengers: T[],
): Promise<T[]> {
  const ids = [...new Set(passengers.map(p => p.reservation_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return passengers;
  const { data, error } = await supabaseAdmin.from('reservations').select('id')
    .eq('org_id', orgId).eq('departure_id', departureId).eq('status', 'cancelled').in('id', ids);
  if (error) throw error;
  const cancelled = new Set((data || []).map((row: { id: string }) => row.id));
  return passengers.filter(passenger => !cancelled.has(passenger.reservation_id || ''));
}
