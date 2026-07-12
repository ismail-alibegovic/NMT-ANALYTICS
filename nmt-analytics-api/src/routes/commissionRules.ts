import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { auditLog } from '../middleware/auditLogger';
import { requireMinimumRole } from '../middleware/requireRole';
import {
  formatListResponse,
  paginationQuerySchema,
  getPaginationParams,
} from '../utils/pagination';

const router = Router();

const auditRuleCreate = auditLog('CREATE', 'commission_rule', undefined, (req) => `${(req.body as any)?.partner_type}/${(req.body as any)?.service_type ?? '*'}`);
const auditRuleUpdate = auditLog('UPDATE', 'commission_rule', (req) => req.params.id);

const PARTNER_TYPES = ['bronze', 'silver', 'gold', 'platinum'] as const;
const SERVICE_TYPES = ['hotel', 'transport', 'tour', 'insurance', 'extra'] as const;

const ruleSchema = z.object({
  partnerType: z.enum(PARTNER_TYPES),
  serviceType: z.enum(SERVICE_TYPES).nullable().optional(),
  commissionPct: z.number().min(0).max(100, 'Commission must be 0–100'),
  markupPct: z.number().min(0).max(100),
  isActive: z.boolean(),
  priority: z.number().int().min(0).max(1000),
});

// Create form fills sensible defaults; update uses truly-partial fields.
const createSchema = ruleSchema.extend({
  markupPct: z.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
});

const updateSchema = ruleSchema.partial();

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    partnerType: z.enum(PARTNER_TYPES).optional(),
    serviceType: z.enum(SERVICE_TYPES).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

function transformRule(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    partnerType: r.partner_type,
    serviceType: r.service_type,
    commissionPct: Number(r.commission_pct),
    markupPct: Number(r.markup_pct),
    isActive: r.is_active,
    priority: r.priority,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** GET /api/commission-rules */
router.get('/commission-rules', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const { page, limit, partnerType, serviceType, isActive } = r.data;
    const orgId = req.orgId!;

    let q = supabaseAdmin
      .from('commission_rules')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (partnerType) q = q.eq('partner_type', partnerType);
    if (serviceType) q = q.eq('service_type', serviceType);
    if (isActive === 'true') q = q.eq('is_active', true);
    if (isActive === 'false') q = q.eq('is_active', false);

    const { data, count, error } = await q;
    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch commission rules', error.message);

    res.json(formatListResponse((data || []).map(transformRule), page, limit, count || 0));
  } catch (err) {
    console.error('Error in GET /commission-rules:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

/** GET /api/commission-rules/preview — compute effective commission & markup for a booking scenario */
router.get('/commission-rules/preview', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const params = z
      .object({
        partnerType: z.enum(PARTNER_TYPES),
        bookingAmount: z.coerce.number().min(0),
        serviceType: z.enum(SERVICE_TYPES).optional(),
      })
      .parse(req.query);

    const orgId = req.orgId!;

    // Match candidate: most specific first (service_type matches), fallback to global (service_type IS NULL).
    let q = supabaseAdmin
      .from('commission_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('partner_type', params.partnerType)
      .eq('is_active', true)
      .order('service_type', { ascending: false, nullsFirst: false }) // NULLordered after populated rows
      .order('priority', { ascending: true })
      .limit(20);

    if (params.serviceType) {
      q = q.or(`service_type.is.null,service_type.eq.${params.serviceType}`);
    } else {
      q = q.is('service_type', null);
    }

    const { data: rules, error } = await q;
    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch rules', error.message);

    // Most specific match wins: rule whose service_type equals the requested service_type;
    // if none, fall back to the first rule with NULL service_type.
    const matched =
      (rules || []).find((r) => r.service_type === params.serviceType) ||
      (rules || []).find((r) => r.service_type === null) ||
      (rules || []).find((r) => params.serviceType === undefined && r.service_type === null) ||
      null;

    if (!matched) {
      return res.json({ matchedRule: null, commissionAmount: 0, markupAmount: 0, finalAmount: params.bookingAmount, breakdown: null });
    }

    const commission = (params.bookingAmount * Number(matched.commission_pct)) / 100;
    const markup = (params.bookingAmount * Number(matched.markup_pct)) / 100;
    const finalAmount = params.bookingAmount + markup;

    res.json({
      matchedRule: transformRule(matched),
      commissionAmount: Math.round(commission * 100) / 100,
      markupAmount: Math.round(markup * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
      breakdown: {
        partnerType: matched.partner_type,
        serviceType: matched.service_type,
        commissionPct: Number(matched.commission_pct),
        markupPct: Number(matched.markup_pct),
      },
    });
  } catch (err) {
    console.error('Error in GET /commission-rules/preview:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

/** POST /api/commission-rules */
router.post('/commission-rules', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditRuleCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: rule, error } = await supabaseAdmin
      .from('commission_rules')
      .insert({
        org_id: orgId,
        partner_type: r.data.partnerType,
        service_type: r.data.serviceType ?? null,
        commission_pct: r.data.commissionPct,
        markup_pct: r.data.markupPct,
        is_active: r.data.isActive,
        priority: r.data.priority,
      })
      .select()
      .single();

    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create commission rule', error.message);
    res.status(201).json(transformRule(rule));
  } catch (err) {
    console.error('Error in POST /commission-rules:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

/** PATCH /api/commission-rules/:id */
router.patch('/commission-rules/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditRuleUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const r = updateSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('commission_rules')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Commission rule not found');

    const updates: Record<string, any> = {};
    const d = r.data;
    if (d.partnerType !== undefined) updates.partner_type = d.partnerType;
    if (d.serviceType !== undefined) updates.service_type = d.serviceType ?? null;
    if (d.commissionPct !== undefined) updates.commission_pct = d.commissionPct;
    if (d.markupPct !== undefined) updates.markup_pct = d.markupPct;
    if (d.isActive !== undefined) updates.is_active = d.isActive;
    if (d.priority !== undefined) updates.priority = d.priority;

    const { data: updated, error } = await supabaseAdmin
      .from('commission_rules')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update commission rule', error.message);
    res.json(transformRule(updated));
  } catch (err) {
    console.error('Error in PATCH /commission-rules/:id:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

/** DELETE /api/commission-rules/:id */
router.delete('/commission-rules/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('commission_rules').delete().eq('id', id).eq('org_id', orgId);
    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to delete commission rule', error.message);
    res.status(204).end();
  } catch (err) {
    console.error('Error in DELETE /commission-rules/:id:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

export default router;
