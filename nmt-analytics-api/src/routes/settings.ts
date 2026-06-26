import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import { auditSettingsUpdate, logAuditEntry } from '../middleware/auditLogger';
import { apiError } from "../lib/errors";

import { requireMinimumRole } from '../middleware/requireRole';
const router = Router();

// All routes require auth and org context
router.use(authenticateToken);
router.use(requireOrgContext);
router.use(requireMinimumRole('director'));
    router.use(requireMinimumRole('director'));

// Validation schema for settings update
const settingsUpdateSchema = z.object({
  // Organization settings
  name: z.string().min(1, 'Name is required').max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  logo_url: z.string().url().optional().nullable(),
  
  // Contact settings
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  
  // Regional settings
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  date_format: z.string().optional(),
  language: z.string().length(2).optional(),
  
  // Notification settings
  email_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
  
  // Business settings
  business_hours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  }).optional(),
  
  working_days: z.array(z.number().min(0).max(6)).optional(),
  
  // Payment settings
  payment_deadline_days: z.number().min(0).max(365).optional(),
  late_fee_percentage: z.number().min(0).max(100).optional(),
  
  // Custom settings (flexible JSON)
  custom_settings: z.record(z.string(), z.unknown()).optional(),
});

// GET /settings - Get organization settings
router.get('/', async (req, res: Response) => {
  const orgId = req.orgId!;

  try {
    // Fetch organization details with extended columns
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        phone,
        email,
        address,
        currency,
        timezone,
        created_at
      `)
      .eq('id', orgId)
      .single();

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
      language: 'bs'
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

  // Only allow updating columns that exist
  const allowedUpdates = ['name', 'slug', 'phone', 'email', 'address', 'currency', 'timezone'];
  const updates: Record<string, unknown> = {};
  
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  // Check if there's anything to update
  if (Object.keys(updates).length === 0) {
    return apiError(res, 400, "VALIDATION_ERROR", "No valid fields to update. Only name and slug are supported.");
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
      entity: 'integration',
      entity_id: moduleKey,
      metadata: { enabled, settings }
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
      .from('organizations')
      .select('name, logo_url, primary_color, secondary_color')
      .eq('id', orgId)
      .single();

    if (error) {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch branding");
    }

    return res.json(data);
  } catch (err) {
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
