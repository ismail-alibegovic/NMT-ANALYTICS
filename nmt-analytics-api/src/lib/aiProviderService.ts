import { supabaseAdmin } from './supabase';
import { decryptSecret } from './secretVault';
import {
  invokeAiCompletion,
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
  apiKey: string;
  model: string;
  baseUrl: string | null;
  timeoutMs: number;
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

export async function resolveActiveAiProvider(orgId: string): Promise<ResolvedAiProvider | null> {
  const selectCols = 'id, scope, provider_type, protocol, base_url, encrypted_api_key, default_model, request_timeout_ms, priority, is_default';

  const { data: orgRows } = await supabaseAdmin
    .from('ai_providers')
    .select(selectCols)
    .eq('scope', 'org')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true })
    .limit(1);

  const chosen = (orgRows && orgRows[0]) || null;
  if (chosen) {
    return {
      id: chosen.id,
      scope: 'org',
      providerType: chosen.provider_type,
      protocol: chosen.protocol || 'openai_chat_completions',
      apiKey: decryptSecret(chosen.encrypted_api_key),
      model: chosen.default_model,
      baseUrl: chosen.base_url ?? null,
      timeoutMs: Number(chosen.request_timeout_ms ?? 30000),
    };
  }

  const { data: platformRows } = await supabaseAdmin
    .from('ai_providers')
    .select(selectCols)
    .eq('scope', 'platform')
    .is('org_id', null)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true })
    .limit(1);

  const fallback = (platformRows && platformRows[0]) || null;
  if (!fallback) return null;

  return {
    id: fallback.id,
    scope: 'platform',
    providerType: fallback.provider_type,
    protocol: fallback.protocol || 'openai_chat_completions',
    apiKey: decryptSecret(fallback.encrypted_api_key),
    model: fallback.default_model,
    baseUrl: fallback.base_url ?? null,
    timeoutMs: Number(fallback.request_timeout_ms ?? 30000),
  };
}

function computeCostAccounting(
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

export async function executeOrgAiCompletion(
  orgId: string,
  userId: string | null,
  featureKey: string,
  request: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
  overrideProvider?: ResolvedAiProvider,
): Promise<AiCompletionResponse> {
  const provider = overrideProvider || (await resolveActiveAiProvider(orgId));
  if (!provider) {
    throw new Error('NO_ACTIVE_AI_PROVIDER');
  }

  const startedAt = Date.now();
  try {
    const result = await invokeAiCompletion(
      {
        providerType: provider.providerType,
        protocol: provider.protocol,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        timeoutMs: provider.timeoutMs,
      },
      request,
      fetchImpl,
    );

    const { data: modelRow } = await supabaseAdmin
      .from('ai_models')
      .select('pricing_type, input_cost_per_1m, output_cost_per_1m, per_request_cost_usd')
      .eq('provider_id', provider.id)
      .eq('model_id', provider.model)
      .maybeSingle();

    const cost = computeCostAccounting(modelRow, result.usage);

    await supabaseAdmin.from('ai_usage_logs').insert({
      org_id: orgId,
      user_id: userId,
      provider_id: provider.id,
      provider_type: provider.providerType,
      model: provider.model,
      feature_key: featureKey,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
      estimated_cost_usd: cost.estimatedCostUsd ?? 0,
      actual_cost_usd: cost.actualCostUsd,
      cost_status: cost.costStatus,
      status: 'succeeded',
      latency_ms: result.latencyMs,
      tokens_per_sec: result.tokensPerSec,
    });

    return result;
  } catch (err: any) {
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
      estimated_cost_usd: 0,
      cost_status: 'unknown',
      status: 'failed',
      latency_ms: Date.now() - startedAt,
      error_message: String(err?.message || 'AI execution failed').slice(0, 300),
    });
    throw err;
  }
}
