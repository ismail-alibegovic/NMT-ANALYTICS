import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { auditPackageCreate, auditPackageUpdate, auditPackageDelete } from '../middleware/auditLogger';
import { createSuccessResponse } from '../middleware/logging';
import { formatListResponse, paginationQuerySchema, dateRangeQuerySchema, getPaginationParams, getDateRangeParams } from '../utils/pagination';
import { apiError } from "../lib/errors";
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const transportTypeSchema = z.enum(['flight', 'bus', 'none']);
const variantTierSchema = z.enum(['deluxe', 'delux', 'standard', 'premium', 'custom']);
export function normalizePackageVariantInput(variant: {
  id?: string | null;
  name: string;
  tier?: 'deluxe' | 'delux' | 'standard' | 'premium' | 'custom' | null;
  accommodation?: string | null;
  priceModifier?: number | null;
  price?: number | null;
  price_delta?: number | null;
  capacity?: number | null;
  currency?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
}) {
  return {
    ...(variant.id ? { id: variant.id } : {}),
    name: variant.name,
    tier: variant.tier === 'delux' ? 'deluxe' : (variant.tier ?? null),
    accommodation: variant.accommodation ?? variant.hotelName ?? null,
    priceModifier: variant.priceModifier ?? variant.price_delta ?? variant.price ?? null,
    capacity: variant.capacity ?? null,
    currency: variant.currency ?? null,
    hotelName: variant.hotelName ?? null,
    roomType: variant.roomType ?? null,
  };
}

const packageVariantSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  name: z.string().min(1, 'Variant name is required'),
  tier: variantTierSchema.optional().nullable(),
  accommodation: z.string().optional().nullable(),
  priceModifier: z.number().optional().nullable(),
  price: z.number().optional().nullable(),
  price_delta: z.number().optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  hotelName: z.string().optional().nullable(),
  roomType: z.string().optional().nullable(),
}).transform(normalizePackageVariantInput);

export function buildPackageUpdateData(validated: Record<string, any>) {
  const updateData: any = {};

  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.destination !== undefined) updateData.destination = validated.destination;
  if (validated.price !== undefined) updateData.base_price = validated.price;
  if (validated.currency !== undefined) updateData.currency = validated.currency;
  if (validated.active !== undefined) updateData.is_active = validated.active;
  if (validated.description !== undefined) updateData.description = validated.description;
  if (validated.durationDays !== undefined) updateData.duration_days = validated.durationDays;
  if (validated.maxParticipants !== undefined) updateData.max_participants = validated.maxParticipants;
  if (validated.startDate !== undefined) updateData.start_date = validated.startDate;
  if (validated.endDate !== undefined) updateData.end_date = validated.endDate;
  if (validated.transportType !== undefined) updateData.transport_type = validated.transportType;
  if (validated.tripType !== undefined) updateData.trip_type = validated.tripType;
  if (validated.tags !== undefined) updateData.tags = validated.tags;
  if (validated.transportCapacity !== undefined) updateData.transport_capacity = validated.transportCapacity;
  if (validated.variants !== undefined) updateData.variants = validated.variants;

  return updateData;
}

const getPackagesQuerySchema = z.object({
  search: z.string().optional(),
  ...paginationQuerySchema,
  ...dateRangeQuerySchema,
}).transform(data => ({
  ...data,
  ...getPaginationParams(data),
  ...getDateRangeParams(data),
}));

const createPackageSchema = z.object({
  itineraryId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Name is required'),
  destination: z.string().min(1, 'Destination is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: z.string().default('BAM'),
  active: z.boolean().default(true),
  description: z.string().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  // Transport (ukomponovano: how the group travels — plane vs. bus)
  transportType: transportTypeSchema.optional().nullable(),
  tripType: z.enum(['beach', 'city', 'pilgrimage', 'honeymoon', 'ski', 'adventure', 'cruise', 'cultural', 'wellness', 'other']).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  transportCapacity: z.number().int().min(0).optional().nullable(),
  variants: z.array(packageVariantSchema).optional().nullable(),
});

const updatePackageSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  destination: z.string().min(1, 'Destination is required').optional(),
  price: z.number().min(0, 'Price must be non-negative').optional(),
  currency: z.string().optional(),
  active: z.boolean().optional(),
  description: z.string().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  transportType: transportTypeSchema.optional().nullable(),
  tripType: z.enum(['beach', 'city', 'pilgrimage', 'honeymoon', 'ski', 'adventure', 'cruise', 'cultural', 'wellness', 'other']).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  transportCapacity: z.number().int().min(0).optional().nullable(),
  variants: z.array(packageVariantSchema).optional().nullable(),
});

/**
 * GET /api/packages
 */
router.get('/packages', authenticateToken, requireOrgContext, async (req: any, res: Response, next) => {
  try {
    const validationResult = getPackagesQuerySchema.safeParse(req.query);

    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error");
    }

    const { search, page, limit, offset, from, to, orderBy, orderDir } = validationResult.data;
    const orgId = req.orgId!;

    // Build query
    let query = supabaseAdmin
      .from('packages')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,destination.ilike.%${searchTerm}%`);
    }

    // Add date filters if provided
    if (from) {
      query = query.gte('created_at', `${from}T00:00:00Z`);
    }
    if (to) {
      query = query.lte('created_at', `${to}T23:59:59Z`);
    }

    const { data: packages, error, count } = await query;

    if (error) throw error;

    return res.json(formatListResponse(packages || [], count || 0, page, limit));

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/packages
 */
router.post('/packages', authenticateToken, requireOrgContext, auditPackageCreate, async (req: any, res: Response, next) => {
  try {
    const validationResult = createPackageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation failed", validationResult.error.issues);
    }

    const validated = validationResult.data;
    const orgId = req.orgId!;

    if (validated.itineraryId) {
      const { data: itinerary, error: itineraryErr } = await supabaseAdmin
        .from('itineraries')
        .select('id')
        .eq('id', validated.itineraryId)
        .eq('org_id', orgId)
        .single();
      if (itineraryErr || !itinerary) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Itinerary not found or belongs to a different organization');
      }
    }

    const { data: packageData, error } = await supabaseAdmin
      .from('packages')
      .insert({
        org_id: orgId,
        name: validated.name,
        destination: validated.destination,
        base_price: validated.price,
        currency: validated.currency,
        is_active: validated.active,
        description: validated.description,
        duration_days: validated.durationDays,
        max_participants: validated.maxParticipants,
        start_date: validated.startDate,
        end_date: validated.endDate,
        transport_type: validated.transportType ?? null,
        transport_capacity: validated.transportCapacity ?? null,
        variants: validated.variants ?? null,
        trip_type: validated.tripType ?? null,
        tags: validated.tags ?? null,
        itinerary_id: validated.itineraryId ?? null,
      })
      .select()
      .single();

    if (error) return handleSupabaseError(res, error, "Failed to create package");

    if (validated.itineraryId && packageData) {
      const { data: versions } = await supabaseAdmin
        .from('itinerary_versions')
        .select('id')
        .eq('itinerary_id', validated.itineraryId)
        .eq('org_id', orgId)
        .order('version_number', { ascending: false });
      const currentVersion = (versions || [])[0];
      if (currentVersion) {
        const { data: items } = await supabaseAdmin
          .from('itinerary_items')
          .select('*')
          .eq('itinerary_version_id', currentVersion.id)
          .eq('org_id', orgId);
        const serviceRows = (items || [])
          .filter((item: any) => item.supplier_service_id)
          .map((item: any) => ({
            package_id: packageData.id,
            org_id: orgId,
            service_type: item.category || 'service',
            provider_name: item.title,
            quantity: item.quantity ?? 1,
            unit_price: item.net_unit_price ?? 0,
            currency: item.currency || validated.currency || 'BAM',
            description: item.description || null,
          }));
        if (serviceRows.length > 0) {
          await supabaseAdmin.from('package_services').insert(serviceRows);
        }
      }
    }

    return res.status(201).json(packageData);

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/packages/:id
 */
router.put('/packages/:id', authenticateToken, requireOrgContext, auditPackageUpdate, async (req: any, res: Response, next) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const validationResult = updatePackageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
    }

    const validated = validationResult.data;

    const { data: packageData, error } = await supabaseAdmin
      .from('packages')
      .update({
        name: validated.name,
        destination: validated.destination,
        base_price: validated.price,
        currency: validated.currency,
        is_active: validated.active,
        description: validated.description,
        duration_days: validated.durationDays,
        max_participants: validated.maxParticipants,
        start_date: validated.startDate,
        end_date: validated.endDate,
        transport_type: validated.transportType,
        transport_capacity: validated.transportCapacity,
        variants: validated.variants,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return handleSupabaseError(res, error, "Failed to update package");

    return res.json(packageData);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/packages/:id
 */
router.patch('/packages/:id', authenticateToken, requireOrgContext, auditPackageUpdate, async (req: any, res: Response, next) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const validationResult = updatePackageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
    }

    const validated = validationResult.data;
    const updateData = buildPackageUpdateData(validated);

    const { data: packageData, error } = await supabaseAdmin
      .from('packages')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return handleSupabaseError(res, error, "Failed to update package");

    return res.json(packageData);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/packages/:id
 */
router.delete('/packages/:id', authenticateToken, requireOrgContext, auditPackageDelete, async (req: any, res: Response, next) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Soft delete by setting is_active = false
    const { error } = await supabaseAdmin
      .from('packages')
      .update({ is_active: false })
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) return handleSupabaseError(res, error, "Failed to delete package");

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/packages/export
 */
router.get('/packages/export', authenticateToken, requireOrgContext, async (req: any, res: Response) => {
  try {
    const validationResult = getPackagesQuerySchema.safeParse(req.query);

    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
      return;
    }

    const { orderBy, orderDir } = validationResult.data;
    const orgId = req.orgId!;

    // Build query (get all matching records, not paginated)
    const { data: packages, error } = await supabaseAdmin
      .from('packages')
      .select('*')
      .eq('org_id', orgId)
      .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' });

    if (error) return handleSupabaseError(res, error, "Failed to export packages");

    // Convert to CSV
    const csvHeaders = ['name', 'destination', 'basePrice', 'currency', 'isActive', 'description', 'durationDays', 'maxParticipants', 'startDate', 'endDate', 'createdAt'];
    const csvRows = (packages || []).map(pkg => [
      pkg.name,
      pkg.destination,
      pkg.base_price,
      pkg.currency,
      pkg.is_active,
      pkg.description || '',
      pkg.duration_days || '',
      pkg.max_participants || '',
      pkg.start_date || '',
      pkg.end_date || '',
      pkg.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="packages.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /packages/export:', error);
    apiError(res, 500, "EXPORT_ERROR", "Failed to export data", String(error));
  }
});

router.get('/packages/:id', authenticateToken, requireOrgContext, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from('packages')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (pkgErr || !pkg) {
      apiError(res, 404, 'NOT_FOUND', 'Package not found', 'The specified package does not exist or does not belong to your organization');
      return;
    }

    const [servicesRes, hotelsRes, departuresRes] = await Promise.all([
      supabaseAdmin.from('package_services').select('*').eq('package_id', id).eq('org_id', orgId),
      supabaseAdmin.from('package_hotels').select('*, hotels!inner(id, name)').eq('package_id', id).eq('org_id', orgId),
      supabaseAdmin.from('departures').select('id, depart_at, return_at, status, capacity, booked, transport_type').eq('package_id', id).eq('org_id', orgId).limit(100),
    ]);

    res.json(createSuccessResponse({
      ...pkg,
      package_services: servicesRes.data || [],
      hotels: hotelsRes.data?.map((h: any) => ({ ...h, hotel_name: h.hotels?.name })) || [],
      departures: departuresRes.data || [],
    }, 'Package retrieved successfully'));
  } catch (error) {
    console.error('Error in GET /packages/:id:', error);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(error));
  }
});

export default router;
