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

export interface SmsProviderConfig {
  provider: 'mock';
}

export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
  if (config.provider === 'mock') {
    return new MockSmsProvider();
  }

  throw new Error(`Unsupported SMS provider: ${(config as { provider?: string }).provider}`);
}

export class MockSmsProvider implements SmsProvider {
  async sendSms(options: SmsOptions): Promise<void> {
    console.log(`[MOCK SMS] To: ${options.to}`);
    console.log(`[MOCK SMS] From Name: ${options.fromName || ''}`);
    console.log(`[MOCK SMS] From Number: ${options.fromNumber || ''}`);
    console.log(`[MOCK SMS] Message: ${options.message}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export class SmsService {
  private static provider: SmsProvider = new MockSmsProvider();

  static setProvider(provider: SmsProvider) {
    this.provider = provider;
  }

  static async sendSms(options: SmsOptions) {
    return this.provider.sendSms(options);
  }

  static async sendManualMessage(options: SmsOptions & {
    orgId: string;
    relatedReservationId?: string | null;
    relatedDepartureId?: string | null;
  }) {
    try {
      await this.provider.sendSms(options);
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
        errorMessage: error?.message || 'sms_send_failed',
        relatedReservationId: options.relatedReservationId ?? null,
        relatedDepartureId: options.relatedDepartureId ?? null,
      });
      throw error;
    }
  }
}
