import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import {
  campaignAudienceSchema,
  campaignChannelSchema,
  campaignCreateSchema,
  campaignStatusSchema,
  campaignUpdateSchema,
  previewCampaignAudience,
  sendCampaign,
  scheduleCampaign,
  rescheduleCampaign,
  cancelSchedule,
  type CampaignRecord,
} from '../lib/campaigns';
import { validatePlaceholders } from '../lib/templatePlaceholders';

const router = Router();

const uuidSchema = z.string().uuid();

const listQuerySchema = z.object({
  channel: z.enum(['email', 'sms']).optional(),
  status: campaignStatusSchema.optional(),
});

const previewBodySchema = z.object({
  channel: campaignChannelSchema,
  audience: campaignAudienceSchema,
  template_id: z.string().uuid().nullable().optional(),
});

const campaignSelect = `
  id,
  org_id,
  name,
  channel,
  template_id,
  subject,
  body,
  audience_type,
  audience_data,
  status,
  recipient_count,
  scheduled_at,
  created_at,
  updated_at,
  sent_at
`;

type TemplateRecord = {
  id: string;
  org_id: string;
  channel: 'email' | 'sms';
  is_active: boolean;
};

function parseCampaignId(id: string, res: Response) {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) {
    apiError(res, 400, 'INVALID_UUID', 'Malformed campaign id');
    return null;
  }
  return parsed.data;
}

function mapCampaign(row: any) {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    channel: row.channel,
    template_id: row.template_id ?? null,
    subject: row.subject ?? null,
    body: row.body,
    audience: row.audience_type ? { audienceType: row.audience_type, ...(row.audience_data || {}) } : null,
    status: row.status,
    recipient_count: row.recipient_count ?? 0,
    scheduled_at: row.scheduled_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sent_at: row.sent_at ?? null,
  };
}

async function ensureTemplateCompatible(orgId: string, templateId: string | null | undefined, channel: 'email' | 'sms') {
  if (!templateId) return null;

  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('id, org_id, channel, is_active')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .single();

  if (error || !data) {
    return { ok: false as const, status: 404, code: 'NOT_FOUND', message: 'Template not found' };
  }

  const template = data as TemplateRecord;
  if (!template.is_active) {
    return { ok: false as const, status: 400, code: 'INVALID_TEMPLATE', message: 'Template must be active' };
  }

  if (template.channel !== channel) {
    return { ok: false as const, status: 400, code: 'TEMPLATE_CHANNEL_MISMATCH', message: 'Template channel does not match campaign channel' };
  }

  return { ok: true as const, template };
}

function validateCampaignContent(channel: 'email' | 'sms', body: string, subject?: string | null) {
  const unsupported = validatePlaceholders(body, subject);
  if (unsupported.length > 0) {
    return {
      ok: false as const,
      status: 400,
      code: 'UNSUPPORTED_PLACEHOLDER',
      message: 'Campaign contains unsupported placeholders',
      details: unsupported,
    };
  }

  if (channel === 'email' && !subject?.trim()) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Email campaigns require a subject',
    };
  }

  if (channel === 'sms' && subject?.trim()) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'SMS campaigns do not support a subject',
    };
  }

  return { ok: true as const };
}

router.use(authenticateToken, requireOrgContext, requireMinimumRole('director'));

router.get('/campaigns', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign filters', parsed.error.issues);
  }

  let query = supabaseAdmin
    .from('campaigns')
    .select(campaignSelect)
    .eq('org_id', req.orgId!)
    .order('updated_at', { ascending: false });

  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);

  const { data, error } = await query;
  if (error) {
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch campaigns', error.message);
  }

  return res.json({ data: (data || []).map(mapCampaign) });
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select(campaignSelect)
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .single();

  if (error || !data) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  return res.json(mapCampaign(data));
});

router.post('/campaigns/preview', async (req: Request, res: Response) => {
  const parsed = previewBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign preview payload', parsed.error.issues);
  }

  const compatibility = await ensureTemplateCompatible(
    req.orgId!,
    parsed.data.template_id,
    parsed.data.channel,
  );
  if (compatibility && !compatibility.ok) {
    return apiError(res, compatibility.status, compatibility.code, compatibility.message);
  }

  try {
    const preview = await previewCampaignAudience(req.orgId!, parsed.data.channel, parsed.data.audience);
    return res.json(preview);
  } catch (error: any) {
    return apiError(res, 500, 'PREVIEW_FAILED', 'Failed to preview audience', error?.message || String(error));
  }
});

router.post('/campaigns', async (req: Request, res: Response) => {
  const parsed = campaignCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign payload', parsed.error.issues);
  }

  const compatibility = await ensureTemplateCompatible(
    req.orgId!,
    parsed.data.template_id,
    parsed.data.channel,
  );
  if (compatibility && !compatibility.ok) {
    return apiError(res, compatibility.status, compatibility.code, compatibility.message);
  }

  const contentValidation = validateCampaignContent(parsed.data.channel, parsed.data.body, parsed.data.subject);
  if (!contentValidation.ok) {
    return apiError(
      res,
      contentValidation.status,
      contentValidation.code,
      contentValidation.message,
      'details' in contentValidation ? contentValidation.details : undefined,
    );
  }

  const payload = {
    org_id: req.orgId!,
    name: parsed.data.name,
    channel: parsed.data.channel,
    template_id: parsed.data.template_id ?? null,
    subject: parsed.data.channel === 'email' ? parsed.data.subject?.trim() || null : null,
    body: parsed.data.body.trim(),
    audience_type: parsed.data.audience?.audienceType ?? null,
    audience_data: parsed.data.audience ? { ...parsed.data.audience, audienceType: undefined } : null,
    recipient_count: parsed.data.recipient_count ?? 0,
    status: 'draft',
  };

  if (payload.audience_data && 'audienceType' in payload.audience_data) {
    delete (payload.audience_data as Record<string, unknown>).audienceType;
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert(payload)
    .select(campaignSelect)
    .single();

  if (error) {
    return apiError(res, 500, 'CREATE_FAILED', 'Failed to create campaign', error.message);
  }

  return res.status(201).json(mapCampaign(data));
});

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const parsed = campaignUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign payload', parsed.error.issues);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('campaigns')
    .select(campaignSelect)
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  if (existing.status !== 'draft') {
    return apiError(res, 409, 'CAMPAIGN_LOCKED', 'Only draft campaigns can be edited');
  }

  const nextChannel = (parsed.data.channel ?? existing.channel) as 'email' | 'sms';
  const nextSubject = parsed.data.subject !== undefined ? parsed.data.subject : existing.subject;
  const nextBody = parsed.data.body !== undefined ? parsed.data.body : existing.body;
  const nextTemplateId = parsed.data.template_id !== undefined ? parsed.data.template_id : existing.template_id;

  const compatibility = await ensureTemplateCompatible(req.orgId!, nextTemplateId, nextChannel);
  if (compatibility && !compatibility.ok) {
    return apiError(res, compatibility.status, compatibility.code, compatibility.message);
  }

  const contentValidation = validateCampaignContent(nextChannel, nextBody, nextSubject);
  if (!contentValidation.ok) {
    return apiError(
      res,
      contentValidation.status,
      contentValidation.code,
      contentValidation.message,
      'details' in contentValidation ? contentValidation.details : undefined,
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel;
  if (parsed.data.template_id !== undefined) updates.template_id = parsed.data.template_id;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body.trim();
  if (parsed.data.subject !== undefined || nextChannel === 'sms') {
    updates.subject = nextChannel === 'email' ? nextSubject?.trim() || null : null;
  }
  if (parsed.data.audience !== undefined) {
    updates.audience_type = parsed.data.audience?.audienceType ?? null;
    updates.audience_data = parsed.data.audience
      ? Object.fromEntries(Object.entries(parsed.data.audience).filter(([key]) => key !== 'audienceType'))
      : null;
  }
  if (parsed.data.recipient_count !== undefined) {
    updates.recipient_count = parsed.data.recipient_count;
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update(updates)
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .select(campaignSelect)
    .single();

  if (error) {
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to update campaign', error.message);
  }

  return res.json(mapCampaign(data));
});

router.delete('/campaigns/:id', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('campaigns')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  if (existing.status !== 'draft') {
    return apiError(res, 409, 'CAMPAIGN_LOCKED', 'Only draft campaigns can be deleted');
  }

  const { error } = await supabaseAdmin
    .from('campaigns')
    .delete()
    .eq('id', id)
    .eq('org_id', req.orgId!);

  if (error) {
    return apiError(res, 500, 'DELETE_FAILED', 'Failed to delete campaign', error.message);
  }

  return res.status(204).send();
});

router.post('/campaigns/:id/preview', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const parsed = campaignAudienceSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign audience', parsed.error.issues);
  }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('id, channel')
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .single();

  if (error || !campaign) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  try {
    const preview = await previewCampaignAudience(req.orgId!, campaign.channel, parsed.data);
    return res.json(preview);
  } catch (previewError: any) {
    return apiError(res, 500, 'PREVIEW_FAILED', 'Failed to preview audience', previewError?.message || String(previewError));
  }
});

const scheduleBodySchema = z.object({
  scheduled_at: z.string().min(1),
});

router.post('/campaigns/:id/schedule', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const parsed = scheduleBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid schedule payload', parsed.error.issues);
  }

  try {
    const result = await scheduleCampaign(req.orgId!, id, parsed.data.scheduled_at);
    return res.json(result);
  } catch (err: any) {
    if (err?.message === 'Scheduled time must be in the future') {
      return apiError(res, 400, 'INVALID_SCHEDULE_TIME', err.message);
    }
    if (err?.message === 'NOT_DRAFT_OR_NOT_FOUND') {
      const { data: exists } = await supabaseAdmin.from('campaigns').select('id').eq('id', id).eq('org_id', req.orgId!).single();
      if (!exists) return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
      return apiError(res, 409, 'CAMPAIGN_NOT_DRAFT', 'Only draft campaigns can be scheduled');
    }
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found or cannot be scheduled', err?.message || String(err));
  }
});

router.patch('/campaigns/:id/schedule', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const parsed = scheduleBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid schedule payload', parsed.error.issues);
  }

  try {
    const result = await rescheduleCampaign(req.orgId!, id, parsed.data.scheduled_at);
    return res.json(result);
  } catch (err: any) {
    if (err?.message === 'Scheduled time must be in the future') {
      return apiError(res, 400, 'INVALID_SCHEDULE_TIME', err.message);
    }
    return apiError(res, 404, 'NOT_FOUND', 'Scheduled campaign not found', err?.message || String(err));
  }
});

router.post('/campaigns/:id/schedule/cancel', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  try {
    const result = await cancelSchedule(req.orgId!, id);
    return res.json(result);
  } catch (err: any) {
    return apiError(res, 404, 'NOT_FOUND', 'Scheduled campaign not found', err?.message || String(err));
  }
});

router.post('/campaigns/:id/send', async (req: Request, res: Response) => {
  const id = parseCampaignId(req.params.id, res);
  if (!id) return;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('campaigns')
    .select(campaignSelect)
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  if (existing.status !== 'draft') {
    return apiError(res, 400, 'CAMPAIGN_LOCKED', 'Only draft campaigns can be launched');
  }

  const audience = existing.audience_type
    ? { audienceType: existing.audience_type, ...(existing.audience_data || {}) }
    : null;

  if (!audience) {
    return apiError(res, 400, 'INVALID_AUDIENCE', 'Campaign must have a valid audience before launch');
  }

  let preview;
  try {
    preview = await previewCampaignAudience(req.orgId!, existing.channel, audience);
  } catch (previewError: any) {
    return apiError(res, 500, 'PREVIEW_FAILED', 'Failed to preview audience', previewError?.message || String(previewError));
  }

  if (preview.sendableRecipients === 0) {
    return apiError(res, 422, 'NO_SENDABLE_RECIPIENTS', 'Campaign has no sendable recipients', preview);
  }

  const lockTimestamp = new Date().toISOString();
  const { data: lockedCampaign, error: lockError } = await supabaseAdmin
    .from('campaigns')
    .update({
      status: 'sending',
      updated_at: lockTimestamp,
      recipient_count: preview.sendableRecipients,
      sent_at: null,
    })
    .eq('id', id)
    .eq('org_id', req.orgId!)
    .eq('status', 'draft')
    .select(campaignSelect)
    .single();

  if (lockError || !lockedCampaign) {
    return apiError(res, 409, 'CAMPAIGN_LOCKED', 'Campaign is already being sent or was already launched');
  }

  try {
    const result = await sendCampaign(
      {
        id: lockedCampaign.id,
        org_id: lockedCampaign.org_id,
        name: lockedCampaign.name,
        channel: lockedCampaign.channel,
        template_id: lockedCampaign.template_id ?? null,
        subject: lockedCampaign.subject ?? null,
        body: lockedCampaign.body,
        status: lockedCampaign.status,
        audience,
        recipient_count: lockedCampaign.recipient_count ?? preview.sendableRecipients,
        scheduled_at: lockedCampaign.scheduled_at ?? null,
        created_at: lockedCampaign.created_at,
        updated_at: lockedCampaign.updated_at ?? lockTimestamp,
        sent_at: lockedCampaign.sent_at ?? null,
      } satisfies CampaignRecord,
      audience,
    );

    return res.json(result);
  } catch (sendError: any) {
    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from('campaigns')
      .update({ status: 'failed', sent_at: sentAt, updated_at: sentAt })
      .eq('id', id)
      .eq('org_id', req.orgId!);

    if (
      sendError?.message === 'SMTP_NOT_CONFIGURED' ||
      sendError?.message === 'SMS_NOT_CONFIGURED' ||
      sendError?.message === 'SMS_SENDER_MISSING'
    ) {
      return apiError(res, 400, sendError.message, sendError.message);
    }

    console.error('[campaigns] send failed:', sendError);
    return apiError(res, 500, 'SEND_FAILED', 'Failed to launch campaign', sendError?.message || String(sendError));
  }
});

export default router;
