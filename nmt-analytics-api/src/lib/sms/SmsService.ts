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
}
