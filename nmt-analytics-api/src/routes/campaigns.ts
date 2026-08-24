import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import {
  campaignAudienceSchema,
  campaignCreateSchema,
  campaignStatusSchema,
  campaignUpdateSchema,
  previewCampaignAudience,
  sendCampaign,
  type CampaignRecord,
} from '../lib/campaigns';

const router = Router();

const listQuerySchema = z.object({
  channel: z.enum(['email', 'sms']).optional(),
  status: campaignStatusSchema.optional(),
});

router.use(authenticateToken, requireOrgContext, requireMinimumRole('director'));

router.get('/campaigns', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign filters', parsed.error.issues);
  }

  const orgId = req.orgId!;
  let query = supabaseAdmin
    .from('campaigns')
    .select('id, org_id, name, channel, subject, body, status, created_at, sent_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);

  const { data, error } = await query;
  if (error) {
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch campaigns', error.message);
  }

  return res.json({ data: data || [] });
});

router.post('/campaigns', async (req: Request, res: Response) => {
  const parsed = campaignCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign payload', parsed.error.issues);
  }

  const payload = {
    org_id: req.orgId!,
    name: parsed.data.name,
    channel: parsed.data.channel,
    subject: parsed.data.channel === 'email' ? parsed.data.subject?.trim() || null : null,
    body: parsed.data.body,
    status: 'draft',
  };

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert(payload)
    .select('id, org_id, name, channel, subject, body, status, created_at, sent_at')
    .single();

  if (error) {
    return apiError(res, 500, 'CREATE_FAILED', 'Failed to create campaign', error.message);
  }

  return res.status(201).json(data);
});

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  const parsed = campaignUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign payload', parsed.error.issues);
  }

  const orgId = req.orgId!;
  const { id } = req.params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('campaigns')
    .select('id, org_id, channel, subject, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  if (existing.status === 'sending' || existing.status === 'completed') {
    return apiError(res, 400, 'CAMPAIGN_LOCKED', 'Completed or sending campaigns cannot be edited');
  }

  const nextChannel = parsed.data.channel || existing.channel;
  const nextSubject = parsed.data.subject !== undefined ? parsed.data.subject : existing.subject;

  if (nextChannel === 'email' && !nextSubject?.trim()) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Email campaigns require a subject');
  }
  if (nextChannel === 'sms' && nextSubject?.trim()) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'SMS campaigns do not support a subject');
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.subject !== undefined || nextChannel === 'sms') {
    updates.subject = nextChannel === 'email' ? nextSubject?.trim() || null : null;
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, org_id, name, channel, subject, body, status, created_at, sent_at')
    .single();

  if (error) {
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to update campaign', error.message);
  }

  return res.json(data);
});

router.post('/campaigns/:id/preview', async (req: Request, res: Response) => {
  const parsed = campaignAudienceSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign audience', parsed.error.issues);
  }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('id, org_id, channel, status')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();

  if (error || !campaign) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  const preview = await previewCampaignAudience(req.orgId!, campaign.channel, parsed.data);
  return res.json(preview);
});

router.post('/campaigns/:id/send', async (req: Request, res: Response) => {
  const parsed = campaignAudienceSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid campaign audience', parsed.error.issues);
  }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('id, org_id, name, channel, subject, body, status, created_at, sent_at')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();

  if (error || !campaign) {
    return apiError(res, 404, 'NOT_FOUND', 'Campaign not found');
  }

  if (campaign.status === 'sending' || campaign.status === 'completed') {
    return apiError(res, 400, 'CAMPAIGN_LOCKED', 'Completed or sending campaigns cannot be sent again');
  }

  try {
    const result = await sendCampaign(campaign as CampaignRecord, parsed.data);
    return res.json(result);
  } catch (sendError: any) {
    if (sendError?.message === 'SMTP_NOT_CONFIGURED' || sendError?.message === 'SMS_NOT_CONFIGURED' || sendError?.message === 'SMS_SENDER_MISSING') {
      return apiError(res, 400, sendError.message, sendError.message);
    }
    console.error('[campaigns] send failed:', sendError);
    return apiError(res, 500, 'SEND_FAILED', 'Failed to send campaign', sendError?.message || String(sendError));
  }
});

export default router;
