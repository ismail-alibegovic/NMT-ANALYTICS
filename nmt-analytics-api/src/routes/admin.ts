import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { paginationQuerySchema, getPaginationParams, formatListResponse } from '../utils/pagination';
import { apiError } from "../lib/errors";

const querySchema = z.object({
  ...paginationQuerySchema,
  entity: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const router = Router();
router.use(authenticateToken, requireOrgContext, requireMinimumRole("director"));

/**
 * GET /api/admin/me
 *
 * Dev route to verify org context and user role
 * Returns current user's org and role info
 */
router.get('/me', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', req.orgId!)
      .single();

    if (orgError) return handleSupabaseError(res, orgError, "Failed to fetch organization details");

    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      },
      org: org,
      orgId: req.orgId,
    });
  } catch (error) {
    console.error('Error in /admin/me:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * Example admin-only route to list all organizations
 * Protected for super_admin role
 */
router.get('/orgs', authenticateToken, requireOrgContext, requireMinimumRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('*');

    if (error) return handleSupabaseError(res, error, "Failed to fetch organizations");

    res.json(data);
  } catch (error) {
    console.error('Error in /admin/orgs:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/admin/audit-logs
 * Paginated audit logs for the current organization
 */
router.get('/audit-logs', authenticateToken, requireOrgContext, async (req: any, res: any) => {
  try {
    const validation = querySchema.safeParse(req.query);
    if (!validation.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validation.error.issues);
    }

    const { page, limit, offset } = getPaginationParams(validation.data);
    const { entity, action, orderBy, orderDir, from, to } = validation.data;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId);

    if (entity) query = query.eq('entity', entity);
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error, count } = await query
      .order(orderBy || 'created_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) return handleSupabaseError(res, error, "Failed to fetch audit logs");

    res.json(formatListResponse(data || [], count || 0, page, limit));
  } catch (error) {
    console.error('Error in /admin/audit-logs:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
