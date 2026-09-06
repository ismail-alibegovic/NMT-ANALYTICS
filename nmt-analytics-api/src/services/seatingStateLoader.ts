import { supabaseAdmin } from '../lib/supabase';
import type { SeatingProposalInput } from './seatingProposal';

// M12.1 — canonical BUS seating state loader.
// Read-only: performs SELECTs only, never writes, never calls RPCs.

export async function loadSeatingState(
  departureId: string,
  orgId: string,
): Promise<{ state: { input: SeatingProposalInput } | null; error?: { status: number; code: string; message: string } }> {
  // 0. departure identity + BUS check (org-scoped)
  const { data: departure, error: depErr } = await supabaseAdmin
    .from('departures')
    .select('id, transport_type, capacity')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (depErr || !departure) {
    return { state: null, error: { status: 404, code: 'NOT_FOUND', message: 'Departure not found' } };
  }
  if (departure.transport_type !== 'bus') {
    return { state: null, error: { status: 400, code: 'NOT_BUS_DEPARTURE', message: 'Seating proposal is only available for bus departures' } };
  }

  // 1. vehicle assignment (org-scoped)
  const { data: vehicle, error: vehicleErr } = await supabaseAdmin
    .from('departure_vehicle_assignments')
    .select('id, vehicle_label, registration_number, capacity, layout_type')
    .eq('departure_id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (vehicleErr) {
    return { state: null, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to load vehicle' } };
  }
  if (!vehicle) {
    return { state: null, error: { status: 400, code: 'NO_VEHICLE', message: 'Departure has no vehicle configured' } };
  }

  // 2. ACTIVE physical seats only — never generate from departure.capacity (org-scoped)
  const { data: seats, error: seatsErr } = await supabaseAdmin
    .from('departure_vehicle_seats')
    .select('id, seat_number, seat_label, row_number, column_index, side, is_active')
    .eq('departure_vehicle_assignment_id', vehicle.id)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('seat_number', { ascending: true });

  if (seatsErr) {
    return { state: null, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to load seats' } };
  }
  if (!seats || seats.length === 0) {
    return { state: null, error: { status: 400, code: 'NO_VEHICLE', message: 'Vehicle has no active seats' } };
  }

  // 3. passengers (org-scoped)
  const { data: passengers, error: paxErr } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, full_name, seat_number, seat_is_manual, seat_locked')
    .eq('departure_id', departureId)
    .eq('org_id', orgId);

  if (paxErr) {
    return { state: null, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to load passengers' } };
  }

  // 4. groups (org-scoped)
  const { data: groups, error: groupsErr } = await supabaseAdmin
    .from('trip_passenger_groups')
    .select('id, name, seating_preference')
    .eq('departure_id', departureId)
    .eq('org_id', orgId);

  if (groupsErr) {
    return { state: null, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to load passenger groups' } };
  }

  // 5. group members (org-scoped)
  const { data: groupMembers, error: membersErr } = await supabaseAdmin
    .from('trip_passenger_group_members')
    .select('trip_passenger_group_id, passenger_id')
    .eq('org_id', orgId)
    .in('trip_passenger_group_id', (groups || []).map((g: any) => g.id));

  if (membersErr) {
    return { state: null, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to load group members' } };
  }

  const input: SeatingProposalInput = {
    departureId,
    vehicle: {
      id: vehicle.id,
      vehicleLabel: vehicle.vehicle_label,
      registrationNumber: vehicle.registration_number ?? null,
      capacity: vehicle.capacity,
      layoutType: vehicle.layout_type,
    },
    seats: (seats || []).map((s: any) => ({
      id: s.id,
      seatNumber: s.seat_number,
      seatLabel: s.seat_label,
      rowNumber: s.row_number,
      columnIndex: s.column_index,
      side: s.side,
    })),
    passengers: (passengers || []).map((p: any) => ({
      id: p.id,
      fullName: p.full_name,
      seatNumber: p.seat_number ?? null,
      seatIsManual: p.seat_is_manual ?? false,
      seatLocked: p.seat_locked ?? false,
    })),
    groups: (groups || []).map((g: any) => ({
      id: g.id,
      name: g.name ?? null,
      seatingPreference: (g.seating_preference ?? 'prefer_together') as SeatingProposalInput['groups'][number]['seatingPreference'],
      passengerIds: (groupMembers || []).filter((m: any) => m.trip_passenger_group_id === g.id).map((m: any) => m.passenger_id),
    })),
  };

  return { state: { input } };
}
