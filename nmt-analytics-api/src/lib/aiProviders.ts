import { normalizeAiBaseUrl } from './aiUrlGuard';

export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';
export type AiProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'ollama_compatible';
export type AiAuthMethod = 'bearer' | 'x_api_key' | 'x_goog_api_key' | 'custom_header' | 'none';

export interface AiProviderConfig {
  providerType: AiProviderType;
  protocol?: AiProtocol;
  authMethod?: AiAuthMethod | string;
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
  routedModel?: string;
  reasoningText?: string | null;
  finishReason?: string | null;
  ttftMs?: number | null;
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

export function redactSecretTokens(raw: string): string {
  return String(raw || '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export async function extractUpstreamError(resp: Response, protocol: string): Promise<string> {
  let rawBody = '';
  try {
    rawBody = await resp.text();
  } catch {
    rawBody = '';
  }
  let detail = '';
  if (rawBody) {
    try {
      const parsed: any = JSON.parse(rawBody);
      detail = String(parsed?.error?.message || parsed?.message || parsed?.detail || parsed?.error || '');
    } catch {
      detail = rawBody;
    }
  }
  const cleanDetail = redactSecretTokens(detail);
  const suffix = cleanDetail ? `: ${cleanDetail}` : '';

  if (resp.status === 401 || resp.status === 403) {
    return `Invalid provider credentials (HTTP ${resp.status})${suffix}`;
  }
  if (resp.status === 404) {
    return `Invalid model or endpoint (HTTP 404)${suffix}`;
  }
  if (resp.status === 429) {
    return `Provider rate limit exceeded (HTTP 429)${suffix}`;
  }
  return `AI provider (${protocol}) HTTP ${resp.status}${suffix}`;
}

export function cleanModelText(
  rawContent: string | null | undefined,
  rawReasoning?: string | null,
): { text: string; reasoningText: string | null } {
  const source = typeof rawContent === 'string' ? rawContent : '';
  const extractedThink: string[] = [];

  if (rawReasoning && typeof rawReasoning === 'string' && rawReasoning.trim()) {
    extractedThink.push(rawReasoning.trim());
  }

  let stripped = source.replace(/<think>([\s\S]*?)<\/think>/gi, (_full, inner) => {
    const trimmedInner = String(inner || '').trim();
    if (trimmedInner) extractedThink.push(trimmedInner);
    return '';
  });

  // Also remove unclosed trailing <think>... blocks when truncated on reasoning models
  stripped = stripped.replace(/<think>([\s\S]*)$/i, (_full, inner) => {
    const trimmedInner = String(inner || '').trim();
    if (trimmedInner) extractedThink.push(trimmedInner);
    return '';
  });

  return {
    text: stripped.trim(),
    reasoningText: extractedThink.length > 0 ? extractedThink.join('\n\n') : null,
  };
}

function buildProviderAuthHeaders(
  protocol: AiProtocol,
  authMethod: string | undefined,
  apiKey: string,
  customHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(customHeaders || {}) };
  const method = authMethod || (
    protocol === 'anthropic_messages'
      ? 'x_api_key'
      : protocol === 'gemini_generate_content'
      ? 'x_goog_api_key'
      : 'bearer'
  );

  if (method === 'none') return headers;
  if (method === 'x_api_key') {
    headers['x-api-key'] = apiKey;
    if (protocol === 'anthropic_messages') headers['anthropic-version'] = '2023-06-01';
  } else if (method === 'x_goog_api_key') {
    headers['x-goog-api-key'] = apiKey;
  } else if (method === 'bearer') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (protocol === 'anthropic_messages') headers['anthropic-version'] = '2023-06-01';
  } else if (method === 'custom_header') {
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'authorization' || k.toLowerCase().includes('key')) && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }
  return headers;
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
  const timeoutMs = config.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = config.modelsEndpoint ? normalizeAiBaseUrl(config.modelsEndpoint) : `${base}/models`;
    if (protocol === 'ollama_compatible' && !config.modelsEndpoint) {
      url = `${base.replace(/\/v1$/, '')}/api/tags`;
    }
    const headers = buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders);

    const resp = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
    if (!resp.ok) {
      const msg = await extractUpstreamError(resp, protocol);
      return { supported: false, models: [], error: msg };
    }
    const data: any = await resp.json();

    const rawList: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
      ? data
      : [];

    const dedup = new Map<string, DiscoveredModel>();
    for (const item of rawList) {
      const rawId = String(item?.id || item?.name || '').replace(/^models\//, '').trim();
      if (!rawId || dedup.has(rawId)) continue;
      const meta = classifyModel(rawId);
      dedup.set(rawId, {
        modelId: rawId,
        displayName: String(item?.displayName || item?.display_name || rawId),
        category: meta.category,
        advertisedCapabilities: meta.advertisedCapabilities,
        contextWindow: Number(item?.context_length || item?.inputTokenLimit || 0) || null,
      });
    }

    return { supported: true, models: Array.from(dedup.values()) };
  } catch (err: any) {
    return {
      supported: false,
      models: [],
      error: err?.name === 'AbortError'
        ? `Model discovery timed out after ${timeoutMs}ms`
        : redactSecretTokens(err?.message || 'Discovery failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runOpenAiChatCompletionOnce(
  endpoint: string,
  config: AiProviderConfig,
  protocol: AiProtocol,
  req: AiCompletionRequest,
  includeResponseFormat: boolean,
  maxTokensOverride: number | undefined,
  messagesOverride: AiChatMessage[] | undefined,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  startedAt: number,
): Promise<{ ok: true; response: AiCompletionResponse } | { ok: false; status: number; error: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders),
  };

  const body: Record<string, any> = {
    model: config.model,
    messages: messagesOverride || req.messages,
    temperature: req.temperature ?? 0.2,
    max_tokens: maxTokensOverride ?? req.maxTokens ?? 1024,
  };
  if (includeResponseFormat && req.responseFormat === 'json_object') {
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
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const error = await extractUpstreamError(resp, protocol);
    return { ok: false, status: resp.status, error };
  }

  const data: any = await resp.json();
  const msg = data?.choices?.[0]?.message || {};
  const finishReason = data?.choices?.[0]?.finish_reason ? String(data.choices[0].finish_reason) : null;
  const cleaned = cleanModelText(msg.content, msg.reasoning_content || msg.reasoning);
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
    ok: true,
    response: {
      text: cleaned.text,
      provider: config.providerType,
      protocol,
      model: config.model,
      routedModel: data?.model ? String(data.model) : config.model,
      reasoningText: cleaned.reasoningText,
      finishReason,
      ttftMs: null,
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
    },
  };
}

export async function invokeAiCompletion(
  config: AiProviderConfig,
  req: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiCompletionResponse> {
  if (!config.apiKey?.trim() && config.authMethod !== 'none') throw new Error('AI provider API key is required');
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
      let attempt = await runOpenAiChatCompletionOnce(
        endpoint,
        config,
        protocol,
        req,
        req.responseFormat === 'json_object',
        undefined,
        undefined,
        fetchImpl,
        controller.signal,
        startedAt,
      );

      // JSON mode fallback: gateways like New-API / HCNSEC `auto` can reject `response_format`
      if (!attempt.ok && req.responseFormat === 'json_object' && (attempt.status === 400 || attempt.status === 422 || attempt.status === 500)) {
        attempt = await runOpenAiChatCompletionOnce(
          endpoint,
          config,
          protocol,
          req,
          false,
          undefined,
          undefined,
          fetchImpl,
          controller.signal,
          startedAt,
        );
      }

      if (!attempt.ok) {
        throw new Error(attempt.error);
      }

      // If reasoning model consumed entire token budget inside <think> leaving empty text, retry once with larger budget
      const initialTokens = req.maxTokens ?? 1024;
      if (!attempt.response.text && !attempt.response.toolCalls?.length && attempt.response.finishReason === 'length' && initialTokens < 3072 && !req.tools?.length) {
        const bumpedMax = Math.min(4096, Math.max(2048, initialTokens * 2));
        const boostedMessages: AiChatMessage[] = [
          ...req.messages,
          { role: 'system', content: 'Provide the final answer directly and concisely.' },
        ];
        const retry = await runOpenAiChatCompletionOnce(
          endpoint,
          config,
          protocol,
          req,
          false,
          bumpedMax,
          boostedMessages,
          fetchImpl,
          controller.signal,
          startedAt,
        );
        if (retry.ok && retry.response.text) {
          return retry.response;
        }
      }

      return attempt.response;
    }

    if (protocol === 'openai_responses') {
      const headers = {
        'Content-Type': 'application/json',
        ...buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders),
      };
      const resp = await fetchImpl(`${base}/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          input: req.messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: req.temperature ?? 0.2,
          max_output_tokens: req.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(await extractUpstreamError(resp, protocol));
      const data: any = await resp.json();
      const cleaned = cleanModelText(String(data?.output_text || data?.output?.[0]?.content?.[0]?.text || ''));
      const promptTokens = Number(data?.usage?.input_tokens ?? 0);
      const completionTokens = Number(data?.usage?.output_tokens ?? 0);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      return {
        text: cleaned.text,
        provider: config.providerType,
        protocol,
        model: config.model,
        routedModel: data?.model ? String(data.model) : config.model,
        reasoningText: cleaned.reasoningText,
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, providerReportedCostUsd: null },
        latencyMs,
        tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
      };
    }

    if (protocol === 'anthropic_messages') {
      const systemMsg = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const nonSystem = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const headers = {
        'Content-Type': 'application/json',
        ...buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders),
      };
      const resp = await fetchImpl(`${base}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
          ...(systemMsg ? { system: systemMsg } : {}),
          messages: nonSystem,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(await extractUpstreamError(resp, protocol));
      const data: any = await resp.json();
      const rawText = Array.isArray(data?.content)
        ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
        : '';
      const cleaned = cleanModelText(rawText);
      const promptTokens = Number(data?.usage?.input_tokens ?? 0);
      const completionTokens = Number(data?.usage?.output_tokens ?? 0);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      return {
        text: cleaned.text,
        provider: config.providerType,
        protocol,
        model: config.model,
        routedModel: data?.model ? String(data.model) : config.model,
        reasoningText: cleaned.reasoningText,
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
    const headers = {
      'Content-Type': 'application/json',
      ...buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders),
    };

    const resp = await fetchImpl(
      `${base}/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: 'POST',
        headers,
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
    if (!resp.ok) throw new Error(await extractUpstreamError(resp, protocol));
    const data: any = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const rawText = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? '').join('') : '';
    const cleaned = cleanModelText(rawText);
    const promptTokens = Number(data?.usageMetadata?.promptTokenCount ?? 0);
    const completionTokens = Number(data?.usageMetadata?.candidatesTokenCount ?? 0);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    return {
      text: cleaned.text,
      provider: config.providerType,
      protocol,
      model: config.model,
      routedModel: data?.modelVersion ? String(data.modelVersion) : config.model,
      reasoningText: cleaned.reasoningText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: Number(data?.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens),
        providerReportedCostUsd: null,
      },
      latencyMs,
      tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`AI provider request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function invokeAiCompletionStream(
  config: AiProviderConfig,
  req: AiCompletionRequest,
  onChunk: (delta: string) => void,
  fetchImpl: typeof fetch = fetch,
  externalSignal?: AbortSignal,
): Promise<AiCompletionResponse> {
  const protocol = resolveProtocol(config);
  if (protocol !== 'openai_chat_completions' && protocol !== 'ollama_compatible') {
    const res = await invokeAiCompletion(config, req, fetchImpl);
    if (res.text) onChunk(res.text);
    return res;
  }

  if (!config.apiKey?.trim() && config.authMethod !== 'none') throw new Error('AI provider API key is required');
  if (!config.model?.trim()) throw new Error('AI provider model is required');

  const base = resolveEndpointBase(config);
  const timeoutMs = config.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const startedAt = Date.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildProviderAuthHeaders(protocol, config.authMethod, config.apiKey, config.customHeaders),
    };
    const body: Record<string, any> = {
      model: config.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 1024,
      stream: true,
      stream_options: { include_usage: true },
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

    const resp = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      // Fallback if upstream rejects stream or stream_options
      if (resp.status === 400 || resp.status === 422 || resp.status === 500) {
        const res = await invokeAiCompletion(config, req, fetchImpl);
        if (res.text) onChunk(res.text);
        return res;
      }
      throw new Error(await extractUpstreamError(resp, protocol));
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/event-stream') || !resp.body) {
      const data: any = await resp.json();
      const msg = data?.choices?.[0]?.message || {};
      const cleaned = cleanModelText(msg.content, msg.reasoning_content || msg.reasoning);
      if (cleaned.text) onChunk(cleaned.text);
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const promptTokens = Number(data?.usage?.prompt_tokens ?? 0);
      const completionTokens = Number(data?.usage?.completion_tokens ?? 0);
      return {
        text: cleaned.text,
        provider: config.providerType,
        protocol,
        model: config.model,
        routedModel: data?.model ? String(data.model) : config.model,
        reasoningText: cleaned.reasoningText,
        ttftMs: latencyMs,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: Number(data?.usage?.total_tokens ?? promptTokens + completionTokens),
          providerReportedCostUsd: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
        },
        latencyMs,
        tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
      };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawContent = '';
    let rawReasoning = '';
    let routedModel = config.model;
    let ttftMs: number | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let cachedTokens: number | undefined;
    let providerReportedCostUsd: number | null = null;
    let inThinkTag = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payloadStr = trimmed.slice(5).trim();
        if (payloadStr === '[DONE]') continue;
        let evt: any;
        try {
          evt = JSON.parse(payloadStr);
        } catch {
          continue;
        }
        if (evt?.model) routedModel = String(evt.model);
        if (evt?.usage) {
          promptTokens = Number(evt.usage.prompt_tokens ?? promptTokens);
          completionTokens = Number(evt.usage.completion_tokens ?? completionTokens);
          totalTokens = Number(evt.usage.total_tokens ?? promptTokens + completionTokens);
          const c = Number(evt.usage.prompt_tokens_details?.cached_tokens ?? 0);
          if (c > 0) cachedTokens = c;
          if (typeof evt.usage.cost === 'number') providerReportedCostUsd = evt.usage.cost;
        }
        const delta = evt?.choices?.[0]?.delta || {};
        if (typeof delta.reasoning_content === 'string') {
          rawReasoning += delta.reasoning_content;
        }
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          rawContent += delta.content;
          let emit = delta.content;
          if (emit.includes('<think>')) {
            inThinkTag = true;
            emit = emit.split('<think>')[0];
          }
          if (inThinkTag) {
            if (delta.content.includes('</think>')) {
              inThinkTag = false;
              emit = delta.content.split('</think>').slice(1).join('</think>');
            } else {
              emit = '';
            }
          }
          if (emit) {
            if (ttftMs === null) ttftMs = Math.max(1, Date.now() - startedAt);
            onChunk(emit);
          }
        }
      }
    }

    const cleaned = cleanModelText(rawContent, rawReasoning);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    return {
      text: cleaned.text,
      provider: config.providerType,
      protocol,
      model: config.model,
      routedModel,
      reasoningText: cleaned.reasoningText,
      ttftMs,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: totalTokens || promptTokens + completionTokens,
        cachedTokens,
        providerReportedCostUsd,
      },
      latencyMs,
      tokensPerSec: completionTokens > 0 ? Number(((completionTokens / latencyMs) * 1000).toFixed(2)) : null,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(externalSignal?.aborted ? 'Request cancelled by user' : `AI provider request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}
