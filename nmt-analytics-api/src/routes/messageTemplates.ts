import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { validatePlaceholders } from '../lib/templatePlaceholders';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TEMPLATE_SELECT = 'id, org_id, name, channel, subject, body, is_active, created_at, updated_at';

const listQuerySchema = z.object({
  channel: z.enum(['email', 'sms']).optional(),
  activeOnly: z.coerce.boolean().optional().default(false),
  search: z.string().trim().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(['email', 'sms']),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000),
  is_active: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.channel === 'email' && !value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Email templates require a subject' });
  }
  if (value.channel === 'sms' && value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'SMS templates do not support a subject' });
  }
  if (value.channel === 'sms' && value.body.length > 320) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'SMS templates must be 320 characters or less' });
  }

  const unsupported = validatePlaceholders(value.body, value.subject);
  if (unsupported.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['body'],
      message: `Unsupported placeholders: ${unsupported.join(', ')}`,
    });
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  channel: z.enum(['email', 'sms']).optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  is_active: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const nextChannel = value.channel;
  if (nextChannel === 'email' && value.subject !== undefined && !value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Email templates require a subject' });
  }
  if (nextChannel === 'sms' && value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'SMS templates do not support a subject' });
  }
  if (nextChannel === 'sms' && value.body && value.body.length > 320) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'SMS templates must be 320 characters or less' });
  }

  if (value.body) {
    const unsupported = validatePlaceholders(value.body, value.subject);
    if (unsupported.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: `Unsupported placeholders: ${unsupported.join(', ')}`,
      });
    }
  }
});

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

router.use(authenticateToken, requireOrgContext, requireMinimumRole('director'));

router.get('/message-templates', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid template filters', parsed.error.issues);
  }

  const orgId = req.orgId!;
  let query = supabaseAdmin
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.activeOnly) query = query.eq('is_active', true);
  if (parsed.data.search) {
    query = query.ilike('name', `%${parsed.data.search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch message templates', error.message);
  }

  return res.json({ data: data || [] });
});

router.get('/message-templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid template ID format');
  }

  const orgId = req.orgId!;
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) {
    return apiError(res, 404, 'NOT_FOUND', 'Message template not found');
  }

  return res.json(data);
});

router.post('/message-templates', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid template payload', parsed.error.issues);
  }

  const orgId = req.orgId!;
  const payload = {
    org_id: orgId,
    name: parsed.data.name,
    channel: parsed.data.channel,
    subject: parsed.data.channel === 'email' ? (parsed.data.subject?.trim() || null) : null,
    body: parsed.data.body,
    is_active: parsed.data.is_active ?? true,
  };

  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .insert(payload)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    return apiError(res, 500, 'CREATE_FAILED', 'Failed to create message template', error.message);
  }

  return res.status(201).json(data);
});

router.patch('/message-templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid template ID format');
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid template payload', parsed.error.issues);
  }

  const orgId = req.orgId!;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('message_templates')
    .select('id, org_id, channel, subject')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Message template not found');
  }

  const nextChannel = parsed.data.channel || existing.channel;
  const nextSubject = parsed.data.subject !== undefined ? parsed.data.subject : existing.subject;
  if (nextChannel === 'email' && !nextSubject?.trim()) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Email templates require a subject');
  }
  if (nextChannel === 'sms' && nextSubject?.trim()) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'SMS templates do not support a subject');
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
  if (parsed.data.subject !== undefined || nextChannel === 'sms') {
    updates.subject = nextChannel === 'email' ? (nextSubject?.trim() || null) : null;
  }

  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to update message template', error.message);
  }

  return res.json(data);
});

router.delete('/message-templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid template ID format');
  }

  const orgId = req.orgId!;

  const { error } = await supabaseAdmin
    .from('message_templates')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) {
    return apiError(res, 500, 'DELETE_FAILED', 'Failed to delete message template', error.message);
  }

  return res.json({ success: true });
});

router.post('/message-templates/:id/duplicate', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid template ID format');
  }

  const orgId = req.orgId!;

  const { data: source, error: sourceError } = await supabaseAdmin
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (sourceError || !source) {
    return apiError(res, 404, 'NOT_FOUND', 'Message template not found');
  }

  const payload = {
    org_id: orgId,
    name: `${source.name} (copy)`,
    channel: source.channel,
    subject: source.subject,
    body: source.body,
    is_active: true,
  };

  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .insert(payload)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    return apiError(res, 500, 'DUPLICATE_FAILED', 'Failed to duplicate message template', error.message);
  }

  return res.status(201).json(data);
});

export default router;
