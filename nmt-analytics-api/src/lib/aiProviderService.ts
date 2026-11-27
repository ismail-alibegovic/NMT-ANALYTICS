import { supabaseAdmin } from './supabase';
import { decryptSecret } from './secretVault';
import {
  invokeAiCompletion,
  invokeAiCompletionStream,
  redactSecretTokens,
  type AiCompletionRequest,
  type AiCompletionResponse,
  type AiProtocol,
  type AiProviderType,
} from './aiProviders';

export interface SafeAiProviderDto {
  id: string;
  scope: 'platform' | 'org';
  orgId: string | null;
  providerSlug: string | null;
  providerType: AiProviderType;
  protocol: AiProtocol;
  authMethod: string;
  displayName: string;
  baseUrl: string | null;
  modelsEndpoint: string | null;
  keyHint: string;
  defaultModel: string;
  fallbackModel: string | null;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  isDefault: boolean;
  isFallback: boolean;
  isActive: boolean;
  priority: number;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedAiProvider {
  id: string;
  scope: 'platform' | 'org';
  providerType: AiProviderType;
  protocol: AiProtocol;
  authMethod?: string;
  apiKey: string;
  model: string;
  fallbackModel?: string | null;
  baseUrl: string | null;
  customHeaders?: Record<string, string>;
  timeoutMs: number;
  maxOutputTokens?: number;
}

export function sanitizeAiProviderRow(row: any): SafeAiProviderDto {
  return {
    id: row.id,
    scope: row.scope,
    orgId: row.org_id ?? null,
    providerSlug: row.provider_slug ?? null,
    providerType: row.provider_type,
    protocol: row.protocol || 'openai_chat_completions',
    authMethod: row.auth_method || 'bearer',
    displayName: row.display_name,
    baseUrl: row.base_url ?? null,
    modelsEndpoint: row.models_endpoint ?? null,
    keyHint: row.key_hint,
    defaultModel: row.default_model,
    fallbackModel: row.fallback_model ?? null,
    connectTimeoutMs: Number(row.connect_timeout_ms ?? 10000),
    requestTimeoutMs: Number(row.request_timeout_ms ?? 30000),
    maxOutputTokens: Number(row.max_output_tokens ?? 2048),
    isDefault: Boolean(row.is_default),
    isFallback: Boolean(row.is_fallback),
    isActive: Boolean(row.is_active),
    priority: Number(row.priority ?? 100),
    lastTestedAt: row.last_tested_at ?? null,
    lastTestStatus: row.last_test_status ?? null,
    lastTestError: row.last_test_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseEncryptedCustomHeaders(encrypted: string | null | undefined): Record<string, string> | undefined {
  if (!encrypted) return undefined;
  try {
    const parsed = JSON.parse(decryptSecret(encrypted));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function resolveDefaultCatalogModel(providerId: string, fallbackModelId: string, purpose: 'chat' | 'tools'): Promise<string> {
  try {
    const col = purpose === 'tools' ? 'is_default_tools' : 'is_default_chat';
    const { data } = await supabaseAdmin
      .from('ai_models')
      .select('model_id')
      .eq('provider_id', providerId)
      .eq('is_enabled', true)
      .eq(col, true)
      .limit(1)
      .maybeSingle();
    if (data?.model_id) return String(data.model_id);
  } catch {
    // Non-blocking fallback to provider default_model
  }
  return fallbackModelId;
}

function hydrateProviderRow(row: any, modelId: string): ResolvedAiProvider {
  return {
    id: row.id,
    scope: row.scope,
    providerType: row.provider_type,
    protocol: row.protocol || 'openai_chat_completions',
    authMethod: row.auth_method || 'bearer',
    apiKey: decryptSecret(row.encrypted_api_key),
    model: modelId,
    fallbackModel: row.fallback_model ?? null,
    baseUrl: row.base_url ?? null,
    customHeaders: parseEncryptedCustomHeaders(row.custom_headers_encrypted),
    timeoutMs: Number(row.request_timeout_ms ?? 30000),
    maxOutputTokens: Number(row.max_output_tokens ?? 2048),
  };
}

const PROVIDER_SELECT_COLS =
  'id, scope, provider_type, protocol, auth_method, base_url, encrypted_api_key, custom_headers_encrypted, default_model, fallback_model, request_timeout_ms, max_output_tokens, priority, is_default, is_fallback';

export async function resolveActiveAiProvider(
  orgId: string,
  purpose: 'chat' | 'tools' = 'chat',
): Promise<ResolvedAiProvider | null> {
  const { data: orgRows } = await supabaseAdmin
    .from('ai_providers')
    .select(PROVIDER_SELECT_COLS)
    .eq('scope', 'org')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true })
    .limit(1);

  const chosen = (orgRows && orgRows[0]) || null;
  if (chosen) {
    const model = await resolveDefaultCatalogModel(chosen.id, chosen.default_model, purpose);
    return hydrateProviderRow(chosen, model);
  }

  const { data: platformRows } = await supabaseAdmin
    .from('ai_providers')
    .select(PROVIDER_SELECT_COLS)
    .eq('scope', 'platform')
    .is('org_id', null)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true })
    .limit(1);

  const fallback = (platformRows && platformRows[0]) || null;
  if (!fallback) return null;

  const model = await resolveDefaultCatalogModel(fallback.id, fallback.default_model, purpose);
  return hydrateProviderRow(fallback, model);
}

async function resolveFallbackPlatformProvider(excludeId: string, purpose: 'chat' | 'tools'): Promise<ResolvedAiProvider | null> {
  try {
    const { data: rows } = await supabaseAdmin
      .from('ai_providers')
      .select(PROVIDER_SELECT_COLS)
      .eq('scope', 'platform')
      .is('org_id', null)
      .eq('is_active', true)
      .eq('is_fallback', true)
      .neq('id', excludeId)
      .order('priority', { ascending: true })
      .limit(1);
    const row = rows && rows[0];
    if (!row) return null;
    const model = await resolveDefaultCatalogModel(row.id, row.default_model, purpose);
    return hydrateProviderRow(row, model);
  } catch {
    return null;
  }
}

export function computeCostAccounting(
  modelRow: any | null,
  usage: AiCompletionResponse['usage'],
): { costStatus: 'provider_reported' | 'estimated' | 'zero_cost' | 'unknown'; estimatedCostUsd: number | null; actualCostUsd: number | null } {
  if (typeof usage.providerReportedCostUsd === 'number') {
    return {
      costStatus: 'provider_reported',
      estimatedCostUsd: usage.providerReportedCostUsd,
      actualCostUsd: usage.providerReportedCostUsd,
    };
  }
  if (!modelRow || modelRow.pricing_type === 'unknown') {
    return { costStatus: 'unknown', estimatedCostUsd: null, actualCostUsd: null };
  }
  if (modelRow.pricing_type === 'free') {
    return { costStatus: 'zero_cost', estimatedCostUsd: 0, actualCostUsd: 0 };
  }
  if (modelRow.pricing_type === 'per_request') {
    const cost = Number(modelRow.per_request_cost_usd ?? 0);
    return { costStatus: 'estimated', estimatedCostUsd: cost, actualCostUsd: null };
  }
  const inCost = (usage.promptTokens / 1_000_000) * Number(modelRow.input_cost_per_1m ?? 0);
  const outCost = (usage.completionTokens / 1_000_000) * Number(modelRow.output_cost_per_1m ?? 0);
  return {
    costStatus: 'estimated',
    estimatedCostUsd: Number((inCost + outCost).toFixed(6)),
    actualCostUsd: null,
  };
}

async function recordUsageSuccess(
  orgId: string,
  userId: string | null,
  provider: ResolvedAiProvider,
  featureKey: string,
  result: AiCompletionResponse,
) {
  const effectiveModel = result.routedModel || provider.model;
  const { data: modelRow } = await supabaseAdmin
    .from('ai_models')
    .select('pricing_type, input_cost_per_1m, output_cost_per_1m, per_request_cost_usd')
    .eq('provider_id', provider.id)
    .in('model_id', effectiveModel !== provider.model ? [effectiveModel, provider.model] : [provider.model])
    .limit(1)
    .maybeSingle();

  const cost = computeCostAccounting(modelRow, result.usage);

  await supabaseAdmin.from('ai_usage_logs').insert({
    org_id: orgId,
    user_id: userId,
    provider_id: provider.id,
    provider_type: provider.providerType,
    model: effectiveModel,
    feature_key: featureKey,
    prompt_tokens: result.usage.promptTokens,
    completion_tokens: result.usage.completionTokens,
    total_tokens: result.usage.totalTokens,
    estimated_cost_usd: cost.estimatedCostUsd,
    actual_cost_usd: cost.actualCostUsd,
    cost_status: cost.costStatus,
    status: 'succeeded',
    latency_ms: result.latencyMs,
    ttft_ms: result.ttftMs ?? null,
    tokens_per_sec: result.tokensPerSec,
  });
}

async function recordUsageFailure(
  orgId: string,
  userId: string | null,
  provider: ResolvedAiProvider,
  featureKey: string,
  latencyMs: number,
  errorMessage: string,
) {
  await supabaseAdmin.from('ai_usage_logs').insert({
    org_id: orgId,
    user_id: userId,
    provider_id: provider.id,
    provider_type: provider.providerType,
    model: provider.model,
    feature_key: featureKey,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null,
    cost_status: 'unknown',
    status: 'failed',
    latency_ms: latencyMs,
    error_message: redactSecretTokens(errorMessage).slice(0, 300),
  });
}

export async function executeOrgAiCompletion(
  orgId: string,
  userId: string | null,
  featureKey: string,
  request: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
  overrideProvider?: ResolvedAiProvider,
  purpose?: 'chat' | 'tools',
): Promise<AiCompletionResponse> {
  const effectivePurpose: 'chat' | 'tools' = purpose || (featureKey.startsWith('proposal_') ? 'tools' : 'chat');
  const provider = overrideProvider || (await resolveActiveAiProvider(orgId, effectivePurpose));
  if (!provider) {
    throw new Error('NO_ACTIVE_AI_PROVIDER');
  }

  const startedAt = Date.now();
  try {
    const result = await invokeAiCompletion(
      {
        providerType: provider.providerType,
        protocol: provider.protocol,
        authMethod: provider.authMethod,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        customHeaders: provider.customHeaders,
        timeoutMs: provider.timeoutMs,
      },
      request,
      fetchImpl,
    );

    await recordUsageSuccess(orgId, userId, provider, featureKey, result);
    return result;
  } catch (err: any) {
    // 1. Model-level fallback on same provider if configured
    if (provider.fallbackModel && provider.fallbackModel !== provider.model) {
      try {
        const fallbackProvider: ResolvedAiProvider = { ...provider, model: provider.fallbackModel };
        const result = await invokeAiCompletion(
          {
            providerType: fallbackProvider.providerType,
            protocol: fallbackProvider.protocol,
            authMethod: fallbackProvider.authMethod,
            apiKey: fallbackProvider.apiKey,
            model: fallbackProvider.model,
            baseUrl: fallbackProvider.baseUrl,
            customHeaders: fallbackProvider.customHeaders,
            timeoutMs: fallbackProvider.timeoutMs,
          },
          request,
          fetchImpl,
        );
        await recordUsageSuccess(orgId, userId, fallbackProvider, featureKey, result);
        return result;
      } catch {
        // Continue to provider-level fallback or fail cleanly
      }
    }

    // 2. Platform-level fallback provider when not using explicit override
    if (!overrideProvider) {
      const secondary = await resolveFallbackPlatformProvider(provider.id, effectivePurpose);
      if (secondary) {
        try {
          const result = await invokeAiCompletion(
            {
              providerType: secondary.providerType,
              protocol: secondary.protocol,
              authMethod: secondary.authMethod,
              apiKey: secondary.apiKey,
              model: secondary.model,
              baseUrl: secondary.baseUrl,
              customHeaders: secondary.customHeaders,
              timeoutMs: secondary.timeoutMs,
            },
            request,
            fetchImpl,
          );
          await recordUsageSuccess(orgId, userId, secondary, featureKey, result);
          return result;
        } catch {
          // Throw original primary error after logging failure
        }
      }
    }

    await recordUsageFailure(
      orgId,
      userId,
      provider,
      featureKey,
      Date.now() - startedAt,
      String(err?.message || 'AI execution failed'),
    );
    throw err;
  }
}

export async function executeOrgAiCompletionStream(
  orgId: string,
  userId: string | null,
  featureKey: string,
  request: AiCompletionRequest,
  provider: ResolvedAiProvider,
  onChunk: (delta: string) => void,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AiCompletionResponse> {
  const startedAt = Date.now();
  try {
    const result = await invokeAiCompletionStream(
      {
        providerType: provider.providerType,
        protocol: provider.protocol,
        authMethod: provider.authMethod,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        customHeaders: provider.customHeaders,
        timeoutMs: provider.timeoutMs,
      },
      request,
      onChunk,
      fetchImpl,
      signal,
    );
    await recordUsageSuccess(orgId, userId, provider, featureKey, result);
    return result;
  } catch (err: any) {
    await recordUsageFailure(
      orgId,
      userId,
      provider,
      featureKey,
      Date.now() - startedAt,
      String(err?.message || 'AI stream failed'),
    );
    throw err;
  }
}
