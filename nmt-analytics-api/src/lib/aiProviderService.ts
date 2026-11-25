import { supabaseAdmin } from './supabase';
import { decryptSecret } from './secretVault';
import { invokeAiCompletion, type AiCompletionRequest, type AiCompletionResponse, type AiProviderType } from './aiProviders';

export interface SafeAiProviderDto {
  id: string;
  scope: 'platform' | 'org';
  orgId: string | null;
  providerType: AiProviderType;
  displayName: string;
  baseUrl: string | null;
  keyHint: string;
  defaultModel: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedAiProvider {
  id: string;
  scope: 'platform' | 'org';
  providerType: AiProviderType;
  apiKey: string;
  model: string;
  baseUrl: string | null;
}

export function sanitizeAiProviderRow(row: any): SafeAiProviderDto {
  return {
    id: row.id,
    scope: row.scope,
    orgId: row.org_id ?? null,
    providerType: row.provider_type,
    displayName: row.display_name,
    baseUrl: row.base_url ?? null,
    keyHint: row.key_hint,
    defaultModel: row.default_model,
    isActive: Boolean(row.is_active),
    priority: Number(row.priority ?? 100),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves the highest-priority active AI provider for an organization:
 * 1) Active org BYOK provider (`scope = 'org'`, `org_id = orgId`)
 * 2) Active platform provider fallback (`scope = 'platform'`)
 */
export async function resolveActiveAiProvider(orgId: string): Promise<ResolvedAiProvider | null> {
  const { data: orgRows } = await supabaseAdmin
    .from('ai_providers')
    .select('id, scope, provider_type, base_url, encrypted_api_key, default_model, priority')
    .eq('scope', 'org')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1);

  const chosen = (orgRows && orgRows[0]) || null;
  if (chosen) {
    return {
      id: chosen.id,
      scope: 'org',
      providerType: chosen.provider_type,
      apiKey: decryptSecret(chosen.encrypted_api_key),
      model: chosen.default_model,
      baseUrl: chosen.base_url ?? null,
    };
  }

  const { data: platformRows } = await supabaseAdmin
    .from('ai_providers')
    .select('id, scope, provider_type, base_url, encrypted_api_key, default_model, priority')
    .eq('scope', 'platform')
    .is('org_id', null)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1);

  const fallback = (platformRows && platformRows[0]) || null;
  if (!fallback) return null;

  return {
    id: fallback.id,
    scope: 'platform',
    providerType: fallback.provider_type,
    apiKey: decryptSecret(fallback.encrypted_api_key),
    model: fallback.default_model,
    baseUrl: fallback.base_url ?? null,
  };
}

export async function executeOrgAiCompletion(
  orgId: string,
  userId: string | null,
  featureKey: string,
  request: AiCompletionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiCompletionResponse> {
  const provider = await resolveActiveAiProvider(orgId);
  if (!provider) {
    throw new Error('NO_ACTIVE_AI_PROVIDER');
  }

  const startedAt = Date.now();
  try {
    const result = await invokeAiCompletion(
      {
        providerType: provider.providerType,
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
      },
      request,
      fetchImpl,
    );

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
      estimated_cost_usd: 0,
      status: 'succeeded',
      latency_ms: result.latencyMs,
    });

    return result;
  } catch (err) {
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
      status: 'failed',
      latency_ms: Date.now() - startedAt,
    });
    throw err;
  }
}
