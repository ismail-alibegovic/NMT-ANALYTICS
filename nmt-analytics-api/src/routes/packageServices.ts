import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { auditLog } from '../middleware/auditLogger';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const auditServiceCreate = auditLog('CREATE', 'package_service', undefined, (req) => (req.body as any)?.serviceType);
const auditServiceUpdate = auditLog('UPDATE', 'package_service', (req) => req.params.id);

const listQuerySchema = z.object({
  packageId: z.string().uuid().optional(),
  ...z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(25),
    orderBy: z.string().optional().default('created_at'),
    orderDir: z.enum(['asc', 'desc']).optional().default('asc'),
  }).shape,
});

const createSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
  serviceType: z.enum(['hotel', 'transport', 'tour', 'insurance', 'extra']),
  providerName: z.string().optional(),
  providerContact: z.string().optional(),
  unitPrice: z.number().min(0).default(0),
  currency: z.string().default('BAM'),
  quantity: z.number().int().min(1).default(1),
  description: z.string().optional(),
  isOptional: z.boolean().default(false),
});

const updateSchema = z.object({
  serviceType: z.enum(['hotel', 'transport', 'tour', 'insurance', 'extra']).optional(),
  providerName: z.string().optional(),
  providerContact: z.string().optional(),
  unitPrice: z.number().min(0).optional(),
  currency: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
  description: z.string().optional(),
  isOptional: z.boolean().optional(),
});

function transformService(s: any) {
  const total = Number(s.unit_price || 0) * Number(s.quantity || 1);
  return {
    id: s.id,
    packageId: s.package_id,
    serviceType: s.service_type,
    providerName: s.provider_name,
    providerContact: s.provider_contact,
    unitPrice: Number(s.unit_price || 0),
    currency: s.currency || 'BAM',
    quantity: Number(s.quantity || 1),
    totalPrice: total,
    description: s.description,
    isOptional: s.is_optional,
    createdAt: s.created_at,
  };
}

/** GET /api/package-services */
router.get('/package-services', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { packageId, page, limit, orderBy, orderDir } = r.data;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('package_services')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order(orderBy || 'created_at', { ascending: orderDir === 'desc' })
      .range(offset, offset + limit - 1);

    if (packageId) query = query.eq('package_id', packageId);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({
      data: (data || []).map(transformService),
      total: count || 0,
      page,
      limit,
    });
  } catch (err) { next(err); }
});

/** POST /api/package-services */
router.post('/package-services', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditServiceCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;

    // Verify package belongs to org
    const { data: pkg } = await supabaseAdmin.from('packages').select('id').eq('id', r.data.packageId).eq('org_id', orgId).single();
    if (!pkg) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

    const { data: service, error: err } = await supabaseAdmin
      .from('package_services')
      .insert({
        org_id: orgId,
        package_id: r.data.packageId,
        service_type: r.data.serviceType,
        provider_name: r.data.providerName,
        provider_contact: r.data.providerContact,
        unit_price: r.data.unitPrice,
        currency: r.data.currency,
        quantity: r.data.quantity,
        description: r.data.description,
        is_optional: r.data.isOptional,
      })
      .select()
      .single();

    if (err) return handleSupabaseError(res, err, 'Failed to create package service');
    return res.status(201).json(transformService(service));
  } catch (err) { console.error('Error in POST /package-services:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** PATCH /api/package-services/:id */
router.patch('/package-services/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditServiceUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const r = updateSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('package_services').select('*').eq('id', id).eq('org_id', orgId).single();
    if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Package service not found');

    const updates: Record<string, unknown> = {};
    if (r.data.serviceType !== undefined) updates.service_type = r.data.serviceType;
    if (r.data.providerName !== undefined) updates.provider_name = r.data.providerName;
    if (r.data.providerContact !== undefined) updates.provider_contact = r.data.providerContact;
    if (r.data.unitPrice !== undefined) updates.unit_price = r.data.unitPrice;
    if (r.data.currency !== undefined) updates.currency = r.data.currency;
    if (r.data.quantity !== undefined) updates.quantity = r.data.quantity;
    if (r.data.description !== undefined) updates.description = r.data.description;
    if (r.data.isOptional !== undefined) updates.is_optional = r.data.isOptional;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('package_services').update(updates).eq('id', id).eq('org_id', orgId).select().single();
    if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update package service');

    return res.json(transformService(updated));
  } catch (err) { console.error('Error in PATCH /package-services/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** DELETE /api/package-services/:id */
router.delete('/package-services/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('package_services').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete package service');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /package-services/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

export default router;
