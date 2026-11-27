import { describe, it, expect, vi } from 'vitest';
import { normalizeAiBaseUrl } from '../lib/aiUrlGuard';
import { classifyModel, discoverAiModels, invokeAiCompletion } from '../lib/aiProviders';
import { computeCostAccounting } from '../lib/aiProviderService';
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

  it('discoverAiModels deduplicates model IDs and surfaces sanitized errors', async () => {
    const okFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'auto' },
            { id: 'DeepSeek-V4.1-Flash' },
            { id: 'DeepSeek-V4.1-Flash' },
            { id: 'Qwen3-Embedding-8B' },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const ok = await discoverAiModels(
      { providerType: 'openai_compatible', apiKey: 'test-key', baseUrl: 'https://api.hcnsec.cn/v1/chat/completions' },
      okFetch,
    );
    expect(ok.supported).toBe(true);
    expect(ok.models).toHaveLength(3);
    expect(ok.models[2].category).toBe('embedding');

    const failFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid token sk-secretvalue123456789' } }), { status: 401 }),
    ) as unknown as typeof fetch;
    const fail = await discoverAiModels(
      { providerType: 'openai_compatible', apiKey: 'bad-key', baseUrl: 'https://api.hcnsec.cn/v1' },
      failFetch,
    );
    expect(fail.supported).toBe(false);
    expect(fail.error).toContain('Invalid provider credentials (HTTP 401)');
    expect(fail.error).not.toContain('sk-secretvalue123456789');
  });

  it('invokeAiCompletion strips <think> tags, captures routedModel, and falls back when json_object causes upstream 500', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_url, init) => {
      callCount++;
      const parsedBody = JSON.parse(String(init?.body || '{}'));
      if (callCount === 1 && parsedBody.response_format) {
        return new Response(JSON.stringify({ error: { message: 'response_format unsupported for auto' } }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          model: 'DeepSeek-V4.1-Flash',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '<think>Internal planning</think>{"name":"Istanbul Proljece"}',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await invokeAiCompletion(
      {
        providerType: 'openai_compatible',
        protocol: 'openai_chat_completions',
        apiKey: 'test-key-1234',
        model: 'auto',
        baseUrl: 'https://api.hcnsec.cn/v1',
      },
      {
        messages: [{ role: 'user', content: 'Draft Istanbul package' }],
        responseFormat: 'json_object',
      },
      fetchMock,
    );

    expect(callCount).toBe(2);
    expect(result.routedModel).toBe('DeepSeek-V4.1-Flash');
    expect(result.text).toBe('{"name":"Istanbul Proljece"}');
    expect(result.reasoningText).toBe('Internal planning');
  });

  it('computeCostAccounting distinguishes unknown pricing (null) from genuine zero cost (0)', () => {
    const unknownCost = computeCostAccounting(null, { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(unknownCost.costStatus).toBe('unknown');
    expect(unknownCost.estimatedCostUsd).toBeNull();

    const freeCost = computeCostAccounting({ pricing_type: 'free' }, { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(freeCost.costStatus).toBe('zero_cost');
    expect(freeCost.estimatedCostUsd).toBe(0);
  });

  it('standard subscription plans (trial, starter, pro, enterprise) do not auto-grant ai_assistant', () => {
    expect(PLAN_MODULE_MAP.trial.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.starter.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.pro.has('ai_assistant')).toBe(false);
    expect(PLAN_MODULE_MAP.enterprise.has('ai_assistant')).toBe(false);
  });
});
