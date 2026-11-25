import { validateAiBaseUrl } from './aiUrlGuard';

export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';

export interface AiProviderConfig {
  providerType: AiProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  timeoutMs?: number;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResponse {
  text: string;
  provider: AiProviderType;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

const DEFAULT_BASE_URLS: Record<Exclude<AiProviderType, 'openai_compatible'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

function resolveEndpointBase(config: AiProviderConfig): string {
  if (config.providerType === 'openai_compatible') {
    if (!config.baseUrl) {
      throw new Error('openai_compatible provider requires a baseUrl');
    }
    return validateAiBaseUrl(config.baseUrl).toString().replace(/\/+$/, '');
  }
  if (config.baseUrl) {
    return validateAiBaseUrl(config.baseUrl).toString().replace(/\/+$/, '');
  }
  return DEFAULT_BASE_URLS[config.providerType];
}

export async function invokeAiCompletion(
  config: AiProviderConfig,
  req: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiCompletionResponse> {
  if (!config.apiKey?.trim()) {
    throw new Error('AI provider API key is required');
  }
  if (!config.model?.trim()) {
    throw new Error('AI provider model is required');
  }

  const base = resolveEndpointBase(config);
  const timeoutMs = config.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    if (config.providerType === 'openai' || config.providerType === 'openai_compatible') {
      const resp = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`AI provider (${config.providerType}) HTTP ${resp.status}`);
      }
      const data: any = await resp.json();
      const text = String(data?.choices?.[0]?.message?.content ?? '');
      const promptTokens = Number(data?.usage?.prompt_tokens ?? 0);
      const completionTokens = Number(data?.usage?.completion_tokens ?? 0);
      return {
        text,
        provider: config.providerType,
        model: config.model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: Number(data?.usage?.total_tokens ?? promptTokens + completionTokens),
        },
        latencyMs: Date.now() - startedAt,
      };
    }

    if (config.providerType === 'anthropic') {
      const systemMsg = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const nonSystem = req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetchImpl(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
          ...(systemMsg ? { system: systemMsg } : {}),
          messages: nonSystem,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`AI provider (anthropic) HTTP ${resp.status}`);
      }
      const data: any = await resp.json();
      const text = Array.isArray(data?.content)
        ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
        : '';
      const promptTokens = Number(data?.usage?.input_tokens ?? 0);
      const completionTokens = Number(data?.usage?.output_tokens ?? 0);
      return {
        text,
        provider: 'anthropic',
        model: config.model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs: Date.now() - startedAt,
      };
    }

    // Gemini generateContent
    const systemMsg = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const resp = await fetchImpl(
      `${base}/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
          contents,
          generationConfig: {
            temperature: req.temperature ?? 0.2,
            maxOutputTokens: req.maxTokens ?? 1024,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!resp.ok) {
      throw new Error(`AI provider (gemini) HTTP ${resp.status}`);
    }
    const data: any = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : '';
    const promptTokens = Number(data?.usageMetadata?.promptTokenCount ?? 0);
    const completionTokens = Number(data?.usageMetadata?.candidatesTokenCount ?? 0);
    return {
      text,
      provider: 'gemini',
      model: config.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: Number(data?.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens),
      },
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
