import { describe, it, expect, vi } from 'vitest';
import { normalizeAiBaseUrl } from '../lib/aiUrlGuard';
import { classifyModel, discoverAiModels } from '../lib/aiProviders';
import { PLAN_MODULE_MAP } from '../lib/planModules';

describe('Gap Closure — Universal AI Harness, URL Normalization & Entitlement Separation', () => {
  it('normalizeAiBaseUrl strips trailing /chat/completions to prevent duplicate path segments', () => {
    expect(normalizeAiBaseUrl('https://api.hcnsec.cn/v1/chat/completions')).toBe('https://api.hcnsec.cn/v1');
    expect(normalizeAiBaseUrl('https://api.hcnsec.cn/v1/')).toBe('https://api.hcnsec.cn/v1');
    expect(() => normalizeAiBaseUrl('http://api.hcnsec.cn/v1')).toThrow();
  });

  it('classifyModel distinguishes chat, reasoning, embedding, and audio ASR/TTS models', () => {
    expect(classifyModel('DeepSeek-V4.1-Flash').category).toBe('chat');
    expect(classifyModel('Qwen3-Embedding-8B').category).toBe('embedding');
    expect(classifyModel('Qwen3-Embedding-8B').advertisedCapabilities.chat).toBe(false);
    expect(classifyModel('stepaudio-2.5-asr').category).toBe('audio_asr');
    expect(classifyModel('stepaudio-2.5-realtime').category).toBe('audio_tts');
  });

  it('discoverAiModels parses OpenAI-compatible /models list and surfaces sanitized errors', async () => {
    const okFetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'auto' }, { id: 'DeepSeek-V4.1-Flash' }, { id: 'Qwen3-Embedding-8B' }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const ok = await discoverAiModels(
      { providerType: 'openai_compatible', apiKey: 'test-key', baseUrl: 'https://api.hcnsec.cn/v1/chat/completions' },
      okFetch,
    );
    expect(ok.supported).toBe(true);
    expect(ok.models).toHaveLength(3);
    expect(ok.models[2].category).toBe('embedding');

    const failFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;
    const fail = await discoverAiModels(
      { providerType: 'openai_compatible', apiKey: 'bad-key', baseUrl: 'https://api.hcnsec.cn/v1' },
      failFetch,
    );
    expect(fail.supported).toBe(false);
    expect(fail.error).toContain('HTTP 401');
  });

  it('standard subscription plans (trial, starter, pro, enterprise) do not auto-grant ai_assistant', () => {
    expect(PLAN_MODULE_MAP.trial.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.starter.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.pro.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.enterprise.has('ai_assistant')).toBe(false);
  });
});
