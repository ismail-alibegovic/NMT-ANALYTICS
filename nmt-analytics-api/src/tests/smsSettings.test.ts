import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let orgSettings = new Map<string, any>();
let organizations = new Map<string, { sms_sender_name?: string | null; sms_sender_number?: string | null }>();
let currentOrgId = 'org-1';
const sendSms = vi.fn(async (_options?: any) => undefined);
const setProvider = vi.fn((_provider?: any) => undefined);

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/sms/SmsService', async () => {
  const actual = await vi.importActual<any>('../lib/sms/SmsService');
  return {
    ...actual,
    createSmsProvider: vi.fn(() => ({ sendSms })),
    SmsService: {
      setProvider: (provider: any) => setProvider(provider),
      sendSms: (options: any, provider: any) => provider.sendSms(options),
    },
  };
});

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
            const value = orgSettings.get(key);
            return value
              ? { data: { value }, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }

          if (table === 'organizations') {
            const row = organizations.get(filters.id);
            return row
              ? { data: row, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }

          throw new Error(`Unhandled table: ${table}`);
        }),
        upsert: vi.fn(async (row: any) => {
          if (table !== 'org_settings') {
            throw new Error(`Unhandled upsert table: ${table}`);
          }
          orgSettings.set(`${row.org_id}:${row.key}`, row.value);
          return { data: row, error: null };
        }),
      };
      return builder;
    }),
  },
}));

import smsSettingsRoutes from '../routes/smsSettings';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/settings/sms', smsSettingsRoutes);
  return app;
}

describe('sms settings route', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    orgSettings = new Map();
    organizations = new Map([
      ['org-1', { sms_sender_name: 'Travline', sms_sender_number: '+38761111222' }],
      ['org-2', { sms_sender_name: 'Other Org', sms_sender_number: '+38763333444' }],
    ]);
    sendSms.mockClear();
    setProvider.mockClear();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.SMS_HTTP_ENDPOINT;
  });

  it('sends a valid SMS through the configured provider', async () => {
    orgSettings.set('org-1:sms_config', { provider: 'mock' });

    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The test send uses the org's provider explicitly and never installs it process-wide.
    expect(setProvider).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalledWith({
      to: '+38761123456',
      fromName: 'Travline',
      fromNumber: '+38761111222',
      message: 'Travline SMS configuration is working correctly.',
    });
  });

  it('rejects saving the mock provider in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app()).post('/settings/sms').send({ provider: 'mock' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SMS_MOCK_NOT_ALLOWED');
      expect(orgSettings.has('org-1:sms_config')).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('returns missing configuration when org sms config is absent and no env fallback', async () => {
    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_NOT_CONFIGURED');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('falls back to environment credentials when org sms config is absent', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC1234567890';
    process.env.TWILIO_AUTH_TOKEN = 'secret-token';

    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendSms).toHaveBeenCalled();
  });

  it('rejects an invalid recipient', async () => {
    orgSettings.set('org-1:sms_config', { provider: 'mock' });

    const res = await request(app()).post('/settings/sms/test').send({ to: '061123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('returns provider failure', async () => {
    orgSettings.set('org-1:sms_config', { provider: 'mock' });
    sendSms.mockRejectedValueOnce(new Error('Mock SMS provider failed'));

    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_TEST_FAILED');
  });

  it('uses the current org sender settings only', async () => {
    orgSettings.set('org-1:sms_config', { provider: 'mock' });
    orgSettings.set('org-2:sms_config', { provider: 'mock' });
    currentOrgId = 'org-2';

    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith({
      to: '+38761123456',
      fromName: 'Other Org',
      fromNumber: '+38763333444',
      message: 'Travline SMS configuration is working correctly.',
    });
  });

  it('saves and reads Twilio SMS config with masked auth token', async () => {
    const saveRes = await request(app())
      .post('/settings/sms')
      .send({
        provider: 'twilio',
        accountSid: 'AC9999999999',
        authToken: 'my-super-secret-token',
        fromNumber: '+1234567890',
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    const getRes = await request(app()).get('/settings/sms');
    expect(getRes.status).toBe(200);
    expect(getRes.body.provider).toBe('twilio');
    expect(getRes.body.accountSid).toBe('AC9999999999');
    expect(getRes.body.authToken).toBe('********');
    expect(getRes.body.fromNumber).toBe('+1234567890');
  });

  it('preserves existing authToken when updating with masked token', async () => {
    orgSettings.set('org-1:sms_config', {
      provider: 'twilio',
      accountSid: 'AC9999999999',
      authToken: 'original-secret-token',
      fromNumber: '+1234567890',
    });

    const updateRes = await request(app())
      .post('/settings/sms')
      .send({
        provider: 'twilio',
        accountSid: 'AC9999999999',
        authToken: '********',
        fromNumber: '+1999999999',
      });

    expect(updateRes.status).toBe(200);
    const saved = orgSettings.get('org-1:sms_config');
    expect(saved.authToken).toBe('original-secret-token');
    expect(saved.fromNumber).toBe('+1999999999');
  });

  it('saves and reads HTTP SMS gateway config with masked API key', async () => {
    const saveRes = await request(app())
      .post('/settings/sms')
      .send({
        provider: 'http',
        endpoint: 'https://sms.example.com/webhook',
        apiKey: 'secret-api-key',
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);

    const getRes = await request(app()).get('/settings/sms');
    expect(getRes.status).toBe(200);
    expect(getRes.body.provider).toBe('http');
    expect(getRes.body.endpoint).toBe('https://sms.example.com/webhook');
    expect(getRes.body.apiKey).toBe('********');
  });
});
