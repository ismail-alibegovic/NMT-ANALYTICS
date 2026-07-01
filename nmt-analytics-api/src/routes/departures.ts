import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { auditDepartureCreate, auditDepartureUpdate, auditDepartureDelete } from '../middleware/auditLogger';
import { formatListResponse, paginationQuerySchema, dateRangeQuerySchema, getPaginationParams, getDateRangeParams } from '../utils/pagination';
import { apiError } from "../lib/errors";
import { requireMinimumRole } from '../middleware/requireRole';
import { getDepartureStatus } from '../utils/business';

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

    const { packageId, departAt, returnAt, capacity, booked, status, upsert } = validationResult.data;
    const orgId = req.orgId!;

    const { data: packageData, error: packageError } = await supabaseAdmin
      .from('packages')
      .select('id, name, destination')
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

    const { packageId, departAt, returnAt, capacity, status, booked } = validationResult.data;
    const orgId = req.orgId!;

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

    const { data: departure, error } = await supabaseAdmin
      .from('departures')
      .update({
        package_id: packageId,
        depart_at: departAt,
        return_at: returnAt,
        capacity: capacity,
        status: status,
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

    const { packageId, departAt, returnAt, capacity, status, booked } = validationResult.data;
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
          currency
        )
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !departure) {
      apiError(res, 404, "NOT_FOUND", "Departure not found");
      return;
    }

    res.json(transformDeparture(departure));
  } catch (error) {
    console.error('Error in GET /departures/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
