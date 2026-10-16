import nodemailer from 'nodemailer';
import type { EmailProvider, EmailOptions } from './EmailService';
import { parseSmtpConfig, type SmtpConfig } from './smtpConfig';
export type { SmtpConfig } from './smtpConfig';

export class SmtpEmailProvider implements EmailProvider {
  private config: SmtpConfig;

  constructor(config?: SmtpConfig) {
    let candidate: unknown = config;
    if (!candidate) {
      try { candidate = JSON.parse(process.env.SMTP_CONFIG || 'null'); }
      catch { throw new Error('SMTP_CONFIGURATION_INVALID'); }
    }
    this.config = parseSmtpConfig(candidate);
  }

  private getTransporter() {
    return nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure ?? this.config.port === 465,
      // Submission port must negotiate TLS; local capture servers may use another port.
      requireTLS: this.config.requireTLS ?? this.config.port === 587,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: this.config.user, pass: this.config.pass },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const result = await this.getTransporter().sendMail({
        from: { name: this.config.fromName || 'Travline', address: this.config.fromEmail || this.config.user },
        to: options.to,
        subject: options.subject,
        text: options.body,
        disableFileAccess: true,
        disableUrlAccess: true,
        attachments: options.attachments?.map(a => ({
          filename: a.filename, content: a.content, contentType: a.contentType,
        })),
      });
      // SMTP acceptance is not confirmation of inbox delivery.
      if (!result.accepted?.length || result.rejected?.length) {
        throw new Error('SMTP_RECIPIENT_REJECTED');
      }
    } catch {
      // Transport errors can contain auth credentials, addresses and server responses.
      throw new Error('SMTP_SEND_FAILED');
    }
  }

  static async verifyConfig(config: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      await new SmtpEmailProvider(config).getTransporter().verify();
      return { ok: true };
    } catch {
      return { ok: false, error: 'SMTP_VERIFICATION_FAILED' };
    }
  }
}

export const SmtpProvider = SmtpEmailProvider;
