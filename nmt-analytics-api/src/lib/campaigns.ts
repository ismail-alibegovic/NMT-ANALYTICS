import { z } from 'zod';
import { sendManualEmailForOrg, sendManualSmsForOrg } from './manualMessaging';
import { logCommunicationHistory } from './communicationHistory';
import { supabaseAdmin } from './supabase';

export const campaignChannelSchema = z.enum(['email', 'sms']);
export const campaignStatusSchema = z.enum(['draft', 'sending', 'completed', 'failed']);

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: campaignChannelSchema,
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000),
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

export const campaignAudienceSchema = z.discriminatedUnion('audienceType', [
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

export type CampaignAudienceInput = z.infer<typeof campaignAudienceSchema>;
export type CampaignChannel = z.infer<typeof campaignChannelSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export type CampaignRecord = {
  id: string;
  org_id: string;
  name: string;
  channel: CampaignChannel;
  subject: string | null;
  body: string;
  status: CampaignStatus;
  created_at: string;
  sent_at: string | null;
};

type AudienceContact = {
  recipient: string | null;
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
    relatedDepartureId?: string | null;
    relatedReservationId?: string | null;
  }>;
};

type CampaignDeps = {
  fetchDepartureContacts?: (orgId: string, departureId: string, channel: CampaignChannel) => Promise<AudienceContact[]>;
  fetchReservationContacts?: (orgId: string, reservationIds: string[], channel: CampaignChannel) => Promise<AudienceContact[]>;
  fetchCustomerContacts?: (orgId: string, customerIds: string[], channel: CampaignChannel) => Promise<AudienceContact[]>;
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
    relatedDepartureId: row.departure_id || null,
    relatedReservationId: row.id,
  }));
}

async function fetchCustomerContactsDefault(orgId: string, customerIds: string[], channel: CampaignChannel): Promise<AudienceContact[]> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, email, phone')
    .eq('org_id', orgId)
    .in('id', customerIds);

  if (error) throw error;

  return (data || []).map((row: any) => ({
    recipient: channel === 'email' ? row.email || null : row.phone || null,
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

  let contacts: AudienceContact[] = [];
  if (audience.audienceType === 'departure') {
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

  await updateCampaign(campaign.id, campaign.org_id, { status: 'sending', sent_at: null });

  const preview = await previewCampaignAudience(campaign.org_id, campaign.channel, audience, deps);

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

  for (const recipient of preview.recipients) {
    try {
      if (campaign.channel === 'email') {
        await sendEmail({
          channel: 'email',
          recipient: recipient.recipient,
          subject: campaign.subject || '',
          body: campaign.body,
          orgId: campaign.org_id,
          relatedDepartureId: recipient.relatedDepartureId ?? null,
          relatedReservationId: recipient.relatedReservationId ?? null,
        });
      } else {
        await sendSms({
          channel: 'sms',
          recipient: recipient.recipient,
          body: campaign.body,
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
    skippedCount: preview.skipped.length,
    totalRecipients: preview.sendableRecipients,
    preview,
    sentAt,
  };
}
