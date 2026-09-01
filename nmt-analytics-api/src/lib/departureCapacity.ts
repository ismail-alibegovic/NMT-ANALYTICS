import { supabaseAdmin } from './supabase';

const NON_CANCELLED_STATUSES = ['pending', 'confirmed', 'completed'] as const;

export function reservationConsumesCapacity(status: string | null | undefined): boolean {
  return !!status && status !== 'cancelled';
}

export type DepartureCapacityErrorDetails = {
  capacity: number;
  booked: number;
  requestedAdditionalPassengers: number;
  remainingCapacity: number;
};

export class DepartureCapacityExceededError extends Error {
  details: DepartureCapacityErrorDetails;

  constructor(details: DepartureCapacityErrorDetails) {
    super('DEPARTURE_CAPACITY_EXCEEDED');
    this.name = 'DepartureCapacityExceededError';
    this.details = details;
  }
}

export class ReservationPartySizeExceededError extends Error {
  details: { partySize: number; currentPassengers: number; requestedAdditionalPassengers: number };

  constructor(details: { partySize: number; currentPassengers: number; requestedAdditionalPassengers: number }) {
    super('RESERVATION_PARTY_SIZE_EXCEEDED');
    this.name = 'ReservationPartySizeExceededError';
    this.details = details;
  }
}

type ReservationHeadcountRow = {
  id: string;
  departure_id: string;
  party_size: number | null;
  status: string | null;
};

type PassengerHeadcountRow = {
  id: string;
  departure_id: string;
  reservation_id: string | null;
};

export async function getDepartureBookedMap(orgId: string, departureIds: string[]): Promise<Map<string, number>> {
  const uniqueDepartureIds = Array.from(new Set(departureIds.filter(Boolean)));
  const result = new Map<string, number>();
  if (uniqueDepartureIds.length === 0) return result;

  const { data: reservations, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('id, departure_id, party_size, status')
    .eq('org_id', orgId)
    .in('departure_id', uniqueDepartureIds)
    .in('status', [...NON_CANCELLED_STATUSES]);

  if (reservationError) throw reservationError;

  const activeReservations = (reservations || []) as ReservationHeadcountRow[];
  const activeReservationIds = activeReservations.map((row) => row.id);

  let passengers: PassengerHeadcountRow[] = [];
  if (activeReservationIds.length > 0) {
    const { data: passengerRows, error: passengerError } = await supabaseAdmin
      .from('departure_passengers')
      .select('id, departure_id, reservation_id')
      .eq('org_id', orgId)
      .in('departure_id', uniqueDepartureIds)
      .in('reservation_id', activeReservationIds);

    if (passengerError) throw passengerError;
    passengers = (passengerRows || []) as PassengerHeadcountRow[];
  }

  const passengerCountByDeparture = new Map<string, number>();
  const reservationsWithPassengersByDeparture = new Map<string, Set<string>>();
  for (const passenger of passengers) {
    passengerCountByDeparture.set(
      passenger.departure_id,
      (passengerCountByDeparture.get(passenger.departure_id) || 0) + 1,
    );
    if (passenger.reservation_id) {
      let reservationIds = reservationsWithPassengersByDeparture.get(passenger.departure_id);
      if (!reservationIds) {
        reservationIds = new Set<string>();
        reservationsWithPassengersByDeparture.set(passenger.departure_id, reservationIds);
      }
      reservationIds.add(passenger.reservation_id);
    }
  }

  const fallbackReservationSumByDeparture = new Map<string, number>();
  for (const reservation of activeReservations) {
    const reservationIdsWithPassengers = reservationsWithPassengersByDeparture.get(reservation.departure_id);
    if (reservationIdsWithPassengers?.has(reservation.id)) {
      continue;
    }
    fallbackReservationSumByDeparture.set(
      reservation.departure_id,
      (fallbackReservationSumByDeparture.get(reservation.departure_id) || 0) + Number(reservation.party_size || 0),
    );
  }

  for (const departureId of uniqueDepartureIds) {
    const passengerCount = passengerCountByDeparture.get(departureId) || 0;
    const fallbackReservationSum = fallbackReservationSumByDeparture.get(departureId) || 0;
    result.set(departureId, passengerCount + fallbackReservationSum);
  }

  return result;
}

export async function getDepartureBookedCount(orgId: string, departureId: string): Promise<number> {
  const map = await getDepartureBookedMap(orgId, [departureId]);
  return map.get(departureId) || 0;
}

export async function buildDepartureCapacityErrorDetails(
  orgId: string,
  departureId: string,
  requestedAdditionalPassengers: number,
): Promise<DepartureCapacityErrorDetails> {
  const [{ data: departure, error: departureError }, booked] = await Promise.all([
    supabaseAdmin
      .from('departures')
      .select('capacity')
      .eq('id', departureId)
      .eq('org_id', orgId)
      .single(),
    getDepartureBookedCount(orgId, departureId),
  ]);

  if (departureError || !departure) {
    throw departureError || new Error('DEPARTURE_NOT_FOUND');
  }

  const capacity = Number(departure.capacity || 0);
  const remainingCapacity = Math.max(0, capacity - booked);

  return {
    capacity,
    booked,
    requestedAdditionalPassengers,
    remainingCapacity,
  };
}

export async function reserveDepartureCapacityOrThrow(
  orgId: string,
  departureId: string,
  requestedAdditionalPassengers: number,
) {
  const result = await supabaseAdmin.rpc('reserve_capacity_atomic', {
    p_departure_id: departureId,
    p_org_id: orgId,
    p_party_size: requestedAdditionalPassengers,
  });

  if (!result?.error) return result;

  const message = result.error.message || '';
  if (message.includes('DEPARTURE_NOT_FOUND')) {
    throw new Error('DEPARTURE_NOT_FOUND');
  }
  if (message.includes('CAPACITY_FULL')) {
    const details = await buildDepartureCapacityErrorDetails(orgId, departureId, requestedAdditionalPassengers);
    throw new DepartureCapacityExceededError(details);
  }

  throw result.error;
}

export async function releaseDepartureCapacityOrThrow(
  orgId: string,
  departureId: string,
  passengersToRelease: number,
) {
  if (passengersToRelease < 1) return null;
  const result = await supabaseAdmin.rpc('release_capacity_atomic', {
    p_departure_id: departureId,
    p_org_id: orgId,
    p_party_size: passengersToRelease,
  });
  if (result?.error) throw result.error;
  return result;
}

export async function assertPassengerCreationCapacity(
  orgId: string,
  reservationId: string,
  departureId: string,
  requestedAdditionalPassengers: number,
) {
  const [{ data: reservation, error: reservationError }, currentBooked, capacity] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, party_size, status')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .single(),
    getDepartureBookedCount(orgId, departureId),
    getDepartureCapacity(orgId, departureId),
  ]);

  if (reservationError || !reservation) {
    throw reservationError || new Error('RESERVATION_NOT_FOUND');
  }

  const { count: currentPassengers, error: passengerError } = await supabaseAdmin
    .from('departure_passengers')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('reservation_id', reservationId)
    .eq('departure_id', departureId);

  if (passengerError) throw passengerError;

  const partySize = Number(reservation.party_size || 0);
  const currentPassengerCount = Number(currentPassengers || 0);

  if (currentPassengerCount + requestedAdditionalPassengers > partySize) {
    throw new ReservationPartySizeExceededError({
      partySize,
      currentPassengers: currentPassengerCount,
      requestedAdditionalPassengers,
    });
  }

  if (reservationConsumesCapacity(reservation.status) && currentBooked + requestedAdditionalPassengers > capacity) {
    const details = await buildDepartureCapacityErrorDetails(orgId, departureId, requestedAdditionalPassengers);
    throw new DepartureCapacityExceededError(details);
  }
}

async function getDepartureCapacity(orgId: string, departureId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('departures')
    .select('capacity')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .single();
  if (error || !data) throw error || new Error('DEPARTURE_NOT_FOUND');
  return Number(data.capacity || 0);
}
