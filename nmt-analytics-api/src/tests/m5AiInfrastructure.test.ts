import { describe, it, expect, vi } from 'vitest';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/secretVault';
import { validateAiBaseUrl } from '../lib/aiUrlGuard';
import { invokeAiCompletion } from '../lib/aiProviders';

const TEST_MASTER_KEY = 'test-master-key-32-bytes-minimum!!';

describe('M5 Universal AI Infrastructure', () => {
  it('encryptSecret / decryptSecret roundtrip and reject tampering', () => {
    const plaintext = 'sk-live-super-secret-token-123456';
    const encrypted = encryptSecret(plaintext, TEST_MASTER_KEY);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted, TEST_MASTER_KEY)).toBe(plaintext);
    expect(maskSecret(plaintext)).toBe('sk-l...3456');

    const parts = encrypted.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:AAAA${parts[3].slice(4)}`;
    expect(() => decryptSecret(tampered, TEST_MASTER_KEY)).toThrow();
    expect(() => encryptSecret('abc', 'short')).toThrow();
  });

  it('validateAiBaseUrl blocks SSRF targets and allows valid HTTPS endpoints', () => {
    expect(validateAiBaseUrl('https://api.together.xyz/v1').hostname).toBe('api.together.xyz');
    expect(() => validateAiBaseUrl('http://api.openai.com/v1')).toThrow();
    expect(() => validateAiBaseUrl('https://localhost:8080/v1')).toThrow();
    expect(() => validateAiBaseUrl('https://127.0.0.1/v1')).toThrow();
    expect(() => validateAiBaseUrl('https://169.254.169.254/latest')).toThrow();
    expect(() => validateAiBaseUrl('https://10.0.0.5/v1')).toThrow();
    expect(() => validateAiBaseUrl('https://192.168.1.10/v1')).toThrow();
    expect(() => validateAiBaseUrl('https://user:pass@api.openai.com/v1')).toThrow();
  });

  it('invokeAiCompletion normalizes openai, anthropic, gemini, and openai_compatible responses', async () => {
    const openaiFetch = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: 'OpenAI reply' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), { status: 200 }),
    ) as unknown as typeof fetch;

    const openaiRes = await invokeAiCompletion(
      { providerType: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      { messages: [{ role: 'user', content: 'Hello' }] },
      openaiFetch,
    );
    expect(openaiRes.text).toBe('OpenAI reply');
    expect(openaiRes.usage.totalTokens).toBe(15);

    const anthropicFetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Claude reply' }],
        usage: { input_tokens: 12, output_tokens: 8 },
      }), { status: 200 }),
    ) as unknown as typeof fetch;

    const anthropicRes = await invokeAiCompletion(
      { providerType: 'anthropic', apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest' },
      { messages: [{ role: 'system', content: 'Sys' }, { role: 'user', content: 'Hello' }] },
      anthropicFetch,
    );
    expect(anthropicRes.text).toBe('Claude reply');
    expect(anthropicRes.usage.totalTokens).toBe(20);

    const geminiFetch = vi.fn(async () =>
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Gemini reply' }] } }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4, totalTokenCount: 11 },
      }), { status: 200 }),
    ) as unknown as typeof fetch;

    const geminiRes = await invokeAiCompletion(
      { providerType: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.5-flash' },
      { messages: [{ role: 'user', content: 'Hello' }] },
      geminiFetch,
    );
    expect(geminiRes.text).toBe('Gemini reply');
    expect(geminiRes.usage.totalTokens).toBe(11);

    const compatRes = await invokeAiCompletion(
      { providerType: 'openai_compatible', apiKey: 'compat-key', model: 'llama-3.3', baseUrl: 'https://api.groq.com/openai/v1' },
      { messages: [{ role: 'user', content: 'Hello' }] },
      openaiFetch,
    );
    expect(compatRes.provider).toBe('openai_compatible');
    expect(compatRes.text).toBe('OpenAI reply');
  });
});
