import { get, post, patch, put, del } from './client';

export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';
export type AiProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'gemini_generate_content'
  | 'ollama_compatible';

export interface AiProviderDto {
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

export interface CreateAiProviderPayload {
  providerSlug?: string | null;
  providerType: AiProviderType;
  protocol?: AiProtocol;
  authMethod?: string;
  displayName: string;
  baseUrl?: string | null;
  modelsEndpoint?: string | null;
  apiKey: string;
  defaultModel: string;
  fallbackModel?: string | null;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxOutputTokens?: number;
  isDefault?: boolean;
  isFallback?: boolean;
  isActive?: boolean;
  priority?: number;
}

export interface AiModelDto {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  category: 'chat' | 'reasoning' | 'embedding' | 'audio_asr' | 'audio_tts' | 'vision' | 'other';
  source: 'discovered' | 'manual';
  is_enabled: boolean;
  is_default_chat: boolean;
  is_default_tools: boolean;
  is_fallback: boolean;
  advertised_capabilities: Record<string, boolean>;
  context_window: number | null;
  pricing_type: 'token' | 'per_request' | 'free' | 'unknown';
  input_cost_per_1m: number | null;
  output_cost_per_1m: number | null;
  ai_providers?: { id: string; display_name: string; provider_type: string; provider_slug: string | null };
}

export interface AiUsageLogDto {
  id: string;
  org_id?: string;
  provider_type: string;
  model: string;
  feature_key: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd?: number;
  actual_cost_usd?: number | null;
  cost_status?: string;
  status: string;
  latency_ms: number;
  tokens_per_sec?: number | null;
  created_at: string;
}

export interface OrgAiEntitlementResponse {
  entitlement: {
    org_id: string;
    is_enabled: boolean;
    status: 'disabled' | 'trial' | 'active' | 'suspended' | 'expired';
    monthly_request_limit: number;
    monthly_token_limit: number;
    per_user_daily_request_limit: number;
    emergency_disabled: boolean;
  };
  consumption: {
    monthRequests: number;
    monthTokens: number;
  };
}

export async function getOrgAiEntitlement(): Promise<OrgAiEntitlementResponse> {
  const { data } = await get<OrgAiEntitlementResponse>('/ai-entitlement');
  return data;
}

export async function getOrgAiUsage(): Promise<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number } }> {
  const { data } = await get<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number } }>('/ai-usage');
  return data;
}

// Platform Owner Endpoints
export async function listPlatformAiProviders(): Promise<AiProviderDto[]> {
  const { data } = await get<{ providers: AiProviderDto[] }>('/platform/ai-providers');
  return data.providers || [];
}

export async function createPlatformAiProvider(payload: CreateAiProviderPayload): Promise<AiProviderDto> {
  const { data } = await post<AiProviderDto>('/platform/ai-providers', payload);
  return data;
}

export async function updatePlatformAiProvider(id: string, payload: Partial<CreateAiProviderPayload>): Promise<AiProviderDto> {
  const { data } = await patch<AiProviderDto>(`/platform/ai-providers/${id}`, payload);
  return data;
}

export async function deletePlatformAiProvider(id: string): Promise<void> {
  await del(`/platform/ai-providers/${id}`);
}

export async function testPlatformAiProvider(id: string, model?: string): Promise<{ ok: boolean; latencyMs: number; discoverySupported?: boolean; discoveredCount?: number; sampleReply?: string; error?: string }> {
  const { data } = await post<any>(`/platform/ai-providers/${id}/test`, model ? { model } : {});
  return data;
}

export async function discoverPlatformAiModels(id: string): Promise<{ supported: boolean; models: any[]; error?: string }> {
  const { data } = await post<any>(`/platform/ai-providers/${id}/discover-models`, {});
  return data;
}

export async function listPlatformAiModels(params?: { providerId?: string; category?: string; q?: string }): Promise<AiModelDto[]> {
  const { data } = await get<{ models: AiModelDto[] }>('/platform/ai-models', { params: params || {} });
  return data.models || [];
}

export async function createManualPlatformModel(payload: {
  providerId: string;
  modelId: string;
  displayName: string;
  category: AiModelDto['category'];
  pricingType?: 'token' | 'per_request' | 'free' | 'unknown';
}): Promise<AiModelDto> {
  const { data } = await post<AiModelDto>('/platform/ai-models', payload);
  return data;
}

export async function updatePlatformAiModel(id: string, payload: { isEnabled?: boolean; isDefaultChat?: boolean; isDefaultTools?: boolean; isFallback?: boolean }): Promise<AiModelDto> {
  const { data } = await patch<AiModelDto>(`/platform/ai-models/${id}`, payload);
  return data;
}

export async function runPlatformPlayground(payload: {
  providerId: string;
  modelId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  testTools?: boolean;
}): Promise<any> {
  const { data } = await post<any>('/platform/ai-playground/run', payload);
  return data;
}

export async function listPlatformAiEntitlements(): Promise<Array<{ id: string; name: string; slug: string; plan: string; entitlement: any }>> {
  const { data } = await get<{ organizations: any[] }>('/platform/ai-entitlements');
  return data.organizations || [];
}

export async function updatePlatformAiEntitlement(orgId: string, payload: any): Promise<any> {
  const { data } = await put<any>(`/platform/ai-entitlements/${orgId}`, payload);
  return data;
}

export async function getPlatformAiUsage(): Promise<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number; totalKnownCostUsd: number } }> {
  const { data } = await get<any>('/platform/ai-usage');
  return data;
}
