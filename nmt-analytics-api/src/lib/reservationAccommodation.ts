import { supabaseAdmin } from './supabase';

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'completed'];

export type ReservationAccommodationInput = {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes?: string | null;
  passengerIds?: string[];
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
    passengerIds: Array.isArray(row.passenger_ids) ? row.passenger_ids : [],
    hotel: row.hotels ? {
      id: row.hotels.id,
      name: row.hotels.name,
      destination: row.hotels.destination || null,
      stars: row.hotels.stars ?? null,
    } : null,
  };
}

async function loadRequirementPassengerIds(orgId: string, reservationId: string) {
  const { data, error } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, reservation_accommodation_requirement_id')
    .eq('org_id', orgId)
    .eq('reservation_id', reservationId);

  if (error) throw error;

  const byRequirementId = new Map<string, string[]>();
  for (const row of data || []) {
    if (!row.reservation_accommodation_requirement_id) continue;
    const ids = byRequirementId.get(row.reservation_accommodation_requirement_id) || [];
    ids.push(row.id);
    byRequirementId.set(row.reservation_accommodation_requirement_id, ids);
  }
  return byRequirementId;
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
    .order('hotel_allocation_id', { ascending: true });

  if (error) throw error;

  const passengerIdsByRequirement = await loadRequirementPassengerIds(orgId, reservationId);
  return (data || []).map((row: any) => requirementOut({
    ...row,
    passenger_ids: passengerIdsByRequirement.get(row.id) || [],
  }));
}

export async function replaceReservationAccommodation(
  reservationId: string,
  orgId: string,
  inputs: ReservationAccommodationInput[],
) {
  const { data, error } = await supabaseAdmin.rpc('replace_reservation_accommodation_requirements_atomic', {
    p_org_id: orgId,
    p_reservation_id: reservationId,
    p_requirements: inputs.map((input) => ({
      hotel_allocation_id: input.hotelAllocationId,
      room_count: input.roomCount,
      guests_expected: input.guestsExpected,
      notes: input.notes ?? null,
      passenger_ids: input.passengerIds || [],
    })),
  });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  const passengerIdsByRequirement = await loadRequirementPassengerIds(orgId, reservationId);
  return rows.map((row: any) => requirementOut({
    ...row,
    passenger_ids: passengerIdsByRequirement.get(row.id) || [],
  }));
}

export async function deleteReservationAccommodation(reservationId: string, orgId: string) {
  const result = await replaceReservationAccommodation(reservationId, orgId, []);
  return Array.isArray(result);
}

export function mapAccommodationError(error: any) {
  const message = String(error?.message || error || '');
  if (message.includes('ACCOMMODATION_OVERBOOKED')) {
    return { status: 409, code: 'ACCOMMODATION_OVERBOOKED', message: 'Not enough accommodation inventory is available for this room type.' };
  }
  if (message.includes('ACCOMMODATION_CAPACITY_INSUFFICIENT') || message.includes('ACCOMMODATION_LINE_CAPACITY_INSUFFICIENT')) {
    return { status: 409, code: 'ACCOMMODATION_CAPACITY_INSUFFICIENT', message: 'Selected accommodation line exceeds the capacity of the chosen room type.' };
  }
  if (message.includes('ACCOMMODATION_COVERAGE_MISMATCH')) {
    return { status: 409, code: 'ACCOMMODATION_COVERAGE_MISMATCH', message: 'Accommodation lines must cover all passengers in the reservation.' };
  }
  if (message.includes('PASSENGER_REQUIREMENT_COVERAGE_MISMATCH')) {
    return { status: 409, code: 'PASSENGER_REQUIREMENT_COVERAGE_MISMATCH', message: 'Each passenger must be assigned to exactly one accommodation line.' };
  }
  if (message.includes('INVALID_PASSENGER_REQUIREMENT_MAPPING')) {
    return { status: 409, code: 'INVALID_PASSENGER_REQUIREMENT_MAPPING', message: 'Passenger mapping does not match this reservation and departure.' };
  }
  if (message.includes('DUPLICATE_PASSENGER_REQUIREMENT_MAPPING')) {
    return { status: 409, code: 'DUPLICATE_PASSENGER_REQUIREMENT_MAPPING', message: 'A passenger cannot be assigned to more than one accommodation line.' };
  }
  if (message.includes('DUPLICATE_ALLOTMENT_LINES')) {
    return { status: 409, code: 'DUPLICATE_ALLOTMENT_LINES', message: 'Only one accommodation line per allotment is allowed.' };
  }
  if (message.includes('ALLOTMENT_NOT_FOUND')) {
    return { status: 404, code: 'ALLOTMENT_NOT_FOUND', message: 'Accommodation allotment not found for this departure.' };
  }
  if (message.includes('ALLOTMENT_WRONG_DEPARTURE')) {
    return { status: 409, code: 'ALLOTMENT_WRONG_DEPARTURE', message: 'Accommodation allotment belongs to a different departure.' };
  }
  if (message.includes('RESERVATION_NOT_FOUND')) {
    return { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' };
  }
  if (message.includes('RESERVATION_HAS_NO_DEPARTURE')) {
    return { status: 409, code: 'RESERVATION_HAS_NO_DEPARTURE', message: 'Reservation must have a departure before accommodation can be selected.' };
  }
  if (message.includes('EXISTING_ROOM_ASSIGNMENT_CONFLICT')) {
    return { status: 409, code: 'EXISTING_ROOM_ASSIGNMENT_CONFLICT', message: 'Existing room assignments conflict with the requested accommodation changes.' };
  }
  if (message.includes('RESERVATION_CANCELLED')) {
    return { status: 409, code: 'RESERVATION_CANCELLED', message: 'Cancelled reservations cannot be assigned accommodation.' };
  }
  if (message.includes('PASSENGER_REQUIREMENT_UNASSIGNED')) {
    return { status: 409, code: 'PASSENGER_REQUIREMENT_UNASSIGNED', message: 'Passenger must be assigned to a reservation accommodation line before rooming.' };
  }
  return null;
}
