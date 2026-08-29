import { z } from 'zod';
import { sendManualEmailForOrg, sendManualSmsForOrg } from './manualMessaging';
import { logCommunicationHistory } from './communicationHistory';
import {
  loadTemplateContextForScope,
  resolveMessagePerRecipient,
} from './placeholderResolver';
import { supabaseAdmin } from './supabase';
import { extractPlaceholders } from './templatePlaceholders';

export const campaignChannelSchema = z.enum(['email', 'sms']);
export const campaignStatusSchema = z.enum(['draft', 'sending', 'completed', 'failed']);

export const campaignAudienceSchema = z.discriminatedUnion('audienceType', [
  z.object({
    audienceType: z.literal('all'),
  }),
  z.object({
    audienceType: z.literal('departure'),
    departureId: z.string().uuid(),
  }),
  z.object({
    audienceType: z.literal('reservations'),
    reservationIds: z.array(z.string().uuid()).min(1).max(100),
  }),
  z.object({
    audienceType: z.literal('customers'),
    customerIds: z.array(z.string().uuid()).min(1).max(100),
  }),
]);

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: campaignChannelSchema,
  template_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000),
  audience: campaignAudienceSchema.optional(),
  recipient_count: z.number().int().min(0).optional(),
}).superRefine((value, ctx) => {
  if (value.channel === 'email' && !value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Email campaigns require a subject' });
  }
  if (value.channel === 'sms' && value.subject?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['subject'], message: 'SMS campaigns do not support a subject' });
  }
  if (value.channel === 'sms' && value.body.length > 320) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'SMS campaigns must be 320 characters or less' });
  }
});

export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  name: z.string().trim().min(1).max(120).optional(),
  channel: campaignChannelSchema.optional(),
  body: z.string().trim().min(1).max(5000).optional(),
});

export type CampaignAudienceInput = z.infer<typeof campaignAudienceSchema>;
export type CampaignChannel = z.infer<typeof campaignChannelSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export type CampaignRecord = {
  id: string;
  org_id: string;
  name: string;
  channel: CampaignChannel;
  template_id: string | null;
  subject: string | null;
  body: string;
  status: CampaignStatus;
  audience: CampaignAudienceInput | null;
  recipient_count: number | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string | null;
  sent_at: string | null;
};
type AudienceContact = {
  recipient: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  relatedDepartureId?: string | null;
  relatedReservationId?: string | null;
};

type SkippedRecipient = {
  recipient: string;
  reason: 'empty_recipient' | 'invalid_recipient' | 'duplicate_recipient';
  relatedDepartureId?: string | null;
  relatedReservationId?: string | null;
};

type AudiencePreview = {
  audienceType: CampaignAudienceInput['audienceType'];
  totalCandidates: number;
  uniqueRecipients: number;
  sendableRecipients: number;
  skippedEmpty: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  sampleRecipients: string[];
  skipped: SkippedRecipient[];
  recipients: Array<{
    recipient: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    relatedDepartureId?: string | null;
    relatedReservationId?: string | null;
  }>;
};

type CampaignDeps = {
  fetchDepartureContacts?: (orgId: string, departureId: string, channel: CampaignChannel) => Promise<AudienceContact[]>;
  fetchReservationContacts?: (orgId: string, reservationIds: string[], channel: CampaignChannel) => Promise<AudienceContact[]>;
  fetchCustomerContacts?: (orgId: string, customerIds: string[], channel: CampaignChannel) => Promise<AudienceContact[]>;
  fetchAllCustomersContacts?: (orgId: string, channel: CampaignChannel) => Promise<AudienceContact[]>;
  logHistory?: typeof logCommunicationHistory;
  sendEmail?: typeof sendManualEmailForOrg;
  sendSms?: typeof sendManualSmsForOrg;
  updateCampaign?: (campaignId: string, orgId: string, updates: Partial<Pick<CampaignRecord, 'status' | 'sent_at'>>) => Promise<void>;
};

const emailRecipientSchema = z.string().trim().email();
const smsRecipientSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/);

function normalizeRecipient(channel: CampaignChannel, value: string | null | undefined) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { ok: false as const, reason: 'empty_recipient' as const, normalized: '' };

  if (channel === 'email') {
    const normalized = trimmed.toLowerCase();
    const parsed = emailRecipientSchema.safeParse(normalized);
    return parsed.success
      ? { ok: true as const, normalized }
      : { ok: false as const, reason: 'invalid_recipient' as const, normalized };
  }

  const parsed = smsRecipientSchema.safeParse(trimmed);
  return parsed.success
    ? { ok: true as const, normalized: trimmed }
    : { ok: false as const, reason: 'invalid_recipient' as const, normalized: trimmed };
}

async function fetchDepartureContactsDefault(orgId: string, departureId: string, channel: CampaignChannel): Promise<AudienceContact[]> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select(`
      id,
      departure_id,
      customer_phone,
      customers (
        full_name,
        email,
        phone
      )
    `)
    .eq('org_id', orgId)
    .eq('departure_id', departureId);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    recipient: channel === 'email'
      ? row.customers?.email || null
      : row.customer_phone || row.customers?.phone || null,
    name: row.customers?.full_name || null,
    email: row.customers?.email || null,
    phone: row.customer_phone || row.customers?.phone || null,
    relatedDepartureId: row.departure_id || departureId,
    relatedReservationId: row.id,
  }));
}

async function fetchReservationContactsDefault(orgId: string, reservationIds: string[], channel: CampaignChannel): Promise<AudienceContact[]> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select(`
      id,
      departure_id,
      customer_phone,
      customers (
        full_name,
        email,
        phone
      )
    `)
    .eq('org_id', orgId)
    .in('id', reservationIds);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    recipient: channel === 'email'
      ? row.customers?.email || null
      : row.customer_phone || row.customers?.phone || null,
    name: row.customers?.full_name || null,
    email: row.customers?.email || null,
    phone: row.customer_phone || row.customers?.phone || null,
    relatedDepartureId: row.departure_id || null,
    relatedReservationId: row.id,
  }));
}

async function fetchAllCustomersContactsDefault(orgId: string, channel: CampaignChannel): Promise<AudienceContact[]> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, full_name, name, email, phone')
    .eq('org_id', orgId);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    recipient: channel === 'email' ? row.email || null : row.phone || null,
    name: row.full_name || row.name || null,
    email: row.email || null,
    phone: row.phone || null,
    relatedDepartureId: null,
    relatedReservationId: null,
  }));
}

async function fetchCustomerContactsDefault(orgId: string, customerIds: string[], channel: CampaignChannel): Promise<AudienceContact[]> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, full_name, name, email, phone')
    .eq('org_id', orgId)
    .in('id', customerIds);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    recipient: channel === 'email' ? row.email || null : row.phone || null,
    name: row.full_name || row.name || null,
    email: row.email || null,
    phone: row.phone || null,
    relatedDepartureId: null,
    relatedReservationId: null,
  }));
}

async function updateCampaignDefault(
  campaignId: string,
  orgId: string,
  updates: Partial<Pick<CampaignRecord, 'status' | 'sent_at'>>
) {
  const { error } = await supabaseAdmin
    .from('campaigns')
    .update(updates)
    .eq('id', campaignId)
    .eq('org_id', orgId);

  if (error) throw error;
}

export async function previewCampaignAudience(
  orgId: string,
  channel: CampaignChannel,
  audience: CampaignAudienceInput,
  deps: CampaignDeps = {}
): Promise<AudiencePreview> {
  const fetchDepartureContacts = deps.fetchDepartureContacts || fetchDepartureContactsDefault;
  const fetchReservationContacts = deps.fetchReservationContacts || fetchReservationContactsDefault;
  const fetchCustomerContacts = deps.fetchCustomerContacts || fetchCustomerContactsDefault;
  const fetchAllContacts = deps.fetchAllCustomersContacts || fetchAllCustomersContactsDefault;

  let contacts: AudienceContact[] = [];
  if (audience.audienceType === 'all') {
    contacts = await fetchAllContacts(orgId, channel);
  } else if (audience.audienceType === 'departure') {
    contacts = await fetchDepartureContacts(orgId, audience.departureId, channel);
  } else if (audience.audienceType === 'reservations') {
    contacts = await fetchReservationContacts(orgId, audience.reservationIds, channel);
  } else {
    contacts = await fetchCustomerContacts(orgId, audience.customerIds, channel);
  }

  const seen = new Set<string>();
  const recipients: AudiencePreview['recipients'] = [];
  const skipped: SkippedRecipient[] = [];
  let skippedEmpty = 0;
  let skippedInvalid = 0;
  let skippedDuplicates = 0;

  for (const contact of contacts) {
    const normalized = normalizeRecipient(channel, contact.recipient);
    if (!normalized.ok) {
      skipped.push({
        recipient: contact.recipient || '',
        reason: normalized.reason,
        relatedDepartureId: contact.relatedDepartureId ?? null,
        relatedReservationId: contact.relatedReservationId ?? null,
      });
      if (normalized.reason === 'empty_recipient') skippedEmpty += 1;
      else skippedInvalid += 1;
      continue;
    }

    if (seen.has(normalized.normalized)) {
      skipped.push({
        recipient: normalized.normalized,
        reason: 'duplicate_recipient',
        relatedDepartureId: contact.relatedDepartureId ?? null,
        relatedReservationId: contact.relatedReservationId ?? null,
      });
      skippedDuplicates += 1;
      continue;
    }

    seen.add(normalized.normalized);
    recipients.push({
      recipient: normalized.normalized,
      name: contact.name ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      relatedDepartureId: contact.relatedDepartureId ?? null,
      relatedReservationId: contact.relatedReservationId ?? null,
    });
  }

  return {
    audienceType: audience.audienceType,
    totalCandidates: contacts.length,
    uniqueRecipients: recipients.length,
    sendableRecipients: recipients.length,
    skippedEmpty,
    skippedInvalid,
    skippedDuplicates,
    sampleRecipients: recipients.slice(0, 5).map((item) => item.recipient),
    skipped,
    recipients,
  };
}

export async function sendCampaign(
  campaign: CampaignRecord,
  audience: CampaignAudienceInput,
  deps: CampaignDeps = {}
) {
  const logHistory = deps.logHistory || logCommunicationHistory;
  const sendEmail = deps.sendEmail || sendManualEmailForOrg;
  const sendSms = deps.sendSms || sendManualSmsForOrg;
  const updateCampaign = deps.updateCampaign || updateCampaignDefault;

  const preview = await previewCampaignAudience(campaign.org_id, campaign.channel, audience, deps);
  const hasPlaceholders = extractPlaceholders(`${campaign.subject ?? ''}\n${campaign.body}`).length > 0;

  for (const skipped of preview.skipped) {
    await logHistory({
      orgId: campaign.org_id,
      channel: campaign.channel,
      recipient: skipped.recipient || 'unknown',
      subject: campaign.channel === 'email' ? campaign.subject : null,
      bodyPreview: campaign.body,
      status: 'skipped',
      errorMessage: skipped.reason,
      relatedDepartureId: skipped.relatedDepartureId ?? null,
      relatedReservationId: skipped.relatedReservationId ?? null,
    });
  }

  let sentCount = 0;
  let failedCount = 0;
  let unresolvedCount = 0;

  for (const recipient of preview.recipients) {
    let resolvedSubject = campaign.subject;
    let resolvedBody = campaign.body;

    if (hasPlaceholders) {
      const context = await loadTemplateContextForScope(campaign.org_id, {
        relatedReservationId: recipient.relatedReservationId ?? null,
        relatedDepartureId: recipient.relatedDepartureId ?? null,
      });
      const resolved = resolveMessagePerRecipient(
        campaign.subject,
        campaign.body,
        {
          contact: recipient.recipient,
          name: recipient.name ?? null,
          email: recipient.email ?? (campaign.channel === 'email' ? recipient.recipient : null),
          phone: recipient.phone ?? (campaign.channel === 'sms' ? recipient.recipient : null),
          reservationId: recipient.relatedReservationId ?? null,
          departureId: recipient.relatedDepartureId ?? null,
        },
        context,
      );

      if (resolved.unresolved.length > 0) {
        unresolvedCount += 1;
        await logHistory({
          orgId: campaign.org_id,
          channel: campaign.channel,
          recipient: recipient.recipient,
          subject: resolved.subject,
          bodyPreview: resolved.body,
          status: 'skipped',
          errorMessage: `unresolved_placeholders:${resolved.unresolved.join(',')}`,
          relatedDepartureId: recipient.relatedDepartureId ?? null,
          relatedReservationId: recipient.relatedReservationId ?? null,
        });
        continue;
      }

      resolvedSubject = resolved.subject;
      resolvedBody = resolved.body;
    }

    try {
      if (campaign.channel === 'email') {
        await sendEmail({
          channel: 'email',
          recipient: recipient.recipient,
          subject: resolvedSubject || '',
          body: resolvedBody,
          orgId: campaign.org_id,
          relatedDepartureId: recipient.relatedDepartureId ?? null,
          relatedReservationId: recipient.relatedReservationId ?? null,
        });
      } else {
        await sendSms({
          channel: 'sms',
          recipient: recipient.recipient,
          body: resolvedBody,
          orgId: campaign.org_id,
          relatedDepartureId: recipient.relatedDepartureId ?? null,
          relatedReservationId: recipient.relatedReservationId ?? null,
        });
      }
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  const finalStatus: CampaignStatus = failedCount > 0 || sentCount === 0 ? 'failed' : 'completed';
  const sentAt = new Date().toISOString();

  await updateCampaign(campaign.id, campaign.org_id, {
    status: finalStatus,
    sent_at: sentAt,
  });

  return {
    status: finalStatus,
    sentCount,
    failedCount,
    skippedCount: preview.skipped.length + unresolvedCount,
    totalRecipients: preview.sendableRecipients,
    preview,
    sentAt,
  };
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

export interface ScheduleResult {
  campaignId: string;
  scheduledAt: string;
}

export interface CancelScheduleResult {
  campaignId: string;
  previousStatus: string;
}

export interface DueCampaignsResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ campaignId: string; status: string; sentCount?: number; failedCount?: number }>;
}

export async function scheduleCampaign(orgId: string, campaignId: string, scheduledAt: string): Promise<ScheduleResult> {
  const now = new Date().toISOString();
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime()) || scheduledDate.toISOString() <= now) {
    throw new Error('Scheduled time must be in the future');
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update({ status: 'scheduled', scheduled_at: scheduledAt, updated_at: now })
    .eq('id', campaignId)
    .eq('org_id', orgId)
    .eq('status', 'draft')
    .select('id, scheduled_at')
    .single();

  if (error || !data) {
    throw new Error('NOT_DRAFT_OR_NOT_FOUND');
  }

  return { campaignId: data.id, scheduledAt: data.scheduled_at };
}

export async function rescheduleCampaign(orgId: string, campaignId: string, scheduledAt: string): Promise<ScheduleResult> {
  const now = new Date().toISOString();
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime()) || scheduledDate.toISOString() <= now) {
    throw new Error('Scheduled time must be in the future');
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update({ scheduled_at: scheduledAt, updated_at: now })
    .eq('id', campaignId)
    .eq('org_id', orgId)
    .eq('status', 'scheduled')
    .select('id, scheduled_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Scheduled campaign not found');
  }

  return { campaignId: data.id, scheduledAt: data.scheduled_at };
}

export async function cancelSchedule(orgId: string, campaignId: string): Promise<CancelScheduleResult> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update({ status: 'draft', scheduled_at: null, updated_at: now })
    .eq('id', campaignId)
    .eq('org_id', orgId)
    .eq('status', 'scheduled')
    .select('id, status')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Scheduled campaign not found');
  }

  return { campaignId: data.id, previousStatus: 'scheduled' };
}

// Atomically claim a campaign for sending (used by both manual launch and scheduler).
// Works for both 'draft' and 'scheduled' campaigns.
async function startCampaignSend(campaignId: string, orgId: string, fromStatus?: string): Promise<CampaignRecord | null> {
  const statusFilters = fromStatus ? [fromStatus] : ['draft', 'scheduled'];
  const now = new Date().toISOString();

  // Build query dynamically
  let query = supabaseAdmin
    .from('campaigns')
    .update({ status: 'sending', updated_at: now })
    .eq('id', campaignId)
    .eq('org_id', orgId);

  if (statusFilters.length === 1) {
    query = query.eq('status', statusFilters[0]);
  } else {
    query = query.in('status', statusFilters);
  }

  const { data, error } = await query.select('*').single();

  if (error || !data) return null;
  return data as CampaignRecord;
}

// Reconstruct audience from stored audience_type/audience_data columns
function reconstructAudience(row: any): CampaignAudienceInput | null {
  if (!row.audience_type) return null;
  return { audienceType: row.audience_type, ...(row.audience_data || {}) } as CampaignAudienceInput;
}

export async function processDueScheduledCampaigns(): Promise<DueCampaignsResult> {
  const now = new Date().toISOString();

  const { data: due, error: fetchError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (fetchError || !due) {
    console.error('Failed to fetch due campaigns', fetchError);
    return { processed: 0, succeeded: 0, failed: 0, results: [] };
  }

  const results: DueCampaignsResult['results'] = [];
  let succeeded = 0;
  let failed = 0;

  for (const campaign of due) {
    const audience = reconstructAudience(campaign);
    if (!audience) continue;
    const claimed = await startCampaignSend(campaign.id, campaign.org_id, "scheduled");
    if (!claimed) {
      results.push({ campaignId: campaign.id, status: 'already-processing' });
      continue;
    }

    try {
      const sendResult = await sendCampaign(campaign as CampaignRecord, audience);
      results.push({ campaignId: campaign.id, status: sendResult.status, sentCount: sendResult.sentCount, failedCount: sendResult.failedCount });
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Campaign ${campaign.id} processing failed:`, message);
      results.push({ campaignId: campaign.id, status: 'processing-error' });
      failed += 1;
      await supabaseAdmin
        .from('campaigns')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
    }
  }

  return { processed: due.length, succeeded, failed, results };
}
