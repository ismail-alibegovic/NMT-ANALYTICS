import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { getUserContext } from '../lib/auth-helpers';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { config } from '../config';
import { apiError } from "../lib/errors";
import { resolveAgencyConfiguration } from '../lib/agencyCapabilities';

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
      const { data: devOrg } = await supabaseAdmin
        .from('organizations')
        .select('id, name, slug, agency_profiles, enabled_capabilities')
        .eq('id', req.orgId!)
        .single();
      const devAgencyConfiguration = resolveAgencyConfiguration(
        devOrg?.agency_profiles,
        devOrg?.enabled_capabilities,
      );
      const response = {
        user: {
          id: req.user!.id,
          email: req.user!.email
        },
        org: devOrg || { id: req.orgId, name: 'Travline', slug: 'travline' },
        role: req.user!.role || 'director',
        modules: ['dashboard', 'customers', 'packages', 'reservations', 'departures', 'payments', 'transactions', 'analytics', 'integrations', 'travel_core', 'documents', 'accounting'],
        agencyProfiles: devAgencyConfiguration.profiles,
        capabilities: devAgencyConfiguration.capabilities,
        agencyProfileConfigured: devAgencyConfiguration.configured,
      };
      console.log(`[ME/CONTEXT] DEV_BYPASS: User ${req.user!.id} context`);
      return res.json(response);
    }

    // Fetch organization details
    let { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, slug, agency_profiles, enabled_capabilities')
      .eq('id', req.orgId!)
      .single();

    if (orgError) {
      console.warn(`[ME/CONTEXT] Extended agency profile columns unavailable; using legacy context:`, orgError.message);
      const legacyResult = await supabaseAdmin
        .from('organizations')
        .select('id, name, slug')
        .eq('id', req.orgId!)
        .single();
      org = legacyResult.data as typeof org;
      orgError = legacyResult.error;
    }

    if (orgError) {
      console.error(`[ME/CONTEXT] Error fetching org:`, orgError);
    }

    const agencyConfiguration = resolveAgencyConfiguration(
      org && 'agency_profiles' in org ? org.agency_profiles : null,
      org && 'enabled_capabilities' in org ? org.enabled_capabilities : null,
    );

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
      modules,
      agencyProfiles: agencyConfiguration.profiles,
      capabilities: agencyConfiguration.capabilities,
      agencyProfileConfigured: agencyConfiguration.configured,
    };

    console.log(`[ME/CONTEXT] User ${req.user!.id} context: org=${org?.name}, role=${req.user!.role}, modules=${modules.length}`);
    res.json(response);
  } catch (error) {
    console.error('Error in /me/context route:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", error instanceof Error ? error.message : String(error));
  }
});

export default router;
