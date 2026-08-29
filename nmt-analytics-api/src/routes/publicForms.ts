import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { getPublicForm, submitPublicForm } from './publicFormsHandlers';

const router = Router();

const FIELD_TYPES = ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'checkbox'] as const;
const ALLOWED_MAP_TO = ['contact_name', 'email', 'phone', 'destination', 'travel_start', 'travel_end', 'travelers', 'budget', 'trip_type'] as const;

const fieldSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'Field id must be snake_case'),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  mapTo: z.enum(ALLOWED_MAP_TO).optional(),
});

const createFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  active: z.boolean().default(true),
  fields: z.array(fieldSchema).default([]),
  thankYouMessage: z.string().max(1000).optional().nullable(),
  packageId: z.string().uuid().optional().nullable(),
  departureId: z.string().uuid().optional().nullable(),
});

const updateFormSchema = createFormSchema.partial();

function validateFieldSet(fields: z.infer<typeof fieldSchema>[]) {
  const ids = new Set<string>();

  for (const field of fields) {
    if (ids.has(field.id)) return 'duplicate_field_id';
    ids.add(field.id);

    if ((field.type === 'select' || field.type === 'multiselect')) {
      const options = (field.options || []).map((option) => option.trim()).filter(Boolean);
      if (options.length === 0) return 'invalid_field_options';
      if (new Set(options).size !== options.length) return 'invalid_field_options';
    }
  }

  return null;
}

function transformForm(row: any) {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description,
    slug: row.slug,
    active: row.active,
    fields: row.fields || [],
    thankYouMessage: row.thank_you_message,
    packageId: row.package_id,
    departureId: row.departure_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformSubmission(row: any) {
  return {
    id: row.id,
    formId: row.form_id,
    inquiryId: row.inquiry_id,
    answers: row.answers,
    submittedAt: row.submitted_at,
  };
}

async function validateContextResources(orgId: string, packageId?: string | null, departureId?: string | null) {
  if (packageId) {
    const { data: pkg, error } = await supabaseAdmin
      .from('packages')
      .select('id')
      .eq('id', packageId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (error || !pkg) return 'invalid_package';
  }
  if (departureId) {
    const { data: dep, error } = await supabaseAdmin
      .from('departures')
      .select('id, package_id')
      .eq('id', departureId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (error || !dep) return 'invalid_departure';
    if (packageId && dep.package_id !== packageId) return 'departure_package_mismatch';
  }
  return null;
}

// ── ADMIN CRUD ──

router.get('/forms', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('public_forms')
    .select('*')
    .eq('org_id', req.orgId!)
    .order('updated_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to load forms');
  return res.json({ data: (data || []).map(transformForm) });
});

router.get('/forms/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('public_forms')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (error) return handleSupabaseError(res, error, 'Form not found');
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Form not found');
  return res.json(transformForm(data));
});

router.post('/forms', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('CREATE', 'public_form'), async (req, res: Response) => {
  const parsed = createFormSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid form', parsed.error.issues);

  const b = parsed.data;
  const fieldErr = validateFieldSet(b.fields);
  if (fieldErr) return apiError(res, 400, 'VALIDATION_ERROR', fieldErr);
  const ctxErr = await validateContextResources(req.orgId!, b.packageId, b.departureId);
  if (ctxErr) return apiError(res, 400, 'VALIDATION_ERROR', ctxErr);

  const { data, error } = await supabaseAdmin
    .from('public_forms')
    .insert({
      org_id: req.orgId!,
      title: b.title,
      description: b.description || null,
      slug: b.slug,
      active: b.active,
      fields: b.fields,
      thank_you_message: b.thankYouMessage || null,
      package_id: b.packageId || null,
      departure_id: b.departureId || null,
      created_by: req.user?.id || null,
    })
    .select('*')
    .single();
  if (error) return handleSupabaseError(res, error, 'Failed to create form');
  return res.status(201).json(transformForm(data));
});

router.patch('/forms/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('UPDATE', 'public_form', (req) => req.params.id), async (req, res: Response) => {
  const parsed = updateFormSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid form update', parsed.error.issues);

  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('public_forms')
    .select('id, package_id, departure_id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (loadErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Form not found');

  const b = parsed.data;
  if (b.fields) {
    const fieldErr = validateFieldSet(b.fields);
    if (fieldErr) return apiError(res, 400, 'VALIDATION_ERROR', fieldErr);
  }
  if (b.packageId !== undefined || b.departureId !== undefined) {
    const effectivePackageId = b.packageId !== undefined ? b.packageId : existing.package_id;
    const effectiveDepartureId = b.departureId !== undefined ? b.departureId : existing.departure_id;
    const ctxErr = await validateContextResources(req.orgId!, effectivePackageId, effectiveDepartureId);
    if (ctxErr) return apiError(res, 400, 'VALIDATION_ERROR', ctxErr);
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', slug: 'slug', active: 'active',
    fields: 'fields', thankYouMessage: 'thank_you_message',
    packageId: 'package_id', departureId: 'departure_id',
  };
  for (const [key, value] of Object.entries(b)) {
    if (value !== undefined) updates[fieldMap[key] || key] = value;
  }

  const { data, error } = await supabaseAdmin
    .from('public_forms')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .select('*')
    .single();
  if (error) return handleSupabaseError(res, error, 'Failed to update form');
  return res.json(transformForm(data));
});

router.delete('/forms/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('DELETE', 'public_form', (req) => req.params.id), async (req, res: Response) => {
  const { error } = await supabaseAdmin
    .from('public_forms')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!);
  if (error) return handleSupabaseError(res, error, 'Failed to delete form');
  return res.json({ ok: true });
});

router.get('/forms/:id/submissions', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data: form } = await supabaseAdmin
    .from('public_forms')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!form) return apiError(res, 404, 'NOT_FOUND', 'Form not found');

  const { data, error } = await supabaseAdmin
    .from('public_form_submissions')
    .select('*')
    .eq('form_id', req.params.id)
    .order('submitted_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to load submissions');
  return res.json({ data: (data || []).map(transformSubmission) });
});

// ── PUBLIC ENDPOINTS ──
// Single authoritative implementation lives in publicFormsHandlers.ts
// (hardened sanitizer: configured field IDs only, server-derived CRM
// mappings, type validation, safe 400s). Delegate — do not duplicate.

router.get('/public/forms/:slug', getPublicForm);

router.post('/public/forms/:slug', submitPublicForm);

export default router;
