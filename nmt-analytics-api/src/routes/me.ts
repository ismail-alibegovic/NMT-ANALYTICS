import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { getUserContext } from '../lib/auth-helpers';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { config } from '../config';
import { apiError } from "../lib/errors";

const router = Router();

/**
 * GET /me
 *
 * Returns authenticated user's basic info and organization ID.
 */
router.get('/me', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    // In DEV_BYPASS_AUTH mode, return context directly from request
    if (config.DEV_BYPASS_AUTH) {
      const response = {
        user: {
          id: req.user!.id,
          email: req.user!.email,
        },
        org_id: req.orgId,
      };
      console.log(`[ME] DEV_BYPASS: User ${req.user!.id} authenticated for org ${req.orgId}`);
      return res.json(response);
    }

    const userContext = await getUserContext(req.user!.id, req.user!.email!);

    const response = {
      user: {
        id: req.user!.id,
        email: userContext.email,
      },
      org_id: userContext.orgId,
    };

    console.log(`[ME] User ${req.user!.id} authenticated for org ${userContext.orgId}`);
    res.json(response);
  } catch (error) {
    console.error('Error in /me route:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

/**
 * GET /me/context
 *
 * Returns authenticated user's context including user info and profile.
 */
router.get('/me/context', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    // In DEV_BYPASS_AUTH mode, return simplified context
    if (config.DEV_BYPASS_AUTH) {
      const response = {
        user: {
          id: req.user!.id,
          email: req.user!.email
        },
        org: { id: req.orgId, name: 'Travline', slug: 'nmt-analytics' },
        role: req.user!.role || 'director',
        modules: ['dashboard', 'customers', 'packages', 'reservations', 'departures', 'payments', 'transactions', 'analytics', 'integrations']
      };
      console.log(`[ME/CONTEXT] DEV_BYPASS: User ${req.user!.id} context`);
      return res.json(response);
    }

    // Fetch organization details
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, slug')
      .eq('id', req.orgId!)
      .single();

    if (orgError) {
      console.error(`[ME/CONTEXT] Error fetching org:`, orgError);
    }

    // Fetch enabled modules
    const { data: orgModules, error: modulesError } = await supabaseAdmin
      .from('org_modules')
      .select('module_key')
      .eq('org_id', req.orgId!)
      .eq('enabled', true);

    if (modulesError) {
      console.warn(`[ME/CONTEXT] Error fetching modules:`, modulesError);
    }

    const modules = (orgModules || []).map(m => m.module_key);

    const response = {
      user: {
        id: req.user!.id,
        email: req.user!.email
      },
      org: org || { id: req.orgId, name: 'Unknown', slug: 'unknown' },
      role: req.user!.role || 'viewer',
      modules
    };

    console.log(`[ME/CONTEXT] User ${req.user!.id} context: org=${org?.name}, role=${req.user!.role}, modules=${modules.length}`);
    res.json(response);
  } catch (error) {
    console.error('Error in /me/context route:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", error instanceof Error ? error.message : String(error));
  }
});

export default router;
