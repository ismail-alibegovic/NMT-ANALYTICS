vi.mock('../lib/email/orgEmailProvider', () => ({ resolveOrgEmailProvider: vi.fn(async () => null) }));
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('../lib/communicationHistory', () => ({ logCommunicationHistory: vi.fn(async () => {}) }));
import { EmailService } from '../lib/email/EmailService';
import { activateSmtpProvider, isSmtpProviderConfigured } from '../lib/email/activateSmtpProvider';

describe('activateSmtpProvider fallback', () => {
  const original = { ...process.env };
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.SMTP_CONFIG;
  });
  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it('fails closed in production when SMTP is not configured', async () => {
    process.env.NODE_ENV = 'production';
    activateSmtpProvider();
    expect(isSmtpProviderConfigured()).toBe(false);
    await expect(
      EmailService.sendManualMessage({ to: 'a@b.ba', subject: 's', body: 'b', orgId: 'org-1' }),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('fails closed in production when SMTP_CONFIG is invalid JSON', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_CONFIG = '{not json';
    activateSmtpProvider();
    expect(isSmtpProviderConfigured()).toBe(false);
    await expect(
      EmailService.sendManualMessage({ to: 'a@b.ba', subject: 's', body: 'b', orgId: 'org-1' }),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('keeps the mock provider outside production', async () => {
    process.env.NODE_ENV = 'development';
    activateSmtpProvider();
    await expect(
      EmailService.sendManualMessage({ to: 'a@b.ba', subject: 's', body: 'b', orgId: 'org-1' }),
    ).resolves.not.toThrow();
  });
});

