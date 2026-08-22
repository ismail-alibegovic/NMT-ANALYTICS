import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { auditDepartureCreate, auditDepartureUpdate, auditDepartureDelete } from '../middleware/auditLogger';
import { formatListResponse, paginationQuerySchema, dateRangeQuerySchema, getPaginationParams, getDateRangeParams } from '../utils/pagination';
import { apiError } from "../lib/errors";
import { requireMinimumRole } from '../middleware/requireRole';
import { getDepartureStatus, resolveDepartureCapabilities } from '../utils/business';

const router = Router();

/**
 * Helper to transform departure for Admin UI
 */
function transformDeparture(departure: any) {
  const statusInfo = getDepartureStatus(departure.booked || 0, departure.capacity || 0);

  return {
    ...departure,
    packageName: departure.packages?.name || '-',
    destination: departure.packages?.destination || '-',
    occupancyStatus: statusInfo
  };
}

const getDeparturesQuerySchema = z.object({
  search: z.string().optional(),
  ...paginationQuerySchema,
  ...dateRangeQuerySchema,
  packageId: z.string().uuid('Invalid package ID').optional(),
}).transform(data => ({
  ...data,
  ...getPaginationParams(data),
  ...getDateRangeParams(data),
}));

const createDepartureSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
  departAt: z.string().min(1, 'Departure date is required'),
  returnAt: z.string().min(1, 'Return date is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  status: z.enum(['active', 'cancelled', 'completed']).default('active'),
  booked: z.coerce.number().int().min(0).default(0),
  upsert: z.boolean().default(false),
  transportType: z.enum(['bus', 'flight', 'none']).optional(),
}).refine((data) => new Date(data.returnAt) > new Date(data.departAt), {
  message: 'Return date must be after departure date',
  path: ['returnAt'],
});

const putDepartureSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
  departAt: z.string().min(1, 'Departure date is required'),
  returnAt: z.string().min(1, 'Return date is required'),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  status: z.enum(['active', 'cancelled', 'completed']).default('active'),
  booked: z.coerce.number().int().min(0).optional(),
  transportType: z.enum(['bus', 'flight', 'none']).optional(),
}).transform((data) => ({
  ...data,
  departAt: data.departAt.includes('Z') ? data.departAt : data.departAt.endsWith(':00') ? data.departAt + 'Z' : data.departAt + ':00Z',
  returnAt: data.returnAt.includes('Z') ? data.returnAt : data.returnAt.endsWith(':00') ? data.returnAt + 'Z' : data.returnAt + ':00Z',
})).refine((data) => new Date(data.returnAt) > new Date(data.departAt), {
  message: 'Return date must be after departure date',
  path: ['returnAt'],
});

const updateDepartureSchema = z.object({
  packageId: z.string().uuid('Invalid package ID').optional(),
  departAt: z.string().min(1).optional(),
  returnAt: z.string().min(1).optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").optional(),
  status: z.enum(['active', 'cancelled', 'completed']).optional(),
  booked: z.coerce.number().int().min(0).optional(),
  transportType: z.enum(['bus', 'flight', 'none']).optional(),
}).transform((data) => {
  const result: any = { ...data };
  if (data.departAt) {
    result.departAt = data.departAt.includes('Z') ? data.departAt : data.departAt.endsWith(':00') ? data.departAt + 'Z' : data.departAt + ':00Z';
  }
  if (data.returnAt) {
    result.returnAt = data.returnAt.includes('Z') ? data.returnAt : data.returnAt.endsWith(':00') ? data.returnAt + 'Z' : data.returnAt + ':00Z';
  }
  return result;
}).refine((data) => {
  if (data.departAt && data.returnAt) {
    return new Date(data.returnAt) > new Date(data.departAt);
  }
  return true;
}, {
  message: 'Return date must be after departure date',
  path: ['returnAt'],
});

/**
 * GET /api/departures
 */
router.get('/departures', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const validationResult = getDeparturesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error");
    }

    const { from, to, search, packageId, page, limit, offset, orderBy, orderDir } = validationResult.data;
    const orgId = req.orgId!;

    // Build query
    let query = supabaseAdmin
      .from('departures')
      .select(`
        *,
        packages (
          id,
          name,
          destination,
          base_price,
          currency
        )
      `, { count: 'exact' })
      .eq('org_id', orgId)
      .order(orderBy as string || 'depart_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    // Add date filters if provided
    if (from) {
      query = query.gte('depart_at', `${from}T00:00:00Z`);
    }
    if (to) {
      query = query.lte('depart_at', `${to}T23:59:59Z`);
    }

    // Add package filter if provided
    if (packageId) {
      query = query.eq('package_id', packageId);
    }

    // Add search filter if provided
    if (search) {
      // Search by package name — need a subquery since Supabase join filters don't support .or() on joined tables
      const { data: matchingPackages } = await supabaseAdmin
        .from('packages')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', `%${search}%`)
        .limit(100);

      const pkgIds = (matchingPackages || []).map(p => p.id);
      if (pkgIds.length > 0) {
        query = query.in('package_id', pkgIds);
      } else {
        // No matching packages — force empty result
        query = query.eq('package_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data: departures, error, count } = await query;

    if (error) throw error;

    // Map to Admin interface exactly
    const transformedData = (departures || []).map(transformDeparture);

    return res.json(formatListResponse(transformedData, count || 0, page, limit));

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/departures
 */
router.post('/departures', authenticateToken, requireOrgContext, auditDepartureCreate, async (req, res: Response) => {
  try {
    const validationResult = createDepartureSchema.safeParse(req.body);
    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
      return;
    }

    const { packageId, departAt, returnAt, capacity, booked, status, upsert, transportType } = validationResult.data;
    const orgId = req.orgId!;

    const { data: packageData, error: packageError } = await supabaseAdmin
      .from('packages')
      .select('id, name, destination, transport_type')
      .eq('id', packageId)
      .eq('org_id', orgId)
      .single();

    if (packageError || !packageData) {
      apiError(res, 404, "NOT_FOUND", "Package not found", 'The specified package does not exist or does not belong to your organization');
      return;
    }

    let query = supabaseAdmin
      .from('departures')
      .upsert({
        org_id: orgId,
        package_id: packageId,
        depart_at: departAt,
        return_at: returnAt,
        capacity: capacity,
        booked: booked,
        status: status,
        transport_type: transportType || packageData.transport_type || 'none',
      }, {
        onConflict: upsert ? 'org_id,package_id,depart_at' : undefined,
        ignoreDuplicates: !upsert
      })
      .select(`
        *,
        packages (
          id,
          name,
          destination,
          base_price,
          currency
        )
      `)
      .single();

    const { data: departure, error } = await query;

    if (error) return handleSupabaseError(res, error, "Failed to create departure");

    res.status(upsert ? 200 : 201).json(departure);

  } catch (error) {
    console.error('Error in POST /departures:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * PUT /api/departures/:id
 */
router.put('/departures/:id', authenticateToken, requireOrgContext, auditDepartureUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validationResult = putDepartureSchema.safeParse(req.body);
    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
      return;
    }

    const { packageId, departAt, returnAt, capacity, status, booked, transportType } = validationResult.data;
    const orgId = req.orgId!;

    const { data: packageData, error: packageError } = await supabaseAdmin
      .from('packages')
      .select('id, name, destination, transport_type')
      .eq('id', packageId)
      .eq('org_id', orgId)
      .single();

    if (packageError || !packageData) {
      apiError(res, 404, "NOT_FOUND", "Package not found");
      return;
    }

    const { data: departure, error } = await supabaseAdmin
      .from('departures')
      .update({
        package_id: packageId,
        depart_at: departAt,
        return_at: returnAt,
        capacity: capacity,
        status: status,
        transport_type: transportType || undefined,
        ...(booked !== undefined ? { booked } : {}),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select(`
        *,
        packages (
          id,
          name,
          destination,
          base_price,
          currency
        )
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        apiError(res, 404, "NOT_FOUND", "Departure not found");
        return;
      }
      throw error;
    }

    res.json(departure);

  } catch (error) {
    console.error('Error in PUT /departures/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * PATCH /api/departures/:id
 */
router.patch('/departures/:id', authenticateToken, requireOrgContext, auditDepartureUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validationResult = updateDepartureSchema.safeParse(req.body);
    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
      return;
    }

    const { packageId, departAt, returnAt, capacity, status, booked, transportType } = validationResult.data;
    const orgId = req.orgId!;

    if (packageId) {
      const { data: packageData, error: packageError } = await supabaseAdmin
        .from('packages')
        .select('id, name, destination')
        .eq('id', packageId)
        .eq('org_id', orgId)
        .single();

      if (packageError || !packageData) {
        apiError(res, 404, "NOT_FOUND", "Package not found");
        return;
      }
    }

    const updateData: any = {};
    if (packageId !== undefined) updateData.package_id = packageId;
    if (departAt !== undefined) updateData.depart_at = departAt;
    if (returnAt !== undefined) updateData.return_at = returnAt;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (status !== undefined) updateData.status = status;
    if (booked !== undefined) updateData.booked = booked;
    if (transportType !== undefined) updateData.transport_type = transportType;

    const { data: departure, error } = await supabaseAdmin
      .from('departures')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select(`
        *,
        packages (
          id,
          name,
          destination,
          base_price,
          currency
        )
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        apiError(res, 404, "NOT_FOUND", "Departure not found");
        return;
      }
      return handleSupabaseError(res, error, "Failed to update departure");
    }

    res.json(departure);

  } catch (error) {
    console.error('Error in PATCH /departures/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * DELETE /api/departures/:id
 */
router.delete('/departures/:id', authenticateToken, requireOrgContext, auditDepartureDelete, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { error } = await supabaseAdmin
      .from('departures')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      if (error.code === 'PGRST116') {
        apiError(res, 404, "NOT_FOUND", "Departure not found");
        return;
      }
      return handleSupabaseError(res, error, "Failed to delete departure");
    }

    res.status(204).send();

  } catch (error) {
    console.error('Error in DELETE /departures/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/departures/:id
 */
router.get('/departures/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { data: departure, error } = await supabaseAdmin
      .from('departures')
      .select(`
        *,
        packages (
          id,
          name,
          destination,
          base_price,
          currency,
          transport_type,
          trip_type,
          country
        )
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !departure) {
      apiError(res, 404, "NOT_FOUND", "Departure not found");
      return;
    }

    const pkg = (departure as any).packages;
    const packageId = (departure as any).package_id;

    // Resolve package services (defaults from the package template)
    let packageServices: any[] = [];
    if (packageId) {
      const { data: svc, error: svcErr } = await supabaseAdmin
        .from('package_services')
        .select('*')
        .eq('package_id', packageId)
        .eq('org_id', orgId);
      if (svcErr) console.error('package_services fetch (non-fatal):', svcErr);
      else packageServices = svc || [];
    }

    // Resolve package hotels (accommodation options from the template)
    let packageHotels: any[] = [];
    if (packageId) {
      const { data: ph, error: phErr } = await supabaseAdmin
        .from('package_hotels')
        .select('*, hotels:hotel_id(id, name, country, city)')
        .eq('package_id', packageId);
      if (phErr) console.error('package_hotels fetch (non-fatal):', phErr);
      else packageHotels = ph || [];
    }

    // Resolve hotel allocations (operational room assignments for this departure)
    let hotelAllocations: any[] = [];
    {
      const { data: alloc, error: allocErr } = await supabaseAdmin
        .from('hotel_allocations')
        .select('*, hotels:hotel_id(id, name)')
        .eq('departure_id', id)
        .eq('org_id', orgId);
      if (allocErr) console.error('hotel_allocations fetch (non-fatal):', allocErr);
      else hotelAllocations = alloc || [];
    }

    // Resolve accommodation buildings/rooms for this departure
    let accommodationBuildings: any[] = [];
    {
      const { data: bldg, error: bldgErr } = await supabaseAdmin
        .from('accommodation_buildings')
        .select('*, floors:accommodation_floors(*, rooms:accommodation_rooms(*))')
        .eq('departure_id', id)
        .eq('org_id', orgId);
      if (bldgErr) console.error('accommodation_buildings fetch (non-fatal):', bldgErr);
      else accommodationBuildings = bldg || [];
    }

    // Resolve passenger groups for this departure
    let passengerGroups: any[] = [];
    {
      const { data: grp, error: grpErr } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('*')
        .eq('departure_id', id)
        .eq('org_id', orgId);
      if (grpErr) console.error('passenger_groups fetch (non-fatal):', grpErr);
      else passengerGroups = grp || [];
    }

    // Resolve capabilities based on package + departure context
    const transportType = (departure as any).transport_type || (pkg as any)?.transport_type || 'none';
    const hasAccommodation = packageServices.some((s: any) =>
      ['hotel', 'accommodation', 'apartment', 'hostel'].includes(s.service_type?.toLowerCase?.() || '')
    ) || packageHotels.length > 0 || hotelAllocations.length > 0 || accommodationBuildings.length > 0;

    const capabilities = resolveDepartureCapabilities(
      departure as any,
      pkg as any,
      hasAccommodation,
    );

    const base = transformDeparture(departure);
    res.json({
      ...base,
      packageServices,
      packageHotels,
      hotelAllocations,
      accommodationBuildings,
      passengerGroups,
      capabilities,
    });
  } catch (error) {
    console.error('Error in GET /departures/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/departures/:id/passengers
 * Returns the full passenger manifest for a departure: every guest (reservations + their excursion_passengers),
 * with hotel room assignment, tour guide, seat number, payment status, customer info, source agent.
 */
router.get('/departures/:id/passengers', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Verify departure exists + belongs to org
    const { data: departure, error: depErr } = await supabaseAdmin
      .from('departures')
      .select('id, depart_at, return_at, capacity, booked, package_id, packages(id, name, destination, currency)')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (depErr || !departure) {
      apiError(res, 404, "NOT_FOUND", "Departure not found");
      return;
    }

    // 1) Reservations on this departure with customer (verified FK only — no customer_email col exists)
    const { data: reservationsRaw, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select(`
        id, customer_id, customer_name, customer_phone,
        party_size, total_amount, currency, status, source, reservation_at,
        hotel_name, room_type, check_in, check_out, tour_guide,
        assigned_to,
        customers!reservations_customer_id_fkey(id, full_name, phone, email)
      `)
      .eq('departure_id', id)
      .eq('org_id', orgId)
      .order('reservation_at', { ascending: true });

    if (resErr) {
      console.error('Error fetching reservations:', resErr);
      apiError(res, 502, "DB_ERROR", "Failed to load reservations");
      return;
    }
    const reservations = (reservationsRaw || []) as any[];
    const custRow = (r: any) => Array.isArray(r.customers) ? (r.customers[0] || null) : (r.customers || r.customers);
    const pkg = (departure as any).packages;

    // 2) Agent names: fetch profiles for all assigned_to UUIDs in one shot (assigned_to is a plain UUID, no FK hint)
    const agentUuids = Array.from(new Set((reservations || []).map((r: any) => r.assigned_to).filter(Boolean))) as string[];
    const agentNameByUuid: Record<string, string> = {};
    if (agentUuids.length > 0) {
      const { data: agentRows, error: agErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', agentUuids);
      if (!agErr && agentRows) {
        for (const a of agentRows) agentNameByUuid[a.id] = a.full_name;
      }
    }
    const agentRow = (r: any) => r.assigned_to ? (agentNameByUuid[r.assigned_to] || null) : null;

    // 1b) Resolve assigned agents' names in a separate query (assigned_to is a plain UUID, not a PostgREST FK target)
    const agentIds = Array.from(new Set((reservations || [])
      .map((r: any) => r.assigned_to)
      .filter((x: any): x is string => typeof x === 'string' && x.length > 0)));
    let agentNameById: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: agentRows, error: agentErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', agentIds);
      if (agentErr) console.error('Agent fetch (non-fatal):', agentErr);
      if (agentRows) for (const a of agentRows) agentNameById[a.id] = a.full_name;
    }
    const agentRow2 = (r: any) => (r.assigned_to && agentNameById[r.assigned_to]) || null;

    // 2) Per-passenger rows (excursion_passengers) for those reservations, with seat + paid + debt
    const reservationIds = (reservations || []).map((r: any) => r.id);
    let passengers: any[] = [];
    if (reservationIds.length > 0) {
      const { data: passRows, error: passErr } = await supabaseAdmin
        .from('excursion_passengers')
        .select('id, reservation_id, full_name, seat_number, paid_amount, debt_amount, phone, notes')
        .in('reservation_id', reservationIds)
        .order('seat_number', { ascending: true, nullsFirst: false });
      if (passErr) console.error('Passengers fetch (non-fatal):', passErr);
      if (passRows) passengers = passRows;
    }

    // 2b) Passenger groups for this departure
    let groupMembers: any[] = [];
    let groups: any[] = [];
    let groupById: Record<string, any> = {};
    if (reservationIds.length > 0) {
      const { data: gmRows, error: gmErr } = await supabaseAdmin
        .from('trip_passenger_group_members')
        .select('id, group_id, passenger_name, reservation_id')
        .in('reservation_id', reservationIds);
      if (gmErr) console.error('Group members fetch (non-fatal):', gmErr);
      else groupMembers = gmRows || [];
    }
    if (groupMembers.length > 0) {
      const groupIds = Array.from(new Set(groupMembers.map((gm: any) => gm.group_id)));
      const { data: gRows, error: gErr } = await supabaseAdmin
        .from('trip_passenger_groups')
        .select('id, name, color, primary_passenger_name, notes, seating_preference, accommodation_preference, locked')
        .in('id', groupIds)
        .eq('org_id', orgId);
      if (gErr) console.error('Groups fetch (non-fatal):', gErr);
      else {
        groups = gRows || [];
        for (const g of groups) groupById[g.id] = g;
      }
    }

    // 3) Hotel allocations for this departure — rooms assigned from the hotel_rooms matrix
    const { data: allocations, error: allocErr } = await supabaseAdmin
      .from('hotel_allocations')
      .select(`
        id, hotel_id, room_type, check_in, check_out,
        hotels(id, name)
      `)
      .eq('departure_id', id)
      .eq('org_id', orgId);
    if (allocErr) console.error('Allocations fetch (non-fatal):', allocErr);

    // 4) Payments received against these reservations
    let payments: any[] = [];
    if (reservationIds.length > 0) {
      const { data: payRows, error: payErr } = await supabaseAdmin
        .from('payments')
        .select('id, reservation_id, amount, payment_date, status, currency, payment_method, refunded_at, refund_reason')
        .in('reservation_id', reservationIds)
        .order('payment_date', { ascending: false });
      if (payErr) console.error('Payments fetch (non-fatal):', payErr);
      if (payRows) payments = payRows;
    }

    // Compose manifest: one row per passenger if excursion_passengers exist, else one row per reservation (party_size)
    const manifest: any[] = [];
    const passByRes = (passengers || []).reduce<Record<string, any[]>>((acc, p) => {
      (acc[p.reservation_id] ||= []).push(p);
      return acc;
    }, {});

    // Group member lookup by passenger name
    const groupMemberByName: Record<string, any> = {};
    for (const gm of groupMembers) {
      if (gm.passenger_name) groupMemberByName[gm.passenger_name] = gm;
    }

    for (const r of (reservations || [])) {
      const cust = custRow(r);
      const agent = agentRow(r);
      const rows = passByRes[r.id] || [];
      const paymentsForRes = (payments || []).filter((p: any) => p.reservation_id === r.id);
      const totalPaid = paymentsForRes.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      if (rows.length > 0) {
        for (const p of rows) {
          manifest.push({
            passengerId: p.id,
            reservationId: r.id,
            fullName: p.full_name || r.customer_name,
            phone: p.phone || r.customer_phone || cust?.phone,
            email: cust?.email,
            seat: p.seat_number,
            paid: Number(p.paid_amount || 0),
            debt: Number(p.debt_amount || 0),
            customerLinked: !!cust,
            customerId: cust?.id,
            hotelName: r.hotel_name,
            roomType: r.room_type,
            checkIn: r.check_in,
            checkOut: r.check_out,
            tourGuide: r.tour_guide,
            agent,
            reservationStatus: r.status,
            source: r.source,
            partySize: r.party_size,
            reservationTotal: Number(r.total_amount || 0),
            currency: r.currency || pkg?.currency || 'EUR',
            payments: paymentsForRes,
            notes: p.notes,
            groupName: (() => { const gm = groupMemberByName[p.full_name]; return gm && groupById[gm.group_id] ? groupById[gm.group_id].name : null; })(),
            groupId: groupMemberByName[p.full_name]?.group_id || null,
            groupColor: (() => { const gm = groupMemberByName[p.full_name]; return gm && groupById[gm.group_id] ? groupById[gm.group_id].color : null; })(),
          });
        }
      } else {
        // No per-passenger breakdown — emit reservation row, party_size tells us how many guests it represents
        manifest.push({
          passengerId: null,
          reservationId: r.id,
          fullName: r.customer_name,
          phone: r.customer_phone || cust?.phone,
          email: cust?.email,
          seat: null,
          paid: totalPaid,
          debt: Number(r.total_amount || 0) - totalPaid,
          customerLinked: !!cust,
          customerId: cust?.id,
          hotelName: r.hotel_name,
          roomType: r.room_type,
          checkIn: r.check_in,
          checkOut: r.check_out,
          tourGuide: r.tour_guide,
          agent,
          reservationStatus: r.status,
          source: r.source,
          partySize: r.party_size,
          reservationTotal: Number(r.total_amount || 0),
          currency: r.currency || pkg?.currency || 'EUR',
          payments: paymentsForRes,
          notes: null,
          groupName: (() => { const gm = groupMemberByName[r.customer_name]; return gm && groupById[gm.group_id] ? groupById[gm.group_id].name : null; })(),
          groupId: groupMemberByName[r.customer_name]?.group_id || null,
          groupColor: (() => { const gm = groupMemberByName[r.customer_name]; return gm && groupById[gm.group_id] ? groupById[gm.group_id].color : null; })(),
        });
      }
    }

    // Summary stats
    const totalGuests = manifest.reduce((s, m) => s + (m.passengerId ? 1 : (m.partySize || 1)), 0);
    const totalBooked = (reservations || []).reduce((s, r) => s + r.party_size, 0);
    const confirmedGuests = manifest
      .filter(m => m.reservationStatus === 'confirmed')
      .reduce((s, m) => s + (m.passengerId ? 1 : (m.partySize || 1)), 0);
    const totalPaidAmount = manifest.reduce((s, m) => s + m.paid, 0);
    const totalDebtAmount = manifest.reduce((s, m) => s + m.debt, 0);
    const guides = Array.from(new Set(manifest.map(m => m.tourGuide).filter(Boolean)));
    const hotelsOnTrip = Array.from(new Set(manifest.map(m => m.hotelName).filter(Boolean)));

    res.json({
      departure: {
        id: departure.id,
        departAt: departure.depart_at,
        returnAt: departure.return_at,
        capacity: departure.capacity,
        booked: departure.booked,
        package: pkg,
      },
      summary: {
        totalReservations: (reservations || []).length,
        totalGuests,
        confirmedGuests,
        bookedVsCapacity: `${totalBooked}/${departure.capacity}`,
        fillRate: departure.capacity > 0 ? Math.round((totalBooked / departure.capacity) * 100) : 0,
        totalPaid: totalPaidAmount,
        totalDebt: totalDebtAmount,
        currency: pkg?.currency || 'EUR',
        guides,
        hotels: hotelsOnTrip,
        allocations: allocations || [],
      },
      manifest,
    });
  } catch (error) {
    console.error('Error in GET /departures/:id/passengers:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/departures/:id/groups
 * Aggregates the passenger manifest into natural groups: by hotel (accommodation groups)
 * and by source agent (sales-channel groups). Used by the Departure detail page "Groups" tab.
 */
router.get('/departures/:id/groups', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Reuse the passengers query logic by fetching reservations directly (only verified FKs)
    const { data: reservationsRaw, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select(`id, customer_name, customer_phone, party_size,
              total_amount, currency, status, source, hotel_name, room_type,
              check_in, check_out, tour_guide, assigned_to`)
      .eq('departure_id', id)
      .eq('org_id', orgId)
      .order('hotel_name', { ascending: true, nullsFirst: false });

    if (resErr) {
      apiError(res, 502, "DB_ERROR", "Failed to load reservations");
      return;
    }
    const reservations = (reservationsRaw || []) as any[];

    // Resolve agent names separately (assigned_to is a plain UUID)
    const agentIds2 = Array.from(new Set((reservations || [])
      .map((r: any) => r.assigned_to)
      .filter((x: any): x is string => typeof x === 'string' && x.length > 0)));
    let agentMap: Record<string, string> = {};
    if (agentIds2.length > 0) {
      const { data: agentRows, error: agentErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', agentIds2);
      if (agentErr) console.error('Agent fetch (non-fatal):', agentErr);
      if (agentRows) for (const a of agentRows) agentMap[a.id] = a.full_name;
    }
    const agentRow = (r: any) => (r.assigned_to && agentMap[r.assigned_to]) || r.source || '(nepoznat agent)';

    // Group by hotel
    const hotelGroups: Record<string, any> = {};
    // Group by sales agent (assigned_to / source)
    const agentGroups: Record<string, any> = {};

    for (const r of reservations) {
      const hotelKey = (r.hotel_name && r.hotel_name.trim()) ? r.hotel_name.trim() : '(bez hotela)';
      const agentKey = agentRow(r);
      const pax = (r.party_size || 1);
      if (!hotelGroups[hotelKey]) hotelGroups[hotelKey] = { key: hotelKey, label: hotelKey, count: 0, passengers: [], roomType: r.room_type, checkIn: r.check_in, checkOut: r.check_out };
      hotelGroups[hotelKey].count += pax;
      hotelGroups[hotelKey].passengers.push({ name: r.customer_name, phone: r.customer_phone, partySize: pax, roomType: r.room_type });

      if (!agentGroups[agentKey]) agentGroups[agentKey] = { key: agentKey, label: agentKey, count: 0, passengers: [], hotels: new Set() };
      agentGroups[agentKey].count += pax;
      agentGroups[agentKey].passengers.push({ name: r.customer_name, phone: r.customer_phone, partySize: pax, hotel: r.hotel_name });
      if (r.hotel_name) agentGroups[agentKey].hotels.add(r.hotel_name);
    }

    // Convert Sets to arrays for serialization
    Object.values(agentGroups).forEach((g: any) => { g.hotels = Array.from(g.hotels); });

    res.json({
      byHotel: Object.values(hotelGroups),
      byAgent: Object.values(agentGroups),
      hotels: Object.values(hotelGroups),
      agents: Object.values(agentGroups),
    });
  } catch (error) {
    console.error('Error in GET /departures/:id/groups:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
