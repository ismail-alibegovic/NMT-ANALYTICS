import { EmailService } from './EmailService';
import { SmtpEmailProvider } from './SmtpProvider';

export function activateSmtpProvider(): void {
  const smtpConfig = process.env.SMTP_CONFIG;

  if (smtpConfig) {
    try {
      const config = JSON.parse(smtpConfig);
      const provider = new SmtpEmailProvider(config);
      EmailService.setProvider(provider);
      console.log(`[SMTP] Provider activated: ${config.host}:${config.port}`);
    } catch {
      console.warn('[SMTP] Invalid SMTP_CONFIG JSON — using mock');
    }
  } else {
    console.log('[SMTP] SMTP_CONFIG not set — using mock email provider');
  }
}
