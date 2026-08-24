import { beforeEach, describe, expect, it, vi } from 'vitest';

let orgSettings: Record<string, any> = {};
let organizations: Record<string, any> = {};
let emailFailure: Error | null = null;
let smsFailure: Error | null = null;

const mocks = vi.hoisted(() => ({
  setEmailProvider: vi.fn(),
  sendManualEmail: vi.fn(async (payload: any) => payload),
  setSmsProvider: vi.fn(),
  sendManualSms: vi.fn(async (payload: any) => payload),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {
    setProvider: mocks.setEmailProvider,
    sendManualMessage: async (payload: any) => {
      if (emailFailure) throw emailFailure;
      return mocks.sendManualEmail(payload);
    },
  },
}));

vi.mock('../lib/email/SmtpProvider', () => ({
  SmtpEmailProvider: class {
    constructor(public config: any) {}
  },
}));

vi.mock('../lib/sms/SmsService', () => ({
  createSmsProvider: vi.fn((config: any) => ({ config })),
  SmsService: {
    setProvider: mocks.setSmsProvider,
    sendManualMessage: async (payload: any) => {
      if (smsFailure) throw smsFailure;
      return mocks.sendManualSms(payload);
    },
  },
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        single: vi.fn(async () => {
          if (table === 'org_settings') {
            const key = `${filters.org_id}:${filters.key}`;
            const value = orgSettings[key];
            return value ? { data: { value }, error: null } : { data: null, error: { code: 'PGRST116' } };
          }
          if (table === 'organizations') {
            const value = organizations[filters.id];
            return value ? { data: value, error: null } : { data: null, error: { code: 'PGRST116' } };
          }
          throw new Error(`Unhandled table: ${table}`);
        }),
      };
      return builder;
    }),
  },
}));

import { sendManualEmailForOrg, sendManualSmsForOrg } from '../lib/manualMessaging';

describe('manual messaging helpers', () => {
  beforeEach(() => {
    orgSettings = {};
    organizations = {};
    emailFailure = null;
    smsFailure = null;
    mocks.setEmailProvider.mockClear();
    mocks.sendManualEmail.mockClear();
    mocks.setSmsProvider.mockClear();
    mocks.sendManualSms.mockClear();
  });

  it('sends reservation email through saved SMTP config with reservation linkage', async () => {
    orgSettings['org-1:smtp_config'] = {
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      user: 'demo',
      pass: 'demo',
      fromEmail: 'ops@example.ba',
      fromName: 'Ops',
    };

    await sendManualEmailForOrg({
      channel: 'email',
      recipient: 'guest@example.ba',
      subject: 'Subject',
      body: 'Body',
      orgId: 'org-1',
      relatedReservationId: 'res-1',
      relatedDepartureId: 'dep-1',
    });

    expect(mocks.setEmailProvider).toHaveBeenCalledTimes(1);
    expect(mocks.sendManualEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'guest@example.ba',
      subject: 'Subject',
      body: 'Body',
      orgId: 'org-1',
      relatedReservationId: 'res-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('sends departure SMS through configured provider with history linkage', async () => {
    orgSettings['org-1:sms_config'] = { provider: 'mock' };
    organizations['org-1'] = {
      sms_sender_name: 'Travline',
      sms_sender_number: '+38761123456',
    };

    await sendManualSmsForOrg({
      channel: 'sms',
      recipient: '+38761111000',
      body: 'Reminder body',
      orgId: 'org-1',
      relatedDepartureId: 'dep-1',
    });

    expect(mocks.setSmsProvider).toHaveBeenCalledTimes(1);
    expect(mocks.sendManualSms).toHaveBeenCalledWith(expect.objectContaining({
      to: '+38761111000',
      message: 'Reminder body',
      fromName: 'Travline',
      fromNumber: '+38761123456',
      orgId: 'org-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('rejects missing email config', async () => {
    await expect(sendManualEmailForOrg({
      channel: 'email',
      recipient: 'guest@example.ba',
      subject: 'Subject',
      body: 'Body',
      orgId: 'org-1',
    })).rejects.toThrow('SMTP_NOT_CONFIGURED');
  });

  it('rejects missing SMS config', async () => {
    await expect(sendManualSmsForOrg({
      channel: 'sms',
      recipient: '+38761111000',
      body: 'Body',
      orgId: 'org-1',
    })).rejects.toThrow('SMS_NOT_CONFIGURED');
  });

  it('rejects missing SMS sender number', async () => {
    orgSettings['org-1:sms_config'] = { provider: 'mock' };
    organizations['org-1'] = {
      sms_sender_name: 'Travline',
      sms_sender_number: null,
    };

    await expect(sendManualSmsForOrg({
      channel: 'sms',
      recipient: '+38761111000',
      body: 'Body',
      orgId: 'org-1',
    })).rejects.toThrow('SMS_SENDER_MISSING');
  });

  it('rethrows provider failure', async () => {
    orgSettings['org-1:smtp_config'] = {
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      user: 'demo',
      pass: 'demo',
      fromEmail: 'ops@example.ba',
      fromName: 'Ops',
    };
    emailFailure = new Error('provider_failed');

    await expect(sendManualEmailForOrg({
      channel: 'email',
      recipient: 'guest@example.ba',
      subject: 'Subject',
      body: 'Body',
      orgId: 'org-1',
    })).rejects.toThrow('provider_failed');
  });
});
