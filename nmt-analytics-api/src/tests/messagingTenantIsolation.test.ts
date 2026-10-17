import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transports: [] as Array<{ user: string; sent: any[] }>,
  history: [] as any[],
  orgSettings: {} as Record<string, any>,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opts: any) => {
      const t = { user: opts.auth?.user as string, sent: [] as any[] };
      mocks.transports.push(t);
      return { sendMail: async (mail: any) => { t.sent.push(mail); return { accepted: [mail.to], rejected: [] }; } };
    },
  },
}));

vi.mock('../lib/communicationHistory', () => ({
  logCommunicationHistory: vi.fn(async (entry: any) => { mocks.history.push(entry); }),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const f: Record<string, string> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => { f[k] = v; return q; },
        maybeSingle: async () => ({
          data: table === 'org_settings' && mocks.orgSettings[`${f.org_id}:${f.key}`]
            ? { value: mocks.orgSettings[`${f.org_id}:${f.key}`] }
            : null,
          error: null,
        }),
      };
      return q;
    },
  },
}));

const smtp = (user: string) => ({ host: 'smtp.example.ba', port: 587, secure: false, user, pass: 'pw', fromEmail: `${user}@example.ba` });

async function load() {
  vi.resetModules();
  const { EmailService } = await import('../lib/email/EmailService');
  const { SmtpEmailProvider } = await import('../lib/email/SmtpProvider');
  const { activateSmtpProvider } = await import('../lib/email/activateSmtpProvider');
  const sms = await import('../lib/sms/SmsService');
  return { EmailService, SmtpEmailProvider, activateSmtpProvider, ...sms };
}

describe('messaging provider tenant isolation', () => {
  const original = { ...process.env };
  beforeEach(() => {
    mocks.transports.length = 0;
    mocks.history.length = 0;
    mocks.orgSettings = {};
    delete process.env.SMTP_CONFIG;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it('never sends org B automated email through org A SMTP after org A sent manually', async () => {
    process.env.NODE_ENV = 'production';
    const { EmailService, SmtpEmailProvider, activateSmtpProvider } = await load();
    activateSmtpProvider(); // no platform SMTP => fail closed
    mocks.orgSettings['org-a:smtp_config'] = smtp('org-a-user');

    await EmailService.sendManualMessage(
      { to: 'x@example.ba', subject: 's', body: 'b', orgId: 'org-a' },
      new SmtpEmailProvider(smtp('org-a-user')),
    );
    expect(mocks.transports.map((t) => t.user)).toEqual(['org-a-user']);

    // Org B has no SMTP of its own: it must NOT inherit org A's credentials.
    await expect(
      EmailService.sendPaymentOverdueReminder('cust@example.ba', 'Cust', 10, 'res-b', 'org-b'),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(mocks.transports.every((t) => t.sent.every(() => t.user === 'org-a-user'))).toBe(true);
    expect(mocks.transports).toHaveLength(1);
    expect(mocks.history[mocks.history.length - 1]).toMatchObject({ orgId: 'org-b', status: 'failed' });
  });

  it('sends automated email through the sending org\'s own SMTP, not another org\'s', async () => {
    process.env.NODE_ENV = 'production';
    const { EmailService, activateSmtpProvider } = await load();
    activateSmtpProvider();
    mocks.orgSettings['org-a:smtp_config'] = smtp('org-a-user');
    mocks.orgSettings['org-b:smtp_config'] = smtp('org-b-user');

    await EmailService.sendPaymentOverdueReminder('c@example.ba', 'C', 5, 'res-b', 'org-b');
    await EmailService.sendPaymentOverdueReminder('c@example.ba', 'C', 5, 'res-a', 'org-a');

    expect(mocks.transports.map((t) => t.user)).toEqual(['org-b-user', 'org-a-user']);
    expect(mocks.history.map((h) => [h.orgId, h.status])).toEqual([['org-b', 'sent'], ['org-a', 'sent']]);
  });

  describe('SMS never reports delivery through a mock provider in production', () => {
    it('default provider is disabled in production', async () => {
      process.env.NODE_ENV = 'production';
      const { SmsService } = await load();
      await expect(
        SmsService.sendManualMessage({ to: '+387', message: 'm', orgId: 'org-a' }),
      ).rejects.toThrow('SMS_PROVIDER_NOT_CONFIGURED');
      expect(mocks.history[mocks.history.length - 1]).toMatchObject({ channel: 'sms', status: 'failed' });
      expect(mocks.history.some((h) => h.status === 'sent')).toBe(false);
    });

    it('a saved mock org config is disabled in production', async () => {
      process.env.NODE_ENV = 'production';
      const { SmsService, createSmsProvider } = await load();
      await expect(
        SmsService.sendManualMessage({ to: '+387', message: 'm', orgId: 'org-a' }, createSmsProvider({ provider: 'mock' })),
      ).rejects.toThrow('SMS_MOCK_PROVIDER_DISABLED_IN_PRODUCTION');
      expect(mocks.history.some((h) => h.status === 'sent')).toBe(false);
    });

    it('still allows the mock provider outside production', async () => {
      process.env.NODE_ENV = 'development';
      const { SmsService, createSmsProvider } = await load();
      await SmsService.sendManualMessage({ to: '+387', message: 'm', orgId: 'org-a' }, createSmsProvider({ provider: 'mock' }));
      expect(mocks.history[mocks.history.length - 1]).toMatchObject({ status: 'sent' });
    });
  });
});
