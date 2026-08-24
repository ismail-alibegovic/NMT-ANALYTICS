import { z } from 'zod';
import { supabaseAdmin } from './supabase';
import { EmailService } from './email/EmailService';
import { SmtpEmailProvider, type SmtpConfig } from './email/SmtpProvider';
import { SmsService, createSmsProvider, type SmsOptions, type SmsProviderConfig } from './sms/SmsService';
import { logCommunicationHistory, type CommunicationHistoryEntry } from './communicationHistory';

const smtpConfigSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional(),
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().optional(),
});

const smsConfigSchema = z.object({
  provider: z.literal('mock'),
});

type ReminderNotification = {
  id: string;
  org_id: string;
  title: string;
  body?: string | null;
  data?: Record<string, any> | null;
};

type OrgReminderContext = {
  remindersEnabled: boolean;
  emailRecipient: string | null;
  smsRecipient: string | null;
  smsSenderName: string | null;
  smsSenderNumber: string | null;
  smtpConfig: SmtpConfig | null;
  smsConfig: SmsProviderConfig | null;
};

type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

type ReminderDeliveryDeps = {
  supabase: typeof supabaseAdmin;
  setEmailProvider: typeof EmailService.setProvider;
  sendEmail: (options: { to: string; subject: string; body: string }) => Promise<void>;
  createEmailProvider: (config: SmtpConfig) => unknown;
  setSmsProvider: typeof SmsService.setProvider;
  sendSms: (options: SmsOptions) => Promise<void>;
  createSmsProvider: typeof createSmsProvider;
  logCommunication: (entry: CommunicationHistoryEntry) => Promise<unknown>;
  logger: Logger;
};

type ChannelStatus = { status: 'sent' | 'skipped' | 'failed'; reason?: string };

export type ReminderDeliveryResult = {
  notificationId: string;
  orgId: string;
  email: ChannelStatus;
  sms: ChannelStatus;
};

export type ReminderDeliverySummary = {
  createdCount: number;
  processedCount: number;
  emailSent: number;
  emailSkipped: number;
  emailFailed: number;
  smsSent: number;
  smsSkipped: number;
  smsFailed: number;
  results: ReminderDeliveryResult[];
};

const defaultDeps: ReminderDeliveryDeps = {
  supabase: supabaseAdmin,
  setEmailProvider: EmailService.setProvider.bind(EmailService),
  sendEmail: (options) => {
    const provider = (EmailService as unknown as { provider: { sendEmail: (options: { to: string; subject: string; body: string }) => Promise<void> } }).provider;
    return provider.sendEmail(options);
  },
  createEmailProvider: (config) => new SmtpEmailProvider(config),
  setSmsProvider: SmsService.setProvider.bind(SmsService),
  sendSms: SmsService.sendSms.bind(SmsService),
  createSmsProvider,
  logCommunication: (entry) => logCommunicationHistory(entry),
  logger: console,
};

function isMissingColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703');
}

async function loadOrgReminderContext(orgId: string, deps: ReminderDeliveryDeps): Promise<OrgReminderContext> {
  const orgQuery = await deps.supabase
    .from('organizations')
    .select('reminders_enabled,email,phone,sms_sender_name,sms_sender_number')
    .eq('id', orgId)
    .single();

  let organization: Record<string, any> | null = orgQuery.data;
  let orgError = orgQuery.error;

  if (isMissingColumnError(orgError)) {
    const fallback = await deps.supabase
      .from('organizations')
      .select('email,phone')
      .eq('id', orgId)
      .single();
    organization = fallback.data;
    orgError = fallback.error;
  }

  if (orgError || !organization) {
    throw new Error(`Failed to load reminder organization settings for ${orgId}`);
  }

  const { data: settingsRows, error: settingsError } = await deps.supabase
    .from('org_settings')
    .select('key,value')
    .eq('org_id', orgId)
    .in('key', ['smtp_config', 'sms_config']);

  if (settingsError) {
    throw new Error(`Failed to load reminder channel config for ${orgId}`);
  }

  const settingsMap = new Map<string, any>();
  for (const row of settingsRows || []) {
    settingsMap.set(row.key, row.value);
  }

  let smtpConfig: SmtpConfig | null = null;
  let smsConfig: SmsProviderConfig | null = null;

  try {
    if (settingsMap.has('smtp_config')) {
      smtpConfig = smtpConfigSchema.parse(settingsMap.get('smtp_config'));
    }
  } catch {
    deps.logger.warn(`[DepartureReminders] Skipping invalid SMTP config for org ${orgId}`);
  }

  try {
    if (settingsMap.has('sms_config')) {
      smsConfig = smsConfigSchema.parse(settingsMap.get('sms_config'));
    }
  } catch {
    deps.logger.warn(`[DepartureReminders] Skipping invalid SMS config for org ${orgId}`);
  }

  return {
    remindersEnabled: Boolean(organization.reminders_enabled),
    emailRecipient: organization.email || null,
    smsRecipient: organization.phone || null,
    smsSenderName: organization.sms_sender_name || null,
    smsSenderNumber: organization.sms_sender_number || null,
    smtpConfig,
    smsConfig,
  };
}

async function deliverReminderChannels(
  notification: ReminderNotification,
  context: OrgReminderContext,
  deps: ReminderDeliveryDeps
): Promise<ReminderDeliveryResult> {
  const relatedDepartureId =
    typeof notification.data?.departureId === 'string' ? notification.data.departureId : null;
  const result: ReminderDeliveryResult = {
    notificationId: notification.id,
    orgId: notification.org_id,
    email: { status: 'skipped', reason: 'disabled' },
    sms: { status: 'skipped', reason: 'disabled' },
  };

  if (!context.remindersEnabled) {
    deps.logger.log(`[DepartureReminders] Reminders disabled for org ${notification.org_id}`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'email',
      recipient: context.emailRecipient || 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'reminders_disabled',
      relatedDepartureId,
    });
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'sms',
      recipient: context.smsRecipient || 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'reminders_disabled',
      relatedDepartureId,
    });
    return result;
  }

  if (!context.smtpConfig) {
    result.email = { status: 'skipped', reason: 'missing_email_config' };
    deps.logger.log(`[DepartureReminders] Email skipped for org ${notification.org_id}: missing config`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'email',
      recipient: context.emailRecipient || 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'missing_email_config',
      relatedDepartureId,
    });
  } else if (!context.emailRecipient) {
    result.email = { status: 'skipped', reason: 'missing_email_recipient' };
    deps.logger.log(`[DepartureReminders] Email skipped for org ${notification.org_id}: missing recipient`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'email',
      recipient: 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'missing_email_recipient',
      relatedDepartureId,
    });
  } else {
    try {
      deps.setEmailProvider(deps.createEmailProvider(context.smtpConfig) as never);
      await deps.sendEmail({
        to: context.emailRecipient,
        subject: notification.title,
        body: notification.body || 'Upcoming departure reminder',
      });
      result.email = { status: 'sent' };
      await deps.logCommunication({
        orgId: notification.org_id,
        channel: 'email',
        recipient: context.emailRecipient,
        subject: notification.title,
        bodyPreview: notification.body,
        status: 'sent',
        relatedDepartureId,
        sentAt: new Date(),
      });
    } catch (err: any) {
      result.email = { status: 'failed', reason: err.message || 'email_send_failed' };
      deps.logger.warn(`[DepartureReminders] Email failed for org ${notification.org_id}: ${result.email.reason}`);
      await deps.logCommunication({
        orgId: notification.org_id,
        channel: 'email',
        recipient: context.emailRecipient,
        subject: notification.title,
        bodyPreview: notification.body,
        status: 'failed',
        errorMessage: result.email.reason,
        relatedDepartureId,
      });
    }
  }

  if (!context.smsConfig) {
    result.sms = { status: 'skipped', reason: 'missing_sms_config' };
    deps.logger.log(`[DepartureReminders] SMS skipped for org ${notification.org_id}: missing config`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'sms',
      recipient: context.smsRecipient || 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'missing_sms_config',
      relatedDepartureId,
    });
  } else if (!context.smsRecipient) {
    result.sms = { status: 'skipped', reason: 'missing_sms_recipient' };
    deps.logger.log(`[DepartureReminders] SMS skipped for org ${notification.org_id}: missing recipient`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'sms',
      recipient: 'unconfigured',
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'missing_sms_recipient',
      relatedDepartureId,
    });
  } else if (!context.smsSenderNumber) {
    result.sms = { status: 'skipped', reason: 'missing_sms_sender' };
    deps.logger.log(`[DepartureReminders] SMS skipped for org ${notification.org_id}: missing sender`);
    await deps.logCommunication({
      orgId: notification.org_id,
      channel: 'sms',
      recipient: context.smsRecipient,
      subject: notification.title,
      bodyPreview: notification.body,
      status: 'skipped',
      errorMessage: 'missing_sms_sender',
      relatedDepartureId,
    });
  } else {
    try {
      deps.setSmsProvider(deps.createSmsProvider(context.smsConfig));
      await deps.sendSms({
        to: context.smsRecipient,
        fromName: context.smsSenderName,
        fromNumber: context.smsSenderNumber,
        message: notification.body || notification.title,
      });
      result.sms = { status: 'sent' };
      await deps.logCommunication({
        orgId: notification.org_id,
        channel: 'sms',
        recipient: context.smsRecipient,
        subject: notification.title,
        bodyPreview: notification.body,
        status: 'sent',
        relatedDepartureId,
        sentAt: new Date(),
      });
    } catch (err: any) {
      result.sms = { status: 'failed', reason: err.message || 'sms_send_failed' };
      deps.logger.warn(`[DepartureReminders] SMS failed for org ${notification.org_id}: ${result.sms.reason}`);
      await deps.logCommunication({
        orgId: notification.org_id,
        channel: 'sms',
        recipient: context.smsRecipient,
        subject: notification.title,
        bodyPreview: notification.body,
        status: 'failed',
        errorMessage: result.sms.reason,
        relatedDepartureId,
      });
    }
  }

  return result;
}

export async function runUpcomingDepartureReminderDelivery(
  overrides: Partial<ReminderDeliveryDeps> = {}
): Promise<ReminderDeliverySummary> {
  const deps = { ...defaultDeps, ...overrides } as ReminderDeliveryDeps;
  const { data, error } = await deps.supabase.rpc('notify_upcoming_departures');

  if (error) {
    throw new Error(error.message || 'Failed to create departure reminders');
  }

  const notificationIds = (data || [])
    .map((row: any) => row.notification_id)
    .filter(Boolean);

  if (notificationIds.length === 0) {
    return {
      createdCount: 0,
      processedCount: 0,
      emailSent: 0,
      emailSkipped: 0,
      emailFailed: 0,
      smsSent: 0,
      smsSkipped: 0,
      smsFailed: 0,
      results: [],
    };
  }

  const { data: notifications, error: notificationsError } = await deps.supabase
    .from('notifications')
    .select('id,org_id,title,body,data')
    .in('id', notificationIds);

  if (notificationsError) {
    throw new Error(notificationsError.message || 'Failed to load created reminder notifications');
  }

  const contextCache = new Map<string, OrgReminderContext>();
  const results: ReminderDeliveryResult[] = [];

  for (const notification of (notifications || []) as ReminderNotification[]) {
    let context = contextCache.get(notification.org_id);
    if (!context) {
      context = await loadOrgReminderContext(notification.org_id, deps);
      contextCache.set(notification.org_id, context);
    }

    results.push(await deliverReminderChannels(notification, context, deps));
  }

  return {
    createdCount: notificationIds.length,
    processedCount: results.length,
    emailSent: results.filter((r) => r.email.status === 'sent').length,
    emailSkipped: results.filter((r) => r.email.status === 'skipped').length,
    emailFailed: results.filter((r) => r.email.status === 'failed').length,
    smsSent: results.filter((r) => r.sms.status === 'sent').length,
    smsSkipped: results.filter((r) => r.sms.status === 'skipped').length,
    smsFailed: results.filter((r) => r.sms.status === 'failed').length,
    results,
  };
}
