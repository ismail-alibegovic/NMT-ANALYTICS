import { supabaseAdmin } from './supabase';

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'completed'];

export type ReservationAccommodationInput = {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes?: string | null;
};

export function requirementOut(row: any) {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    departureId: row.departure_id,
    hotelAllocationId: row.hotel_allocation_id,
    hotelId: row.hotel_id,
    roomType: row.room_type,
    roomLabel: row.room_label || row.room_type,
    roomCount: Number(row.room_count || 0),
    guestsExpected: Number(row.guests_expected || 0),
    capacityPerRoom: Number(row.capacity_per_room || 1),
    unitSellPrice: Number(row.unit_sell_price || 0),
    unitNetPrice: Number(row.unit_net_price || 0),
    totalSellPrice: Number(row.total_sell_price || 0),
    notes: row.notes || null,
    hotel: row.hotels ? {
      id: row.hotels.id,
      name: row.hotels.name,
      destination: row.hotels.destination || null,
      stars: row.hotels.stars ?? null,
    } : null,
  };
}

export async function getSoldRoomsForAllocation(orgId: string, allocationId: string, excludeReservationId?: string | null) {
  let query = supabaseAdmin
    .from('reservation_accommodation_requirements')
    .select('room_count, reservations!inner(status)')
    .eq('org_id', orgId)
    .eq('hotel_allocation_id', allocationId)
    .in('reservations.status', ACTIVE_RESERVATION_STATUSES);

  if (excludeReservationId) query = query.neq('reservation_id', excludeReservationId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).reduce((sum, row: any) => sum + Number(row.room_count || 0), 0);
}

export async function getAccommodationOptions(departureId: string, orgId: string) {
  const { data: departure, error: depErr } = await supabaseAdmin
    .from('departures')
    .select('id')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (depErr) throw depErr;
  if (!departure) return null;

  const { data, error } = await supabaseAdmin
    .from('hotel_allocations')
    .select('*, hotels:hotel_id(id, name, destination, stars)')
    .eq('org_id', orgId)
    .eq('departure_id', departureId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  const items = [];
  for (const row of data || []) {
    const soldRooms = await getSoldRoomsForAllocation(orgId, row.id);
    const departureRooms = Number(row.rooms_reserved || 0);
    const capacityPerRoom = Math.max(1, Number(row.capacity_per_room || 1));
    items.push({
      id: row.id,
      departureId: row.departure_id,
      hotelId: row.hotel_id,
      roomType: row.room_type,
      roomLabel: row.room_label || row.room_type,
      departureRooms,
      reservedRooms: soldRooms,
      availableRooms: Math.max(0, departureRooms - soldRooms),
      capacityPerRoom,
      availableGuestCapacity: Math.max(0, departureRooms - soldRooms) * capacityPerRoom,
      unitSellPrice: Number(row.sell_price || 0),
      unitNetPrice: Number(row.net_price || row.price_per_night || 0),
      checkIn: row.check_in,
      checkOut: row.check_out,
      hotel: row.hotels ? {
        id: row.hotels.id,
        name: row.hotels.name,
        destination: row.hotels.destination || null,
        stars: row.hotels.stars ?? null,
      } : null,
    });
  }

  return { departureId, items };
}

export async function getReservationAccommodation(reservationId: string, orgId: string) {
  const { data: reservation, error: reservationErr } = await supabaseAdmin
    .from('reservations')
    .select('id')
    .eq('id', reservationId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (reservationErr) throw reservationErr;
  if (!reservation) return null;

  const { data, error } = await supabaseAdmin
    .from('reservation_accommodation_requirements')
    .select('*, hotels:hotel_id(id, name, destination, stars)')
    .eq('org_id', orgId)
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (error) throw error;
  return data ? requirementOut(data) : null;
}

export async function upsertReservationAccommodation(
  reservationId: string,
  orgId: string,
  input: ReservationAccommodationInput,
) {
  const { data, error } = await supabaseAdmin.rpc('upsert_reservation_accommodation_requirement_atomic', {
    p_org_id: orgId,
    p_reservation_id: reservationId,
    p_hotel_allocation_id: input.hotelAllocationId,
    p_room_count: input.roomCount,
    p_guests_expected: input.guestsExpected,
    p_notes: input.notes ?? null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? requirementOut(row) : null;
}

export async function deleteReservationAccommodation(reservationId: string, orgId: string) {
  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('reservation_accommodation_requirements')
    .select('id')
    .eq('org_id', orgId)
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (loadErr) throw loadErr;
  if (!existing) return false;

  const { error } = await supabaseAdmin
    .from('reservation_accommodation_requirements')
    .delete()
    .eq('org_id', orgId)
    .eq('reservation_id', reservationId);

  if (error) throw error;
  return true;
}

export function mapAccommodationError(error: any) {
  const message = String(error?.message || error || '');
  if (message.includes('ACCOMMODATION_OVERBOOKED')) {
    return { status: 409, code: 'ACCOMMODATION_OVERBOOKED', message: 'Not enough accommodation inventory is available for this room type.' };
  }
  if (message.includes('ACCOMMODATION_CAPACITY_INSUFFICIENT')) {
    return { status: 409, code: 'ACCOMMODATION_CAPACITY_INSUFFICIENT', message: 'Selected accommodation does not cover all passengers.' };
  }
  if (message.includes('ALLOTMENT_NOT_FOUND')) {
    return { status: 404, code: 'ALLOTMENT_NOT_FOUND', message: 'Accommodation allotment not found for this departure.' };
  }
  if (message.includes('RESERVATION_NOT_FOUND')) {
    return { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  }
  if (message.includes('RESERVATION_HAS_NO_DEPARTURE')) {
    return { status: 409, code: 'RESERVATION_HAS_NO_DEPARTURE', message: 'Reservation must have a departure before accommodation can be selected.' };
  }
  return null;
}
