import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockSmsProvider,
  TwilioSmsProvider,
  HttpSmsProvider,
  createSmsProvider,
  SmsService,
} from '../lib/sms/SmsService';

describe('SmsService and Providers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_PHONE_NUMBER;
    delete process.env.SMS_HTTP_ENDPOINT;
    delete process.env.SMS_HTTP_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('MockSmsProvider', () => {
    it('successfully sends simulated sms', async () => {
      const provider = new MockSmsProvider();
      await expect(
        provider.sendSms({
          to: '+38761123456',
          message: 'Hello Travline',
          fromName: 'Travline',
          fromNumber: '+38761111222',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('TwilioSmsProvider', () => {
    it('throws error when credentials are not configured', async () => {
      const provider = new TwilioSmsProvider({ provider: 'twilio' });
      await expect(
        provider.sendSms({ to: '+38761123456', message: 'Hello' })
      ).rejects.toThrow('Twilio credentials (accountSid and authToken) are not configured');
    });

    it('throws error when sender phone number is missing', async () => {
      const provider = new TwilioSmsProvider({
        provider: 'twilio',
        accountSid: 'AC12345',
        authToken: 'auth5678',
      });
      await expect(
        provider.sendSms({ to: '+38761123456', message: 'Hello' })
      ).rejects.toThrow('Twilio sender phone number is not configured');
    });

    it('formats Twilio request properly and calls fetch with Basic auth', async () => {
      let requestedUrl = '';
      let requestedHeaders: Record<string, string> = {};
      let requestedBody = '';

      global.fetch = vi.fn(async (url: any, init: any) => {
        requestedUrl = String(url);
        requestedHeaders = init.headers;
        requestedBody = init.body;
        return {
          ok: true,
          status: 201,
          json: async () => ({ sid: 'SM123' }),
          text: async () => JSON.stringify({ sid: 'SM123' }),
        } as any;
      });

      const provider = new TwilioSmsProvider({
        provider: 'twilio',
        accountSid: 'AC_MY_ACCOUNT',
        authToken: 'SECRET_TOKEN',
        fromNumber: '+1234567890',
      });

      await provider.sendSms({
        to: '+38761123456',
        message: 'Your booking is confirmed.',
      });

      expect(requestedUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_MY_ACCOUNT/Messages.json');
      const expectedAuth = 'Basic ' + Buffer.from('AC_MY_ACCOUNT:SECRET_TOKEN').toString('base64');
      expect(requestedHeaders['Authorization']).toBe(expectedAuth);
      expect(requestedHeaders['Content-Type']).toBe('application/x-www-form-urlencoded');

      const params = new URLSearchParams(requestedBody);
      expect(params.get('To')).toBe('+38761123456');
      expect(params.get('From')).toBe('+1234567890');
      expect(params.get('Body')).toBe('Your booking is confirmed.');
    });

    it('extracts error message from Twilio error response', async () => {
      global.fetch = vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ code: 21211, message: 'Invalid phone number' }),
        } as any;
      });

      const provider = new TwilioSmsProvider({
        provider: 'twilio',
        accountSid: 'AC_ACC',
        authToken: 'TOKEN',
        fromNumber: '+1234567890',
      });

      await expect(
        provider.sendSms({ to: '+000', message: 'Fail' })
      ).rejects.toThrow('SMS_PROVIDER_REJECTED_400');
    });

    it('uses environment variables when options are omitted', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC_ENV_ACC';
      process.env.TWILIO_AUTH_TOKEN = 'ENV_TOKEN';
      process.env.TWILIO_FROM_NUMBER = '+1999888777';

      let requestedUrl = '';
      global.fetch = vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return { ok: true, status: 201, text: async () => '{}' } as any;
      });

      const provider = new TwilioSmsProvider({ provider: 'twilio' });
      await provider.sendSms({ to: '+38761123456', message: 'Env test' });

      expect(requestedUrl).toContain('AC_ENV_ACC');
    });
  });

  describe('HttpSmsProvider', () => {
    it('throws error when endpoint is not configured', async () => {
      const provider = new HttpSmsProvider({ provider: 'http' });
      await expect(
        provider.sendSms({ to: '+38761123456', message: 'Hello' })
      ).rejects.toThrow('HTTP SMS endpoint is not configured');
    });

    it('sends JSON payload and headers correctly', async () => {
      let requestedHeaders: Record<string, string> = {};
      let requestedBody: any = null;

      global.fetch = vi.fn(async (_url: any, init: any) => {
        requestedHeaders = init.headers;
        requestedBody = JSON.parse(init.body);
        return { ok: true, status: 200, text: async () => '{}' } as any;
      });

      const provider = new HttpSmsProvider({
        provider: 'http',
        endpoint: 'https://sms.infobip.com/api/v1/send',
        apiKey: 'SECRET_API_KEY',
      });

      await provider.sendSms({
        to: '+38761123456',
        message: 'Your departure is tomorrow at 08:00.',
        fromName: 'Travline',
        fromNumber: '+38761111222',
      });

      expect(requestedHeaders['Authorization']).toBe('Bearer SECRET_API_KEY');
      expect(requestedHeaders['Content-Type']).toBe('application/json');
      expect(requestedBody).toEqual({
        to: '+38761123456',
        message: 'Your departure is tomorrow at 08:00.',
        fromName: 'Travline',
        fromNumber: '+38761111222',
      });
    });

    it('handles HTTP gateway error status', async () => {
      global.fetch = vi.fn(async () => {
        return {
          ok: false,
          status: 502,
          text: async () => JSON.stringify({ error: 'Gateway unavailable' }),
        } as any;
      });

      const provider = new HttpSmsProvider({
        provider: 'http',
        endpoint: 'https://gateway.example.com/send',
      });

      await expect(
        provider.sendSms({ to: '+38761123456', message: 'Test' })
      ).rejects.toThrow('SMS_PROVIDER_REJECTED_502');
    });
  });

  describe('createSmsProvider factory', () => {
    it('creates MockSmsProvider', () => {
      const provider = createSmsProvider({ provider: 'mock' });
      expect(provider).toBeInstanceOf(MockSmsProvider);
    });

    it('creates TwilioSmsProvider', () => {
      const provider = createSmsProvider({ provider: 'twilio' });
      expect(provider).toBeInstanceOf(TwilioSmsProvider);
    });

    it('creates HttpSmsProvider', () => {
      const provider = createSmsProvider({ provider: 'http' });
      expect(provider).toBeInstanceOf(HttpSmsProvider);
    });
  });
});

