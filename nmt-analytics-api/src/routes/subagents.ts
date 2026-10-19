import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { auditLog } from '../middleware/auditLogger';
import {
  formatListResponse,
  paginationQuerySchema,
  getPaginationParams,
} from '../utils/pagination';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const auditSubAgentCreate = auditLog('CREATE', 'sub_agent', undefined, (req) => (req.body as any)?.name);
const auditSubAgentUpdate = auditLog('UPDATE', 'sub_agent', (req) => req.params.id);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    minRole: z.enum(['manager']).optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().email().optional()),
  commissionRate: z.number().min(0).max(100).default(0),
  partnerType: z.enum(['bronze', 'silver', 'gold', 'platinum']).default('bronze'),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  partnerType: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  isActive: z.boolean().optional(),
});

function transformSubAgent(s: any) {
  return {
    id: s.id,
    orgId: s.org_id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    commissionRate: Number(s.commission_rate || 0),
    partnerType: s.partner_type || 'bronze',
    portalTokenExpiresAt: s.portal_token_expires_at || null,
    portalLastSeenAt: s.portal_last_seen_at || null,
    isActive: s.is_active,
    createdAt: s.created_at,
    sales: s.sub_agent_sales || s.sales,
  };
}

/** GET /api/subagents */
router.get('/subagents', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data, error, count } = await supabaseAdmin
      .from('sub_agents')
      .select('*, sub_agent_sales(*)', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(0, 99);
    if (error) throw error;

    return res.json(formatListResponse((data || []).map(transformSubAgent), count || 0, 1, 100));
  } catch (err) { next(err); }
});

/** POST /api/subagents */
router.post('/subagents', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditSubAgentCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: agent, error: err } = await supabaseAdmin
      .from('sub_agents')
      .insert({
        org_id: orgId,
        name: r.data.name,
        phone: r.data.phone,
        email: r.data.email,
        commission_rate: r.data.commissionRate,
        partner_type: r.data.partnerType,
        is_active: true,
      })
      .select()
      .single();
    if (err) return handleSupabaseError(res, err, 'Failed to create sub-agent');

    return res.status(201).json(transformSubAgent(agent));
  } catch (err) { console.error('Error in POST /subagents:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** PATCH /api/subagents/:id */
router.patch('/subagents/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditSubAgentUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const r = updateSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('sub_agents').select('*').eq('id', id).eq('org_id', orgId).single();
    if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Sub-agent not found');

    const updates: Record<string, unknown> = {};
    if (r.data.name !== undefined) updates.name = r.data.name;
    if (r.data.phone !== undefined) updates.phone = r.data.phone;
    if (r.data.email !== undefined) updates.email = r.data.email;
    if (r.data.commissionRate !== undefined) updates.commission_rate = r.data.commissionRate;
    if (r.data.partnerType !== undefined) updates.partner_type = r.data.partnerType;
    if (r.data.isActive !== undefined) updates.is_active = r.data.isActive;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('sub_agents').update(updates).eq('id', id).eq('org_id', orgId).select().single();
    if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update sub-agent');

    return res.json(transformSubAgent(updated));
  } catch (err) { console.error('Error in PATCH /subagents/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** DELETE /api/subagents/:id */
router.delete('/subagents/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('sub_agents').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete sub-agent');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /subagents/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** POST /api/subagents/:id/generate-sale
 * Retired for the pilot. Sales must use the canonical reservation/payment workflows.
 */
router.post('/subagents/:id/generate-sale', authenticateToken, requireOrgContext, requireMinimumRole('director'), (_req, res: Response) => {
  return apiError(res, 410, 'LEGACY_SALE_DISABLED', 'Legacy sub-agent sale generation is disabled; use the reservation workflow');
});
export default router;
