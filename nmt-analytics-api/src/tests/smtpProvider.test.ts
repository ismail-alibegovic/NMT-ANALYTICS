import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), verify: vi.fn(), transport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.transport } }));
import { SmtpEmailProvider } from '../lib/email/SmtpProvider';
import { MockEmailProvider } from '../lib/email/EmailService';
vi.mock('../lib/communicationHistory', () => ({ logCommunicationHistory: vi.fn() }));
vi.mock('../lib/email/orgEmailProvider', () => ({ resolveOrgEmailProvider: vi.fn() }));
const config = { host: 'smtp.example.test', port: 587, user: 'user', pass: 'secret', fromEmail: 'sender@example.test' };
const mail = { to: 'recipient@example.test', subject: 'test', body: 'test' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify });
});
afterEach(() => vi.unstubAllEnvs());
describe('SMTP provider contract', () => {
  it('rejects empty configuration before opening a transport', () => {
    expect(() => new SmtpEmailProvider({ ...config, pass: '' })).toThrow('SMTP_CONFIGURATION_INVALID');
    expect(mocks.transport).not.toHaveBeenCalled();
  });
  it('requires provider recipient acceptance and TLS on port 587', async () => {
    mocks.sendMail.mockResolvedValue({ accepted: [mail.to], rejected: [] });
    await expect(new SmtpEmailProvider(config).sendEmail(mail)).resolves.toBeUndefined();
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, tls: { rejectUnauthorized: true } }));
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: [mail.to] });
    await expect(new SmtpEmailProvider(config).sendEmail(mail)).rejects.toThrow('SMTP_SEND_FAILED');
  });
  it('does not propagate credentials from transport or diagnostic errors', async () => {
    mocks.sendMail.mockRejectedValue(new Error('AUTH user secret'));
    mocks.verify.mockRejectedValue(new Error('AUTH user secret'));
    await expect(new SmtpEmailProvider(config).sendEmail(mail)).rejects.toThrow(/^SMTP_SEND_FAILED$/);
    expect(await SmtpEmailProvider.verifyConfig(config)).toEqual({ ok: false, error: 'SMTP_VERIFICATION_FAILED' });
  });
  it('refuses even a directly instantiated mock in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(new MockEmailProvider().sendEmail(mail)).rejects.toThrow('EMAIL_MOCK_PROVIDER_DISABLED_IN_PRODUCTION');
  });
});
