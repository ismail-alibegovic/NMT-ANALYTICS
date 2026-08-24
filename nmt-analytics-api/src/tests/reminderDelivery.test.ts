import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runUpcomingDepartureReminderDelivery } from '../lib/reminderDelivery';

function createSupabaseStub({
  rpcRows,
  notifications,
  organizations,
  settings,
}: {
  rpcRows: Array<{ notification_id: string }>;
  notifications: Array<{ id: string; org_id: string; title: string; body: string; data?: Record<string, any> }>;
  organizations: Record<string, any>;
  settings: Record<string, Record<string, any>>;
}) {
  return {
    rpc: vi.fn(async () => ({ data: rpcRows, error: null })),
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        in: vi.fn(async (column: string, values: any[]) => {
          if (table === 'notifications') {
            return {
              data: notifications.filter((row) => values.includes((row as any)[column])),
              error: null,
            };
          }

          if (table === 'org_settings') {
            const orgSettings = settings[filters.org_id] || {};
            return {
              data: values
                .filter((key) => Object.prototype.hasOwnProperty.call(orgSettings, key))
                .map((key) => ({ key, value: orgSettings[key] })),
              error: null,
            };
          }

          throw new Error(`Unhandled in() table ${table}`);
        }),
        single: vi.fn(async () => {
          if (table === 'organizations') {
            const row = organizations[filters.id];
            return row
              ? { data: row, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }
          throw new Error(`Unhandled single() table ${table}`);
        }),
      };
      return builder;
    }),
  };
}

const validSmtpConfig = {
  host: 'smtp.example.ba',
  port: 587,
  secure: false,
  user: 'mailer',
  pass: 'secret',
  fromEmail: 'noreply@example.ba',
  fromName: 'Travline',
};

describe('runUpcomingDepartureReminderDelivery', () => {
  const sendEmail = vi.fn(async () => undefined);
  const sendSms = vi.fn(async () => undefined);
  const setEmailProvider = vi.fn();
  const setSmsProvider = vi.fn();
  const createEmailProvider = vi.fn((config) => ({ config }));
  const createSmsProvider = vi.fn((config) => ({ config }));
  const logCommunication = vi.fn(async () => undefined);
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    sendEmail.mockClear();
    sendSms.mockClear();
    setEmailProvider.mockClear();
    setSmsProvider.mockClear();
    createEmailProvider.mockClear();
    createSmsProvider.mockClear();
    logCommunication.mockClear();
    logger.log.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  it('keeps notification only when no channel configs are available', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra' }],
      organizations: { 'org-1': { reminders_enabled: true, email: 'ops@example.ba', phone: '+38761111222' } },
      settings: { 'org-1': {} },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.createdCount).toBe(1);
    expect(result.emailSkipped).toBe(1);
    expect(result.smsSkipped).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('delivers notification and email when SMTP config is available', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra' }],
      organizations: { 'org-1': { reminders_enabled: true, email: 'ops@example.ba', phone: null } },
      settings: { 'org-1': { smtp_config: validSmtpConfig } },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.emailSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'ops@example.ba',
      subject: 'Podsjetnik',
      body: 'Polazak sutra',
    });
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'email',
      recipient: 'ops@example.ba',
      status: 'sent',
    }));
  });

  it('delivers notification and SMS through the mock provider', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra', data: { departureId: 'dep-1' } }],
      organizations: {
        'org-1': {
          reminders_enabled: true,
          email: null,
          phone: '+38761111222',
          sms_sender_name: 'Travline',
          sms_sender_number: '+38763333444',
        },
      },
      settings: { 'org-1': { sms_config: { provider: 'mock' } } },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.smsSent).toBe(1);
    expect(sendSms).toHaveBeenCalledWith({
      to: '+38761111222',
      fromName: 'Travline',
      fromNumber: '+38763333444',
      message: 'Polazak sutra',
    });
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'sms',
      recipient: '+38761111222',
      status: 'sent',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('skips missing email config without crashing the job', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra' }],
      organizations: { 'org-1': { reminders_enabled: true, email: 'ops@example.ba', phone: null } },
      settings: { 'org-1': { sms_config: { provider: 'mock' } } },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.emailSkipped).toBe(1);
    expect(result.results[0].email.reason).toBe('missing_email_config');
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'email',
      status: 'skipped',
      errorMessage: 'missing_email_config',
    }));
  });

  it('skips missing SMS config without crashing the job', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra' }],
      organizations: {
        'org-1': {
          reminders_enabled: true,
          email: null,
          phone: '+38761111222',
          sms_sender_name: 'Travline',
          sms_sender_number: '+38763333444',
        },
      },
      settings: { 'org-1': {} },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.smsSkipped).toBe(1);
    expect(result.results[0].sms.reason).toBe('missing_sms_config');
  });

  it('continues valid channels when one channel fails', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }],
      notifications: [{ id: 'n1', org_id: 'org-1', title: 'Podsjetnik', body: 'Polazak sutra' }],
      organizations: {
        'org-1': {
          reminders_enabled: true,
          email: 'ops@example.ba',
          phone: '+38761111222',
          sms_sender_name: 'Travline',
          sms_sender_number: '+38763333444',
        },
      },
      settings: { 'org-1': { smtp_config: validSmtpConfig, sms_config: { provider: 'mock' } } },
    });

    const result = await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(result.emailFailed).toBe(1);
    expect(result.smsSent).toBe(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'email',
      status: 'failed',
      errorMessage: 'SMTP down',
    }));
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'sms',
      status: 'sent',
    }));
  });

  it('keeps org isolation across reminder deliveries', async () => {
    const supabase = createSupabaseStub({
      rpcRows: [{ notification_id: 'n1' }, { notification_id: 'n2' }],
      notifications: [
        { id: 'n1', org_id: 'org-1', title: 'Podsjetnik 1', body: 'Polazak sutra 1' },
        { id: 'n2', org_id: 'org-2', title: 'Podsjetnik 2', body: 'Polazak sutra 2' },
      ],
      organizations: {
        'org-1': { reminders_enabled: true, email: 'ops1@example.ba', phone: null },
        'org-2': { reminders_enabled: true, email: 'ops2@example.ba', phone: null },
      },
      settings: {
        'org-1': { smtp_config: validSmtpConfig },
        'org-2': { smtp_config: { ...validSmtpConfig, user: 'second-user', fromEmail: 'ops2@example.ba' } },
      },
    });

    await runUpcomingDepartureReminderDelivery({
      supabase: supabase as any,
      setEmailProvider,
      sendEmail,
      createEmailProvider,
      setSmsProvider,
      sendSms,
      createSmsProvider: createSmsProvider as any,
      logCommunication,
      logger,
    });

    expect(sendEmail).toHaveBeenNthCalledWith(1, {
      to: 'ops1@example.ba',
      subject: 'Podsjetnik 1',
      body: 'Polazak sutra 1',
    });
    expect(sendEmail).toHaveBeenNthCalledWith(2, {
      to: 'ops2@example.ba',
      subject: 'Podsjetnik 2',
      body: 'Polazak sutra 2',
    });
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'email',
      recipient: 'ops1@example.ba',
    }));
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-2',
      channel: 'email',
      recipient: 'ops2@example.ba',
    }));
  });
});
