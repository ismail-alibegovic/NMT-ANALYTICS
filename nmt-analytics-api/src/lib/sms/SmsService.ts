import { z } from 'zod';
import { logCommunicationHistory } from '../communicationHistory';

export interface SmsOptions {
  to: string;
  message: string;
  fromName?: string | null;
  fromNumber?: string | null;
}

export interface SmsProvider {
  sendSms(options: SmsOptions): Promise<void>;
}

export const mockSmsConfigSchema = z.object({
  provider: z.literal('mock'),
});

export const twilioSmsConfigSchema = z.object({
  provider: z.literal('twilio'),
  accountSid: z.string().trim().optional(),
  authToken: z.string().trim().optional(),
  fromNumber: z.string().trim().optional(),
});

export const httpSmsConfigSchema = z.object({
  provider: z.literal('http'),
  endpoint: z.string().trim().url().optional(),
  apiKey: z.string().trim().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const smsConfigSchema = z.discriminatedUnion('provider', [
  mockSmsConfigSchema,
  twilioSmsConfigSchema,
  httpSmsConfigSchema,
]);

export type SmsProviderConfig = z.infer<typeof smsConfigSchema>;

export class MockSmsProvider implements SmsProvider {
  async sendSms(options: SmsOptions): Promise<void> {
    if (isProduction()) throw new Error('SMS_MOCK_PROVIDER_DISABLED_IN_PRODUCTION');
    console.log(`[MOCK SMS] To: ${options.to}`);
    console.log(`[MOCK SMS] From Name: ${options.fromName || ''}`);
    console.log(`[MOCK SMS] From Number: ${options.fromNumber || ''}`);
    console.log(`[MOCK SMS] Message: ${options.message}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Stand-in used in production wherever a mock would otherwise be selected. Throwing keeps
 * communication history honest: a mock must never record a delivery that did not happen.
 */
export class DisabledSmsProvider implements SmsProvider {
  constructor(private readonly reason: string) {}

  async sendSms(): Promise<void> {
    throw new Error(this.reason);
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export class TwilioSmsProvider implements SmsProvider {
  private config?: z.infer<typeof twilioSmsConfigSchema>;

  constructor(config?: z.infer<typeof twilioSmsConfigSchema>) {
    this.config = config;
  }

  async sendSms(options: SmsOptions): Promise<void> {
    const accountSid = this.config?.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = this.config?.authToken || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = options.fromNumber || this.config?.fromNumber || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials (accountSid and authToken) are not configured');
    }
    if (!fromNumber) {
      throw new Error('Twilio sender phone number is not configured');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('To', options.to);
    params.append('From', fromNumber);
    params.append('Body', options.message);

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }).catch(() => { throw new Error('SMS_TRANSPORT_FAILED'); });

    if (!response.ok) {
      throw new Error(`SMS_PROVIDER_REJECTED_${response.status}`);
    }
  }
}

export class HttpSmsProvider implements SmsProvider {
  private config?: z.infer<typeof httpSmsConfigSchema>;

  constructor(config?: z.infer<typeof httpSmsConfigSchema>) {
    this.config = config;
  }

  async sendSms(options: SmsOptions): Promise<void> {
    const endpoint = this.config?.endpoint || process.env.SMS_HTTP_ENDPOINT;
    const apiKey = this.config?.apiKey || process.env.SMS_HTTP_API_KEY;

    if (!endpoint) {
      throw new Error('HTTP SMS endpoint is not configured');
    }

    const target = new URL(endpoint);
    if (target.username || target.password || (isProduction() && target.protocol !== 'https:')) {
      throw new Error('SMS_ENDPOINT_INVALID');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config?.headers || {}),
    };

    if (apiKey && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const payload = {
      to: options.to,
      message: options.message,
      fromName: options.fromName,
      fromNumber: options.fromNumber,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers,
      body: JSON.stringify(payload),
    }).catch(() => { throw new Error('SMS_TRANSPORT_FAILED'); });

    if (!response.ok) {
      throw new Error(`SMS_PROVIDER_REJECTED_${response.status}`);
    }
  }
}

export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
  switch (config.provider) {
    case 'mock':
      return isProduction()
        ? new DisabledSmsProvider('SMS_MOCK_PROVIDER_DISABLED_IN_PRODUCTION')
        : new MockSmsProvider();
    case 'twilio':
      return new TwilioSmsProvider(config);
    case 'http':
      return new HttpSmsProvider(config);
    default:
      throw new Error(`Unsupported SMS provider: ${(config as any)?.provider}`);
  }
}

export class SmsService {
  // Platform default. Only a real provider chosen per send (or at boot) may deliver in production.
  private static provider: SmsProvider = isProduction()
    ? new DisabledSmsProvider('SMS_PROVIDER_NOT_CONFIGURED')
    : new MockSmsProvider();

  /** Boot-time platform provider only. Never call this from a tenant-scoped request. */
  static setProvider(provider: SmsProvider) {
    this.provider = provider;
  }

  static getProvider(): SmsProvider {
    return this.provider;
  }

  static async sendSms(options: SmsOptions, provider?: SmsProvider) {
    return (provider ?? this.provider).sendSms(options);
  }

  static async sendManualMessage(options: SmsOptions & {
    orgId: string;
    relatedReservationId?: string | null;
    relatedDepartureId?: string | null;
  }, provider?: SmsProvider) {
    try {
      await (provider ?? this.provider).sendSms(options);
      await logCommunicationHistory({
        orgId: options.orgId,
        channel: 'sms',
        recipient: options.to,
        bodyPreview: options.message,
        status: 'sent',
        relatedReservationId: options.relatedReservationId ?? null,
        relatedDepartureId: options.relatedDepartureId ?? null,
        sentAt: new Date(),
      });
    } catch (error: any) {
      await logCommunicationHistory({
        orgId: options.orgId,
        channel: 'sms',
        recipient: options.to,
        bodyPreview: options.message,
        status: 'failed',
        errorMessage: 'SMS_SEND_FAILED',
        relatedReservationId: options.relatedReservationId ?? null,
        relatedDepartureId: options.relatedDepartureId ?? null,
      });
      throw error;
    }
  }
}

