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

vi.mock('../lib/sms/SmsService', () => ({
  MockSmsProvider: class {
    sendSms = sendSms;
  },
  createSmsProvider: vi.fn(() => ({ sendSms })),
  SmsService: {
    setProvider: (provider: any) => setProvider(provider),
    sendSms: (options: any) => sendSms(options),
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
  });

  it('sends a valid SMS through the configured provider', async () => {
    orgSettings.set('org-1:sms_config', { provider: 'mock' });

    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(setProvider).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith({
      to: '+38761123456',
      fromName: 'Travline',
      fromNumber: '+38761111222',
      message: 'Travline SMS configuration is working correctly.',
    });
  });

  it('returns missing configuration when org sms config is absent', async () => {
    const res = await request(app()).post('/settings/sms/test').send({ to: '+38761123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SMS_NOT_CONFIGURED');
    expect(sendSms).not.toHaveBeenCalled();
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
});
