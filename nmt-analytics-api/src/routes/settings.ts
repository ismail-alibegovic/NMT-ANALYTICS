import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import { auditSettingsUpdate, logAuditEntry } from '../middleware/auditLogger';
import { apiError } from "../lib/errors";

import { requireMinimumRole } from '../middleware/requireRole';
import { PLAN_TIERS, PLAN_MODULE_MAP, PLAN_LABELS, isPlanTier, type PlanTier, type ModuleKey } from '../lib/planModules';
import {
  AGENCY_CAPABILITIES,
  AGENCY_PROFILES,
  resolveAgencyConfiguration,
} from '../lib/agencyCapabilities';
const router = Router();

const organizationBaseSelect = `
  id,
  name,
  slug,
  phone,
  email,
  address,
  currency,
  created_at
`;

const organizationExtendedSelect = `
  ${organizationBaseSelect},
  timezone,
  tax_id,
  bank_account,
  invoice_footer,
  invoice_notes
`;

function isMissingColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703');
}

// All routes require auth and org context
router.use(authenticateToken);
router.use(requireOrgContext);
router.use(requireMinimumRole('director'));
    router.use(requireMinimumRole('director'));

// Only persisted organization fields belong to this partial mutation contract.
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalEmail = z.union([z.string().trim().email().max(254), z.literal(''), z.null()])
  .optional().transform(value => value === '' ? null : value);
const settingsUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  // Existing generated agency slugs include a UUID suffix.
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  phone: optionalText(30), email: optionalEmail, address: optionalText(500),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  timezone: z.string().trim().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Invalid timezone').optional(),
  tax_id: optionalText(100), bank_account: optionalText(100),
  invoice_footer: optionalText(2000), invoice_notes: optionalText(5000),
  email_sender_name: optionalText(100), email_sender_address: optionalEmail,
  sms_sender_name: optionalText(100), sms_sender_number: optionalText(30),
}).strict();

const agencyProfileSchema = z.object({
  profiles: z.array(z.enum(AGENCY_PROFILES)).min(1).max(AGENCY_PROFILES.length),
  enabledCapabilities: z.array(z.enum(AGENCY_CAPABILITIES)).optional().default([]),
});

// GET /settings - Get organization settings
router.get('/', async (req, res: Response) => {
  const orgId = req.orgId!;

  try {
    const orgResult = await supabaseAdmin
      .from('organizations')
      .select(organizationExtendedSelect)
      .eq('id', orgId)
      .single();
    let org = orgResult.data as any;
    let orgError = orgResult.error;

    if (isMissingColumnError(orgError)) {
      const fallback = await supabaseAdmin
        .from('organizations')
        .select(organizationBaseSelect)
        .eq('id', orgId)
        .single();
      org = fallback.data;
      orgError = fallback.error;
    }

    if (orgError) {
      console.error('[SETTINGS] Error fetching organization:', orgError);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch settings", orgError.message);
    }

    if (!org) {
      return apiError(res, 404, "ORG_NOT_FOUND", "Organization not found");
    }

    // Return with defaults for optional fields
    return res.json({
      ...org,
      logo_url: null,
      phone: org.phone || null,
      email: org.email || null,
      website: null,
      address: org.address || null,
      city: null,
      country: null,
      currency: org.currency || 'BAM',
      timezone: org.timezone || 'Europe/Sarajevo',
      date_format: 'DD.MM.YYYY',
      language: 'bs',
      tax_id: org.tax_id || null,
      bank_account: org.bank_account || null,
      invoice_footer: org.invoice_footer || null,
      invoice_notes: org.invoice_notes || null
    });
  } catch (err) {
    console.error('[SETTINGS] Exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// PATCH /settings - Update organization settings
router.patch('/', auditSettingsUpdate, async (req, res: Response) => {
  const orgId = req.orgId!;
  const userId = req.user?.id;

  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid organization settings', parsed.error.issues);
  }

  // Only allow updating columns that exist
  const allowedUpdates = ['name', 'slug', 'phone', 'email', 'address', 'currency', 'timezone', 'tax_id', 'bank_account', 'invoice_footer', 'invoice_notes', 'email_sender_name', 'email_sender_address', 'sms_sender_name', 'sms_sender_number'];
  const updates: Record<string, unknown> = {};
  
  for (const key of allowedUpdates) {
    if (parsed.data[key as keyof typeof parsed.data] !== undefined) {
      updates[key] = parsed.data[key as keyof typeof parsed.data];
    }
  }

  // Check if there's anything to update
  if (Object.keys(updates).length === 0) {
    return apiError(res, 400, "VALIDATION_ERROR", "No supported organization fields were provided.");
  }

  try {
    // If slug is being updated, check for duplicates
    if (updates.slug) {
      const { data: existing } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('slug', updates.slug)
        .neq('id', orgId)
        .single();

      if (existing) {
        return apiError(res, 409, "CONFLICT", "An organization with this slug already exists");
      }
    }

    // Perform update
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (isMissingColumnError(updateError)) {
      // Never retry a subset: even an empty clear may target a real column in
      // a partially migrated schema. The original UPDATE failed atomically.
      return apiError(res, 409, 'MIGRATION_PENDING', 'Organization settings require a service update. Contact the platform administrator.');
    }

    if (updateError) {
      console.error('[SETTINGS] Update error:', updateError);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to update settings", updateError.message);
    }

    // Log the specific changes
    await logAuditEntry({
      org_id: orgId,
      user_id: userId || 'unknown',
      action: 'UPDATE',
      entity: 'settings',
      entity_id: orgId,
      metadata: { updated_fields: Object.keys(updates) }
    });

    return res.json(updated);
  } catch (err) {
    console.error('[SETTINGS] Exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// GET /settings/modules - Get organization modules
router.get('/agency-profile', async (req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('agency_profiles, enabled_capabilities')
    .eq('id', req.orgId!)
    .single();

  if (isMissingColumnError(error)) {
    return apiError(
      res,
      409,
      'MIGRATION_PENDING',
      'Agency profile fields are not available. Apply migration 20260818010000_agency_profiles_capabilities.sql.',
    );
  }
  if (error) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load agency profile', error.message);
  }

  return res.json(resolveAgencyConfiguration(data?.agency_profiles, data?.enabled_capabilities));
});

router.patch('/agency-profile', async (req, res: Response) => {
  const parsed = agencyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid agency profile');
  }

  const { profiles, enabledCapabilities } = parsed.data;
  const { error } = await supabaseAdmin
    .from('organizations')
    .update({
      agency_profiles: profiles,
      enabled_capabilities: enabledCapabilities,
    })
    .eq('id', req.orgId!);

  if (isMissingColumnError(error)) {
    return apiError(
      res,
      409,
      'MIGRATION_PENDING',
      'Agency profile fields are not available. Apply migration 20260818010000_agency_profiles_capabilities.sql.',
    );
  }
  if (error) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update agency profile', error.message);
  }

  const configuration = resolveAgencyConfiguration(profiles, enabledCapabilities);
  await logAuditEntry({
    org_id: req.orgId!,
    user_id: req.user?.id || 'unknown',
    action: 'UPDATE',
    entity: 'settings',
    entity_id: 'agency-profile',
    metadata: configuration,
  });

  return res.json(configuration);
});

// GET /settings/modules - Get organization modules
router.get('/modules', async (req, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { data: modules, error } = await supabaseAdmin
      .from('org_modules')
      .select('module_key, enabled, settings')
      .eq('org_id', orgId);

    if (error) {
      console.error('[SETTINGS] Error fetching modules:', error);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch modules");
    }

    // Transform to object format for easier frontend use
    const modulesMap = (modules || []).reduce((acc, m) => {
      acc[m.module_key] = {
        enabled: m.enabled,
        settings: m.settings
      };
      return acc;
    }, {} as Record<string, { enabled: boolean; settings: Record<string, unknown> }>);

    return res.json(modulesMap);
  } catch (err) {
    console.error('[SETTINGS] Exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// PATCH /settings/modules/:moduleKey - Update module settings
router.patch('/modules/:moduleKey', async (req, res: Response) => {
  const orgId = req.orgId!;
  const { moduleKey } = req.params;
  const { enabled, settings } = req.body;

  if (typeof enabled !== 'boolean' && !settings) {
    return apiError(res, 400, "VALIDATION_ERROR", "Must provide enabled or settings");
  }

  try {
    const updateData: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') updateData.enabled = enabled;
    if (settings) updateData.settings = settings;

    const { data, error } = await supabaseAdmin
      .from('org_modules')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('module_key', moduleKey)
      .select()
      .single();

    if (error) {
      console.error('[SETTINGS] Module update error:', error);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to update module");
    }

    if (!data) {
      return apiError(res, 404, "NOT_FOUND", "Module not found for this organization");
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: req.user?.id || 'unknown',
      action: 'UPDATE',
      entity: 'settings',
      entity_id: `modules:${moduleKey}`,
      metadata: { module: moduleKey, enabled, settings }
    });

    return res.json(data);
  } catch (err) {
    console.error('[SETTINGS] Exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// GET /settings/branding - Get branding settings (public)
router.get('/branding', async (req, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { data, error } = await supabaseAdmin
      .from('org_branding')
      .select('display_name, logo_url, primary_color, accent_color')
      .eq('org_id', orgId)
      .single();

    if (error) {
      // If no branding row exists yet, return defaults
      if (error.code === 'PGRST116') {
        return res.json({
          display_name: null,
          logo_url: null,
          primary_color: '#1D4ED8',
          accent_color: '#0EA5E9',
        });
      }
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch branding");
    }

    return res.json(data);
  } catch (err) {
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// PATCH /settings/branding - Update org branding (logo, colors, display name)
router.patch('/branding', auditSettingsUpdate, async (req: any, res: Response) => {
  const orgId = req.orgId!;
  const userId = (req.user as any)?.id || '00000000-0000-0000-0000-000000000000';
  const body = req.body || {};

  const schema = z.object({
    display_name: z.string().max(200).nullish(),
    logo_url: z.string().url().max(1024).nullish().or(z.literal('').transform(() => null)),
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullish(),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullish(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(res, 400, "INVALID_INPUT", "Invalid branding input", parsed.error.message);
  }

  const update = {
    ...(parsed.data.display_name !== undefined ? { display_name: parsed.data.display_name } : {}),
    ...(parsed.data.logo_url !== undefined ? { logo_url: parsed.data.logo_url } : {}),
    ...(parsed.data.primary_color !== undefined ? { primary_color: parsed.data.primary_color } : {}),
    ...(parsed.data.accent_color !== undefined ? { accent_color: parsed.data.accent_color } : {}),
    updated_at: new Date().toISOString(),
  };

  try {
    // Upsert — create row if not exists
    const { data, error } = await supabaseAdmin
      .from('org_branding')
      .upsert({ org_id: orgId, ...update }, { onConflict: 'org_id' })
      .select('display_name, logo_url, primary_color, accent_color')
      .single();

    if (error) {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to update branding", error.message);
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: userId,
      action: 'UPDATE',
      entity: 'org_branding' as any,
      entity_id: orgId,
      metadata: { newValues: update },
    });

    return res.json({ ...data, saved: true });
  } catch (err: any) {
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(err));
  }
});

// ============================================================
// Phase 2 — Plan / Tier module gating
// ============================================================
// Routes for reading and updating an organization's subscription plan.
// The plan tier determines which modules the org is entitled to use;
// requireModule() middleware enforces this on gated routes.
//
// Migration 20260715010000 adds the `plan` column to `organizations`.
// Until then, all orgs default to 'trial' and PATCH attempts return 501.
// GET /settings/plan — current plan + entitled modules list + entitlement matrix
// Helpers for /plan routes
function planModuleList(t: PlanTier): ModuleKey[] {
  return Array.from(PLAN_MODULE_MAP[t]);
}

const planSchemaEnum = z.enum(['trial', 'starter', 'pro', 'enterprise'] as const);

// GET /settings/plan — current plan tier + module entitlement matrix
router.get('/plan', requireMinimumRole('director'), async (req, res: Response) => {
  const orgId = req.orgId!;
  try {
    // Defensive: column may be absent until migration applied.
    let plan: PlanTier = 'trial';
    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('id, plan')
      .eq('id', orgId)
      .maybeSingle();

    if (error && !/plan.*column|column.*plan|Could not find the 'plan'/i.test(error.message || '')) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch organization', error.message);
    }
    // Defensive: column may be absent until migration applied.
    const rawPlan = (org as Record<string, unknown> | null)?.plan;
    if (typeof rawPlan === 'string' && isPlanTier(rawPlan)) plan = rawPlan;

    return res.json({
      plan,
      planLabel: PLAN_LABELS[plan],
      entitledModules: planModuleList(plan),
      tiers: PLAN_TIERS.map(t => ({
        key: t,
        label: PLAN_LABELS[t],
        modules: planModuleList(t),
      })),
    });
  } catch (err: any) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch plan', String(err));
  }
});

// PATCH /settings/plan — entitlement assignment is platform-owned, never self-awarded.
const planUpdateSchema = z.object({
  plan: planSchemaEnum,
}).strict();

router.patch('/plan', requireMinimumRole('super_admin'), async (req, res: Response) => {
  const orgId = req.orgId!;
  const userId = req.user?.id || 'unknown';
  try {
    const parsed = planUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid plan value', parsed.error.flatten());
    }
    const newPlan = parsed.data.plan;

    // Try updating the `plan` column. If column doesn't exist yet
    // (migration not applied), return 501 with a clear message.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ plan: newPlan } as Record<string, unknown>)
      .eq('id', orgId)
      .select('id, plan')
      .maybeSingle();

    if (updateError) {
      const msg = updateError.message || '';
      // PGRST / PostgREST error patterns when column missing:
      //   "Could not find the 'plan' column"  (PostgREST schema cache miss)
      //   "column \"plan\" of relation \"organizations\" does not exist" (DB)
      const columnMissing = /plan.*column|column.*plan|Could not find the 'plan'/i.test(msg);
      if (columnMissing) {
        return apiError(
          res,
          501,
          'MIGRATION_PENDING',
          'The organizations.plan column does not exist yet. Apply migration 20260715010000 before changing plans.',
          { migration: '20260715010000_plan_tier_module_gating.sql' }
        );
      }
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update plan', msg);
    }

    if (!updated) return apiError(res, 404, 'ORG_NOT_FOUND', 'Organization not found');

    await logAuditEntry({
      org_id: orgId,
      user_id: userId,
      action: 'UPDATE',
      entity: 'settings',
      entity_id: orgId,
      metadata: { field: 'plan', newValue: newPlan },
    });

    return res.json({
      plan: newPlan,
      planLabel: PLAN_LABELS[newPlan],
      entitledModules: planModuleList(newPlan),
      saved: true,
    });
  } catch (err: any) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

export default router;
