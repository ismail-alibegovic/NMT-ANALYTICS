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


const createFlightSchema = z.object({
  airline: z.string().min(1, 'Airline is required'),
  flightNumber: z.string().min(1, 'Flight number is required'),
  departureAirport: z.string().min(3, 'Departure airport code is required'),
  arrivalAirport: z.string().min(3, 'Arrival airport code is required'),
  departureTime: z.string().min(1, 'Departure time is required'),
  arrivalTime: z.string().min(1, 'Arrival time is required'),
  capacity: z.number().int().positive().default(180),
  basePrice: z.number().min(0).default(0),
  currency: z.string().default('BAM'),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

const updateFlightSchema = z.object({
  airline: z.string().min(1).optional(),
  flightNumber: z.string().min(1).optional(),
  departureAirport: z.string().min(3).optional(),
  arrivalAirport: z.string().min(3).optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  basePrice: z.number().min(0).optional(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

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
      const { data: linkedDepartures, error: linkedDeparturesError } = await supabaseAdmin
        .from('departures')
        .select(`
          id,
          flight_id,
          depart_at,
          return_at,
          status,
          packages (
            id,
            name,
            destination
          )
        `)
        .eq('org_id', orgId)
        .in('flight_id', flightIds)
        .order('depart_at', { ascending: false });

      if (linkedDeparturesError) throw linkedDeparturesError;

      for (const departure of linkedDepartures || []) {
        const flightId = departure.flight_id;
        if (!flightId) continue;
        const current = linkedDeparturesByFlight.get(flightId) || [];
        current.push({
          id: departure.id,
          departAt: departure.depart_at,
          returnAt: departure.return_at,
          status: departure.status,
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

      const { error } = await supabaseAdmin
        .from('flights')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) return handleSupabaseError(res, error, 'Failed to delete flight');
      return res.json({ success: true });
    } catch (err) { apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
  });

export default router;
