import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireMinimumRole } from '../middleware/requireRole';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { getDepartureStatus } from '../utils/business';

const router = Router();

/**
 * Availability routes — real-time departure capacity for agent + public dashboards.
 *
 * Auth + org-gated (inherited pattern from departures.ts / reservations.ts).
 *   GET /api/availability/:departureId  — capacity, booked, available + status + rooms + seats_occupied
 */
router.get('/availability/:departureId', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  try {
    const orgId = req.orgId!;
    const { departureId } = req.params;
    if (!departureId) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Missing departureId');
    }

    // Fetch capacity + booked + transport_type in one query, scoped to the caller's org.
    const { data: departure, error } = await supabaseAdmin
      .from('departures')
      .select('id, capacity, booked, transport_type, packages ( id, name, transport_type )')
      .eq('id', departureId)
      .eq('org_id', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return apiError(res, 404, 'NOT_FOUND', 'Departure not found');
      }
      return handleSupabaseError(res, error, 'Failed to fetch availability');
    }
    if (!departure) {
      return apiError(res, 404, 'NOT_FOUND', 'Departure not found');
    }

    const capacity = Number(departure.capacity || 0);
    const booked = Number(departure.booked || 0);
    const available = Math.max(0, capacity - booked);
    const occupancyStatus = getDepartureStatus(booked, capacity);

    // Prefer departure-level transport_type; fall back to the package's value
    const pkg = Array.isArray(departure.packages) ? departure.packages[0] : departure.packages;
    const transportType = departure.transport_type || (pkg?.transport_type as string) || null;

    // Fetch rooms (hotel_allocations) for this departure with hotels joined
    const { data: allocations, error: allocError } = await supabaseAdmin
      .from('hotel_allocations')
      .select(`
        id,
        hotel_id,
        hotels (
          name,
          slug
        ),
        room_type,
        rooms_reserved,
        check_in,
        check_out,
        price_per_night
      `)
      .eq('departure_id', departureId)
      .eq('org_id', orgId)
      .order('id');

    if (allocError) {
      return handleSupabaseError(res, allocError, 'Failed to fetch room allocations');
    }

    const rooms = Array.isArray(allocations)
      ? (allocations as any[]).map((a) => ({
          hotel_id: a.hotel_id,
          hotel_name: Array.isArray(a.hotels) && a.hotels.length > 0 ? (a.hotels[0] as any).name ?? null : (a.hotels as any)?.name ?? null,
          room_type: a.room_type,
          total: a.rooms_reserved,
          allocated: a.rooms_reserved,
          available: Math.max(0, a.rooms_reserved - 0), // TODO: compute actual allocated from reservations
          check_in: a.check_in,
          check_out: a.check_out,
          price_per_night: Number(a.price_per_night ?? 0),
        }))
      : [];

    // Fetch seat numbers (from excursion_passengers) for this departure
    // First get reservation IDs for this departure
    const { data: departuresRes, error: depResError } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('departure_id', departureId)
      .eq('org_id', orgId);

    if (depResError) {
      return handleSupabaseError(res, depResError, 'Failed to fetch reservations');
    }

    const reservationIds = departuresRes?.map((r) => r.id) ?? [];
    if (reservationIds.length === 0) {
      return res.json({
        departure_id: departure.id,
        capacity,
        booked,
        available,
        occupancy_status: occupancyStatus,
        transport_type: transportType,
        package: pkg ? { id: pkg.id, name: pkg.name } : null,
        rooms,
        seats_occupied: [],
      });
    }

    // Then get passengers with seat numbers
    const { data: excPassengers, error: excPassError } = await supabaseAdmin
      .from('excursion_passengers')
      .select('seat_number')
      .in('reservation_id', reservationIds)
      .eq('org_id', orgId)
      .order('seat_number');

    if (excPassError) {
      return handleSupabaseError(res, excPassError, 'Failed to fetch passengers');
    }

    const seatsOccupied: string[] = [];
    if (Array.isArray(excPassengers)) {
      for (const p of excPassengers) {
        const seatNum = p.seat_number;
        if (typeof seatNum === 'number' && seatNum > 0) {
          seatsOccupied.push(String(seatNum));
        }
      }
    }

    return res.json({
      departure_id: departure.id,
      capacity,
      booked,
      available,
      occupancy_status: occupancyStatus,
      transport_type: transportType,
      package: pkg ? { id: pkg.id, name: pkg.name } : null,
      rooms,
      seats_occupied: seatsOccupied,
    });
  } catch (error) {
    console.error('Error in GET /availability/:departureId:', error);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', error instanceof Error ? error.message : String(error));
  }
});

export default router;
