import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { formatListResponse, paginationQuerySchema, getPaginationParams } from '../utils/pagination';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

const auditFlightCreate = auditLog('CREATE', 'flight', undefined, (req) => (req.body as any)?.flightNumber);
const auditFlightUpdate = auditLog('UPDATE', 'flight', (req) => req.params.id);
const auditFlightDelete = auditLog('DELETE', 'flight', (req) => req.params.id);
const auditSegmentAttach = auditLog('CREATE', 'departure_flight', (req) => req.params.departureId);
const auditSegmentUpdate = auditLog('UPDATE', 'departure_flight', (req) => req.params.id);
const auditSegmentDelete = auditLog('DELETE', 'departure_flight', (req) => req.params.id);

const IATA_RE = /^[A-Z]{3}$/;
const normalizeIata = (v: string) => v.trim().toUpperCase();

// Shared field validators reused by create + update so both enforce the same rules.
const iataCode = (label: string) =>
  z.string().trim().min(3).max(3).transform(normalizeIata).refine((v) => IATA_RE.test(v), { message: `${label} must be a valid 3-letter IATA code` });

const createFlightSchema = z
  .object({
    airline: z.string().trim().min(1, 'Airline is required'),
    flightNumber: z.string().trim().min(1, 'Flight number is required'),
    departureAirport: iataCode('Departure airport'),
    arrivalAirport: iataCode('Arrival airport'),
    departureTime: z.string().datetime({ message: 'Departure time must be a valid ISO datetime' }),
    arrivalTime: z.string().datetime({ message: 'Arrival time must be a valid ISO datetime' }),
    capacity: z.number().int('Capacity must be a whole number').positive('Capacity must be positive').default(180),
    basePrice: z.number().min(0, 'Price cannot be negative').default(0),
    currency: z.string().trim().min(1).default('BAM'),
    notes: z.string().optional().nullable(),
    active: z.boolean().default(true),
  })
  .refine((v) => v.departureAirport !== v.arrivalAirport, { message: 'Departure and arrival airports cannot be identical', path: ['arrivalAirport'] })
  .refine((v) => new Date(v.arrivalTime).getTime() > new Date(v.departureTime).getTime(), { message: 'Arrival must be after departure', path: ['arrivalTime'] });

const updateFlightSchema = z
  .object({
    airline: z.string().trim().min(1, 'Airline is required').optional(),
    flightNumber: z.string().trim().min(1, 'Flight number is required').optional(),
    departureAirport: iataCode('Departure airport').optional(),
    arrivalAirport: iataCode('Arrival airport').optional(),
    departureTime: z.string().datetime({ message: 'Departure time must be a valid ISO datetime' }).optional(),
    arrivalTime: z.string().datetime({ message: 'Arrival time must be a valid ISO datetime' }).optional(),
    capacity: z.number().int('Capacity must be a whole number').positive('Capacity must be positive').optional(),
    basePrice: z.number().min(0, 'Price cannot be negative').optional(),
    currency: z.string().trim().min(1).optional(),
    notes: z.string().optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine((v) => {
    if (v.departureAirport && v.arrivalAirport) return v.departureAirport !== v.arrivalAirport;
    return true;
  }, { message: 'Departure and arrival airports cannot be identical', path: ['arrivalAirport'] })
  .refine((v) => {
    if (v.departureTime && v.arrivalTime) return new Date(v.arrivalTime).getTime() > new Date(v.departureTime).getTime();
    return true;
  }, { message: 'Arrival must be after departure', path: ['arrivalTime'] });

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    active: z.enum(['true', 'false']).optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

function transformFlight(f: any) {
  return {
    id: f.id,
    orgId: f.org_id,
    airline: f.airline,
    flightNumber: f.flight_number,
    departureAirport: f.departure_airport,
    arrivalAirport: f.arrival_airport,
    departureTime: f.departure_time,
    arrivalTime: f.arrival_time,
    capacity: f.capacity,
    basePrice: f.base_price,
    currency: f.currency,
    notes: f.notes,
    active: f.active,
    createdAt: f.created_at,
    linkedDepartureCount: f.linked_departure_count ?? 0,
    linkedDepartures: f.linked_departures ?? [],
  };
}

function transformSegment(s: any) {
  return {
    id: s.id,
    departureId: s.departure_id,
    flightId: s.flight_id,
    direction: s.direction,
    segmentOrder: s.segment_order,
    createdAt: s.created_at,
    flight: s.flight ?? (s.flights ? s.flights[0] ?? null : null),
  };
}

/** GET /api/flights */
router.get('/flights', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req: any, res: Response, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const { search, active, page, limit, offset } = r.data;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('flights')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('departure_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`airline.ilike.%${search}%,flight_number.ilike.%${search}%,departure_airport.ilike.%${search}%,arrival_airport.ilike.%${search}%`);
    }
    if (active !== undefined) query = query.eq('active', active === 'true');

    const { data, error, count } = await query;
    if (error) throw error;

    const flights = data || [];
    const flightIds = flights.map((flight) => flight.id);
    const linkedDeparturesByFlight = new Map<string, any[]>();

    if (flightIds.length > 0) {
      const { data: segments, error: segmentsError } = await supabaseAdmin
        .from('departure_flights')
        .select(`
          flight_id,
          direction,
          departures (
            id,
            depart_at,
            return_at,
            status,
            packages (
              id,
              name,
              destination
            )
          )
        `)
        .eq('org_id', orgId)
        .in('flight_id', flightIds);

      if (segmentsError) throw segmentsError;

      for (const segment of segments || []) {
        const departure = segment.departures as any;
        if (!departure) continue;
        const flightId = segment.flight_id;
        const current = linkedDeparturesByFlight.get(flightId) || [];
        current.push({
          id: departure.id,
          departAt: departure.depart_at,
          returnAt: departure.return_at,
          status: departure.status,
          direction: segment.direction,
          packageName: departure.packages?.name || '-',
          destination: departure.packages?.destination || '-',
        });
        linkedDeparturesByFlight.set(flightId, current);
      }
    }

    return res.json({
      data: flights.map((flight) => transformFlight({
        ...flight,
        linked_departure_count: (linkedDeparturesByFlight.get(flight.id) || []).length,
        linked_departures: linkedDeparturesByFlight.get(flight.id) || [],
      })),
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) { next(err); }
});

/** POST /api/flights */
router.post('/flights', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditFlightCreate,
  async (req: any, res: Response) => {
    try {
      const r = createFlightSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const orgId = req.orgId!;
      const v = r.data;

      const { data, error } = await supabaseAdmin
        .from('flights')
        .insert({
          org_id: orgId,
          airline: v.airline,
          flight_number: v.flightNumber,
          departure_airport: v.departureAirport,
          arrival_airport: v.arrivalAirport,
          departure_time: v.departureTime,
          arrival_time: v.arrivalTime,
          capacity: v.capacity,
          base_price: v.basePrice,
          currency: v.currency,
          notes: v.notes ?? null,
          active: v.active,
        })
        .select()
        .single();

      if (error) return handleSupabaseError(res, error, 'Failed to create flight');
      return res.status(201).json(transformFlight(data));
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

/** PATCH /api/flights/:id */
router.patch('/flights/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditFlightUpdate,
  async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const r = updateFlightSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const orgId = req.orgId!;

      // Load the existing flight scoped by id + org — 404 when absent.
      const { data: existing, error: loadErr } = await supabaseAdmin
        .from('flights')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing) return apiError(res, 404, 'NOT_FOUND', 'Flight not found');

      const updates: Record<string, unknown> = {};
      const v = r.data;
      if (v.airline !== undefined) updates.airline = v.airline;
      if (v.flightNumber !== undefined) updates.flight_number = v.flightNumber;
      if (v.departureAirport !== undefined) updates.departure_airport = v.departureAirport;
      if (v.arrivalAirport !== undefined) updates.arrival_airport = v.arrivalAirport;
      if (v.departureTime !== undefined) updates.departure_time = v.departureTime;
      if (v.arrivalTime !== undefined) updates.arrival_time = v.arrivalTime;
      if (v.capacity !== undefined) updates.capacity = v.capacity;
      if (v.basePrice !== undefined) updates.base_price = v.basePrice;
      if (v.currency !== undefined) updates.currency = v.currency;
      if (v.notes !== undefined) updates.notes = v.notes;
      if (v.active !== undefined) updates.active = v.active;

      // Final-state validation: merge PATCH values over existing row so
      // single-field changes are checked against the unmodified counterpart.
      const finalDepartureAirport = String(updates.departure_airport ?? existing.departure_airport ?? '');
      const finalArrivalAirport = String(updates.arrival_airport ?? existing.arrival_airport ?? '');
      if (finalDepartureAirport && finalArrivalAirport && finalDepartureAirport === finalArrivalAirport) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Departure and arrival airports cannot be identical');
      }
      const finalDepartureTime = updates.departure_time ?? existing.departure_time;
      const finalArrivalTime = updates.arrival_time ?? existing.arrival_time;
      if (finalDepartureTime && finalArrivalTime) {
        const dep = new Date(String(finalDepartureTime)).getTime();
        const arr = new Date(String(finalArrivalTime)).getTime();
        if (!Number.isNaN(dep) && !Number.isNaN(arr) && arr <= dep) {
          return apiError(res, 400, 'VALIDATION_ERROR', 'Arrival must be after departure');
        }
      }

      const { data, error } = await supabaseAdmin
        .from('flights')
        .update(updates)
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) return handleSupabaseError(res, error, 'Failed to update flight');
      return res.json(transformFlight(data));
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

/** DELETE /api/flights/:id */
router.delete('/flights/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditFlightDelete,
  async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      // Flight must exist in this org
      const { data: flight, error: flightErr } = await supabaseAdmin
        .from('flights')
        .select('id')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (flightErr) throw flightErr;
      if (!flight) return apiError(res, 404, 'NOT_FOUND', 'Flight not found');

      // Safe delete: refuse when still referenced by a departure itinerary
      const { data: legacyLinks, error: legacyErr } = await supabaseAdmin
        .from('departures')
        .select('id')
        .eq('flight_id', id)
        .eq('org_id', orgId);
      if (legacyErr) throw legacyErr;

      const { data: segmentLinks, error: segmentErr } = await supabaseAdmin
        .from('departure_flights')
        .select('id')
        .eq('flight_id', id)
        .eq('org_id', orgId);
      if (segmentErr) throw segmentErr;

      if ((legacyLinks && legacyLinks.length > 0) || (segmentLinks && segmentLinks.length > 0)) {
        return apiError(res, 409, 'FLIGHT_IN_USE', 'Flight is linked to one or more departures. Unlink it first.');
      }

      const { error } = await supabaseAdmin
        .from('flights')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to delete flight');
      return res.json({ success: true });
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

// ── Departure flight segments ────────────────────────────────────────────────

const attachSegmentSchema = z.object({
  flightId: z.string().uuid(),
  direction: z.enum(['outbound', 'return', 'other']).default('outbound'),
  segmentOrder: z.number().int().min(0).optional(),
});

const updateSegmentSchema = z.object({
  direction: z.enum(['outbound', 'return', 'other']).optional(),
  segmentOrder: z.number().int().min(0).optional(),
});

/** GET /api/departures/:departureId/flights — ordered itinerary segments */
router.get('/departures/:departureId/flights', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req: any, res: Response, next) => {
  try {
    const { departureId } = req.params;
    const orgId = req.orgId!;

    const { data: dep, error: depErr } = await supabaseAdmin
      .from('departures')
      .select('id')
      .eq('id', departureId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (depErr) throw depErr;
    if (!dep) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

    const { data, error } = await supabaseAdmin
      .from('departure_flights')
      .select('*, flights(id, airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, capacity, active)')
      .eq('departure_id', departureId)
      .eq('org_id', orgId)
      .order('direction', { ascending: true })
      .order('segment_order', { ascending: true });

    if (error) throw error;
    return res.json({ data: (data || []).map(transformSegment) });
  } catch (err) { next(err); }
});

/** POST /api/departures/:departureId/flights — attach a flight segment */
router.post('/departures/:departureId/flights', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditSegmentAttach,
  async (req: any, res: Response) => {
    try {
      const { departureId } = req.params;
      const r = attachSegmentSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);
      const orgId = req.orgId!;
      const v = r.data;

      // Departure must exist in this org
      const { data: dep, error: depErr } = await supabaseAdmin
        .from('departures')
        .select('id, org_id')
        .eq('id', departureId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (depErr) throw depErr;
      if (!dep) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

      // Flight must exist in this org
      const { data: flight, error: flightErr } = await supabaseAdmin
        .from('flights')
        .select('id, org_id')
        .eq('id', v.flightId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (flightErr) throw flightErr;
      if (!flight) return apiError(res, 404, 'NOT_FOUND', 'Flight not found or belongs to another organization');

      // Next segment_order for the chosen direction when not explicitly provided
      let segmentOrder = v.segmentOrder;
      if (segmentOrder === undefined) {
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from('departure_flights')
          .select('segment_order')
          .eq('departure_id', departureId)
          .eq('direction', v.direction)
          .order('segment_order', { ascending: false })
          .limit(1);
        if (existingErr) throw existingErr;
        segmentOrder = (existing?.[0]?.segment_order ?? -1) + 1;
      }

      const { data, error } = await supabaseAdmin
        .from('departure_flights')
        .insert({
          org_id: orgId,
          departure_id: departureId,
          flight_id: v.flightId,
          direction: v.direction,
          segment_order: segmentOrder,
        })
        .select('*, flights(id, airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, capacity, active)')
        .single();

      if (error) return handleSupabaseError(res, error, 'Failed to attach flight');
      return res.status(201).json(transformSegment(data));
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

/** PATCH /api/departures/:departureId/flights/:id — reorder / reassign direction */
router.patch('/departures/:departureId/flights/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditSegmentUpdate,
  async (req: any, res: Response) => {
    try {
      const { departureId, id } = req.params;
      const r = updateSegmentSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);
      const orgId = req.orgId!;
      const v = r.data;

      const updates: Record<string, unknown> = {};
      if (v.direction !== undefined) updates.direction = v.direction;
      if (v.segmentOrder !== undefined) updates.segment_order = v.segmentOrder;

      const { data, error } = await supabaseAdmin
        .from('departure_flights')
        .update(updates)
        .eq('id', id)
        .eq('departure_id', departureId)
        .eq('org_id', orgId)
        .select('*, flights(id, airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, capacity, active)')
        .single();

      if (error) return handleSupabaseError(res, error, 'Failed to update flight segment');
      return res.json(transformSegment(data));
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

/** DELETE /api/departures/:departureId/flights/:id — unlink (does NOT delete the flight) */
router.delete('/departures/:departureId/flights/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  auditSegmentDelete,
  async (req: any, res: Response) => {
    try {
      const { departureId, id } = req.params;
      const orgId = req.orgId!;

      const { error } = await supabaseAdmin
        .from('departure_flights')
        .delete()
        .eq('id', id)
        .eq('departure_id', departureId)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to unlink flight');
      return res.json({ success: true });
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });


// ── Bulk reorder ─────────────────────────────────────────────────────────────

const reorderSchema = z.object({
  segments: z.array(z.object({
    id: z.string().uuid(),
    direction: z.enum(["outbound", "return", "other"]),
    segmentOrder: z.number().int().min(0),
  })).min(1, "At least one segment required"),
});

/** PUT /api/departures/:departureId/flights/reorder — atomic two-phase reorder */
router.put('/departures/:departureId/flights/reorder', authenticateToken, requireOrgContext, requireMinimumRole('manager'),
  async (req: any, res: Response) => {
    try {
      const { departureId } = req.params;
      const r = reorderSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);
      const orgId = req.orgId!;

      // Single atomic DB unit: departure-org ownership, segment-set match,
      // duplicate checks, temp + final positions — all inside one PostgreSQL
      // function; any failure rolls back everything. The RPC also enforces
      // org scoping, so no separate ownership query is needed.
      const { data: reordered, error: rpcErr } = await supabaseAdmin
        .rpc('reorder_departure_flights_atomic', {
          p_org_id: orgId,
          p_departure_id: departureId,
          p_segments: r.data.segments,
        });

      if (rpcErr) {
        const detail = String((rpcErr as any).message || '');
        if (detail.includes('departure_not_found_in_org')) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');
        if (detail.includes('incomplete_segment_set') || detail.includes('segment_not_in_departure') || detail.includes('empty_segment_set'))
          return apiError(res, 400, 'VALIDATION_ERROR', 'Segment set does not match this departure itinerary');
        if (detail.includes('duplicate_segment_ids') || detail.includes('duplicate_direction_order_targets'))
          return apiError(res, 400, 'VALIDATION_ERROR', 'Duplicate segment or ordering target in payload');
        throw rpcErr;
      }

      // Return final ordered list
      const { data: result, error: resultErr } = await supabaseAdmin
        .from('departure_flights')
        .select('*, flights(id, airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, capacity, active)')
        .eq('departure_id', departureId)
        .eq('org_id', orgId)
        .order('direction', { ascending: true })
        .order('segment_order', { ascending: true });

      if (resultErr) throw resultErr;
      return res.json({ data: (result || []).map(transformSegment) });
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });


export default router;
