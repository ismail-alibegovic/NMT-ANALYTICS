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
      })
      .select()
      .single();

    if (error) return handleSupabaseError(res, error, "Failed to create package");

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

export default router;
