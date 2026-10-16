import { EmailService, MockEmailProvider, UnconfiguredEmailProvider } from './EmailService';
import { SmtpEmailProvider } from './SmtpProvider';

let smtpProviderConfigured = false;

export function isSmtpProviderConfigured(): boolean {
  return smtpProviderConfigured;
}

function useFallback(reason: string): void {
  smtpProviderConfigured = false;
  if (process.env.NODE_ENV === 'production') {
    // Never fake deliveries in production: transactional sends fail visibly instead.
    EmailService.setProvider(new UnconfiguredEmailProvider());
    console.error(`[SMTP] ${reason} — outbound transactional email is DISABLED in production`);
  } else {
    EmailService.setProvider(new MockEmailProvider());
    console.log(`[SMTP] ${reason} — using mock email provider`);
  }
}

export function activateSmtpProvider(): void {
  const smtpConfig = process.env.SMTP_CONFIG;

  if (!smtpConfig) {
    useFallback('SMTP_CONFIG not set');
    return;
  }

  try {
    const config = JSON.parse(smtpConfig);
    const provider = new SmtpEmailProvider(config);
    EmailService.setProvider(provider);
    smtpProviderConfigured = true;
    console.log(`[SMTP] Provider activated: ${config.host}:${config.port}`);
  } catch {
    useFallback('Invalid SMTP_CONFIG JSON');
  }
}
