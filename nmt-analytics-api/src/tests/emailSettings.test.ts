import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let storedConfig: any = null;
const sendEmail = vi.fn(async () => undefined);
const setProvider = vi.fn();

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-1';
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {
    setProvider: (...args: any[]) => setProvider(...args),
  },
}));

vi.mock('../lib/email/SmtpProvider', () => ({
  SmtpEmailProvider: class {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
    sendEmail = sendEmail;
  },
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      expect(table).toBe('org_settings');
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => (
          storedConfig
            ? { data: { value: storedConfig }, error: null }
            : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        )),
        upsert: vi.fn(async (row: any) => {
          storedConfig = row.value;
          return { data: row, error: null };
        }),
      };
      return builder;
    }),
  },
}));

import emailSettingsRoutes from '../routes/emailSettings';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/settings/email', emailSettingsRoutes);
  return app;
}

const validConfig = {
  host: 'smtp.example.ba',
  port: 587,
  secure: false,
  user: 'smtp-user',
  pass: 'smtp-pass',
  fromEmail: 'noreply@example.ba',
  fromName: 'Travline Test',
};

describe('email settings route', () => {
  beforeEach(() => {
    storedConfig = null;
    sendEmail.mockClear();
    setProvider.mockClear();
  });

  it('returns saved email config with masked password', async () => {
    storedConfig = validConfig;

    const res = await request(app()).get('/settings/email');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: true,
      host: validConfig.host,
      port: validConfig.port,
      secure: false,
      user: validConfig.user,
      fromEmail: validConfig.fromEmail,
      fromName: validConfig.fromName,
      pass: '********',
    });
  });

  it('saves a valid SMTP config using the canonical payload shape', async () => {
    const res = await request(app()).post('/settings/email').send(validConfig);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storedConfig).toEqual(validConfig);
    expect(setProvider).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid SMTP config', async () => {
    const res = await request(app()).post('/settings/email').send({ ...validConfig, fromEmail: 'bad-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(storedConfig).toBeNull();
  });

  it('tests email using the saved SMTP config', async () => {
    storedConfig = validConfig;

    const res = await request(app()).post('/settings/email/test').send({ to: 'qa@example.ba' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(setProvider).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'qa@example.ba',
      subject: 'Travline — SMTP Test',
      body: 'SMTP configuration is working correctly.',
    });
  });
});
