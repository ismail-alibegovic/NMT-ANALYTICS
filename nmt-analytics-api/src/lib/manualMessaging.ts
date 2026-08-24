import { z } from 'zod';
import { EmailService } from './email/EmailService';
import { SmtpEmailProvider } from './email/SmtpProvider';
import { createSmsProvider, SmsService } from './sms/SmsService';
import { supabaseAdmin } from './supabase';

export const manualMessageSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('email'),
    recipient: z.string().trim().email(),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    channel: z.literal('sms'),
    recipient: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Recipient must be in E.164 format'),
    body: z.string().trim().min(1).max(320),
  }),
]);

type MessageContext = {
  orgId: string;
  relatedReservationId?: string | null;
  relatedDepartureId?: string | null;
};

type EmailConfig = {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
};

async function getSavedOrgSetting<T>(orgId: string, key: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin
    .from('org_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', key)
    .single();

  if (error || !data?.value) {
    return null;
  }

  return data.value as T;
}

async function getSmsSender(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('name,phone,sms_sender_name,sms_sender_number')
    .eq('id', orgId)
    .single();

  if (error && error.code === '42703') {
    const fallback = await supabaseAdmin
      .from('organizations')
      .select('name,phone')
      .eq('id', orgId)
      .single();

    if (fallback.error) {
      throw new Error('SMS_SENDER_LOOKUP_FAILED');
    }

    return {
      fromName: fallback.data?.name || null,
      fromNumber: fallback.data?.phone || null,
    };
  }

  if (error) {
    throw new Error('SMS_SENDER_LOOKUP_FAILED');
  }

  return {
    fromName: data?.sms_sender_name || data?.name || null,
    fromNumber: data?.sms_sender_number || data?.phone || null,
  };
}

export async function sendManualEmailForOrg(
  payload: z.infer<typeof manualMessageSchema> & MessageContext,
) {
  if (payload.channel !== 'email') {
    throw new Error('INVALID_EMAIL_PAYLOAD');
  }

  const config = await getSavedOrgSetting<EmailConfig>(payload.orgId, 'smtp_config');
  if (!config) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  EmailService.setProvider(new SmtpEmailProvider(config));

  await EmailService.sendManualMessage({
    to: payload.recipient,
    subject: payload.subject,
    body: payload.body,
    orgId: payload.orgId,
    relatedReservationId: payload.relatedReservationId ?? null,
    relatedDepartureId: payload.relatedDepartureId ?? null,
  });
}

export async function sendManualSmsForOrg(
  payload: z.infer<typeof manualMessageSchema> & MessageContext,
) {
  if (payload.channel !== 'sms') {
    throw new Error('INVALID_SMS_PAYLOAD');
  }

  const config = await getSavedOrgSetting<{ provider: 'mock' }>(payload.orgId, 'sms_config');
  if (!config) {
    throw new Error('SMS_NOT_CONFIGURED');
  }

  const sender = await getSmsSender(payload.orgId);
  if (!sender.fromNumber) {
    throw new Error('SMS_SENDER_MISSING');
  }

  SmsService.setProvider(createSmsProvider(config));
  await SmsService.sendManualMessage({
    to: payload.recipient,
    message: payload.body,
    fromName: sender.fromName,
    fromNumber: sender.fromNumber,
    orgId: payload.orgId,
    relatedReservationId: payload.relatedReservationId ?? null,
    relatedDepartureId: payload.relatedDepartureId ?? null,
  });
}
