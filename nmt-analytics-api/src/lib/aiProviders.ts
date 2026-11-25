import { normalizeAiBaseUrl } from './aiUrlGuard';

export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';
export type AiProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'ollama_compatible';

export interface AiProviderConfig {
  providerType: AiProviderType;
  protocol?: AiProtocol;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  modelsEndpoint?: string | null;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  tools?: AiToolDefinition[];
}

export interface AiCompletionResponse {
  text: string;
  provider: AiProviderType;
  protocol: AiProtocol;
  model: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    providerReportedCostUsd?: number | null;
  };
  latencyMs: number;
  tokensPerSec: number | null;
}

export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  category: 'chat' | 'reasoning' | 'embedding' | 'audio_asr' | 'audio_tts' | 'vision' | 'other';
  advertisedCapabilities: {
    chat: boolean;
    streaming: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    reasoning: boolean;
    vision: boolean;
    embeddings: boolean;
    audioAsr: boolean;
    audioTts: boolean;
  };
  contextWindow: number | null;
}

const DEFAULT_BASE_URLS: Record<Exclude<AiProviderType, 'openai_compatible'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

function resolveProtocol(config: AiProviderConfig): AiProtocol {
  if (config.protocol) return config.protocol;
  if (config.providerType === 'anthropic') return 'anthropic_messages';
  if (config.providerType === 'gemini') return 'gemini_generate_content';
  return 'openai_chat_completions';
}

function resolveEndpointBase(config: AiProviderConfig): string {
  if (config.providerType === 'openai_compatible') {
    if (!config.baseUrl) throw new Error('Custom / OpenAI-compatible provider requires a baseUrl');
    return normalizeAiBaseUrl(config.baseUrl);
  }
  if (config.baseUrl) return normalizeAiBaseUrl(config.baseUrl);
  return DEFAULT_BASE_URLS[config.providerType];
}

export function classifyModel(modelId: string): Pick<DiscoveredModel, 'category' | 'advertisedCapabilities'> {
  const lower = modelId.toLowerCase();
  const isEmbed = lower.includes('embed') || lower.includes('bge-');
  const isAsr = lower.includes('asr') || lower.includes('whisper') || lower.includes('transcribe');
  const isTts = lower.includes('tts') || lower.includes('realtime') || lower.includes('speech');
  const isReasoning = lower.includes('o1') || lower.includes('o3') || lower.includes('reason') || lower.includes('r1');
  const isVision = lower.includes('vision') || lower.includes('vl') || lower.includes('4o') || lower.includes('gemini');

  let category: DiscoveredModel['category'] = 'chat';
  if (isEmbed) category = 'embedding';
  else if (isAsr) category = 'audio_asr';
  else if (isTts) category = 'audio_tts';
  else if (isReasoning) category = 'reasoning';
  else if (isVision && lower.includes('vision')) category = 'vision';

  const isChatCapable = !isEmbed && !isAsr && !isTts;
  return {
    category,
    advertisedCapabilities: {
      chat: isChatCapable,
      streaming: isChatCapable,
      toolCalling: isChatCapable && !lower.includes('lite'),
      structuredOutput: isChatCapable,
      reasoning: isReasoning,
      vision: isVision,
      embeddings: isEmbed,
      audioAsr: isAsr,
      audioTts: isTts,
    },
  };
}

export async function discoverAiModels(
  config: Omit<AiProviderConfig, 'model'>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ supported: boolean; models: DiscoveredModel[]; error?: string }> {
  const base = resolveEndpointBase({ ...config, model: 'discovery' });
  const protocol = resolveProtocol({ ...config, model: 'discovery' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 15000);

  try {
    let url = config.modelsEndpoint ? normalizeAiBaseUrl(config.modelsEndpoint) : `${base}/models`;
    const headers: Record<string, string> = { ...(config.customHeaders || {}) };

    if (protocol === 'anthropic_messages') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (protocol === 'gemini_generate_content') {
      headers['x-goog-api-key'] = config.apiKey;
    } else if (protocol === 'ollama_compatible') {
      url = `${base.replace(/\/v1$/, '')}/api/tags`;
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const resp = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
    if (!resp.ok) {
      return { supported: false, models: [], error: `Provider discovery returned HTTP ${resp.status}` };
    }
    const data: any = await resp.json();

    const rawList: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
      ? data
      : [];

    const models: DiscoveredModel[] = rawList
      .map((item: any) => {
        const rawId = String(item?.id || item?.name || '').replace(/^models\//, '').trim();
        if (!rawId) return null;
        const meta = classifyModel(rawId);
        return {
          modelId: rawId,
          displayName: String(item?.displayName || item?.display_name || rawId),
          category: meta.category,
          advertisedCapabilities: meta.advertisedCapabilities,
          contextWindow: Number(item?.context_length || item?.inputTokenLimit || 0) || null,
        };
      })
      .filter(Boolean) as DiscoveredModel[];

    return { supported: true, models };
  } catch (err: any) {
    return { supported: false, models: [], error: err?.name === 'AbortError' ? 'Discovery request timed out' : (err?.message || 'Discovery failed') };
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeAiCompletion(
  config: AiProviderConfig,
  req: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiCompletionResponse> {
  if (!config.apiKey?.trim()) throw new Error('AI provider API key is required');
  if (!config.model?.trim()) throw new Error('AI provider model is required');

  const base = resolveEndpointBase(config);
  const protocol = resolveProtocol(config);
  const timeoutMs = config.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    if (protocol === 'openai_chat_completions' || protocol === 'ollama_compatible') {
      const endpoint = `${base}/chat/completions`;
      const body: Record<string, any> = {
        model: config.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 1024,
      };
      if (req.responseFormat === 'json_object') {
        body.response_format = { type: 'json_object' };
      }
      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }

      const resp = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.customHeaders || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`AI provider (${protocol}) HTTP ${resp.status}`);
      const data: any = await resp.json();
      const msg = data?.choices?.[0]?.message || {};
      const text = String(msg.content ?? '');
      const toolCalls = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc: any) => ({
            id: String(tc.id || ''),
            name: String(tc.function?.name || ''),
            arguments: String(tc.function?.arguments || '{}'),
          }))
        : undefined;
      const promptTokens = Number(data?.usage?.prompt_tokens ?? 0);
      const completionTokens = Number(data?.usage?.completion_tokens ?? 0);
      const cachedTokens = Number(data?.usage?.prompt_tokens_details?.cached_tokens ?? 0) || undefined;
      const latencyMs = Math.max(1, Date.now() - startedAt);
      return {
        text,
        provider: config.providerType,
        protocol,
        model: config.model,
        toolCalls,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: Number(data?.usage?.total_tokens ?? promptTokens + completionTokens),
          cachedTokens,
          providerReportedCostUsd: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
        },
        latencyMs,
        tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
      };
    }

    if (protocol === 'openai_responses') {
      const resp = await fetchImpl(`${base}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.customHeaders || {}),
        },
        body: JSON.stringify({
          model: config.model,
          input: req.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: req.temperature ?? 0.2,
          max_output_tokens: req.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`AI provider (openai_responses) HTTP ${resp.status}`);
      const data: any = await resp.json();
      const text = String(data?.output_text || data?.output?.[0]?.content?.[0]?.text || '');
      const promptTokens = Number(data?.usage?.input_tokens ?? 0);
      const completionTokens = Number(data?.usage?.output_tokens ?? 0);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      return {
        text,
        provider: config.providerType,
        protocol,
        model: config.model,
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, providerReportedCostUsd: null },
        latencyMs,
        tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
      };
    }

    if (protocol === 'anthropic_messages') {
      const systemMsg = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const nonSystem = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const resp = await fetchImpl(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          ...(config.customHeaders || {}),
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
      if (!resp.ok) throw new Error(`AI provider (anthropic) HTTP ${resp.status}`);
      const data: any = await resp.json();
      const text = Array.isArray(data?.content)
        ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
        : '';
      const promptTokens = Number(data?.usage?.input_tokens ?? 0);
      const completionTokens = Number(data?.usage?.output_tokens ?? 0);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      return {
        text,
        provider: 'anthropic',
        protocol,
        model: config.model,
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, providerReportedCostUsd: null },
        latencyMs,
        tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
      };
    }

    // Gemini generateContent
    const systemMsg = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const resp = await fetchImpl(
      `${base}/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
          ...(config.customHeaders || {}),
        },
        body: JSON.stringify({
          ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
          contents,
          generationConfig: {
            temperature: req.temperature ?? 0.2,
            maxOutputTokens: req.maxTokens ?? 1024,
            ...(req.responseFormat === 'json_object' ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: controller.signal,
      },
    );
    if (!resp.ok) throw new Error(`AI provider (gemini) HTTP ${resp.status}`);
    const data: any = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : '';
    const promptTokens = Number(data?.usageMetadata?.promptTokenCount ?? 0);
    const completionTokens = Number(data?.usageMetadata?.candidatesTokenCount ?? 0);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    return {
      text,
      provider: 'gemini',
      protocol,
      model: config.model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: Number(data?.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens),
        providerReportedCostUsd: null,
      },
      latencyMs,
      tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
