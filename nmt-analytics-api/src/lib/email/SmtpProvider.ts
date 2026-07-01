import nodemailer from 'nodemailer';
import { EmailProvider, EmailOptions } from './EmailService';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromName?: string;
  fromEmail?: string;
}

export class SmtpEmailProvider implements EmailProvider {
  private config: SmtpConfig;

  constructor(config?: SmtpConfig) {
    if (config) {
      this.config = config;
    } else {
      this.config = this.getStoredConfig() || { host: '', port: 587, secure: false, user: '', pass: '' };
    }
  }

  private getStoredConfig(): SmtpConfig | null {
    try {
      const raw = process.env.SMTP_CONFIG;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private getTransporter() {
    if (!this.config || !this.config.host || !this.config.user) {
      throw new Error('SMTP not configured');
    }
    return nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure ?? this.config.port === 465,
      auth: { user: this.config.user, pass: this.config.pass },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.config.host || !this.config.user) {
      console.warn('[SMTP] Not configured — using mock');
      console.log(`[MOCK EMAIL] To: ${options.to}, Subject: ${options.subject}`);
      return;
    }

    const transporter = this.getTransporter();
    const fromName = this.config.fromName || 'Travline';
    const fromEmail = this.config.fromEmail || this.config.user;

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[SMTP] Email sent to ${options.to}: ${options.subject}`);
  }

  static async verifyConfig(config: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure ?? config.port === 465,
        auth: { user: config.user, pass: config.pass },
      });
      await transporter.verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

// Alias for backward compatibility
export const SmtpProvider = SmtpEmailProvider;
