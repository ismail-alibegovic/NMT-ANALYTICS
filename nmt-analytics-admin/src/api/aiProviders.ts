import { get, post, patch, del } from './client';

export type AiProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';

export interface AiProviderDto {
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

export interface CreateAiProviderPayload {
  providerType: AiProviderType;
  displayName: string;
  baseUrl?: string | null;
  apiKey: string;
  defaultModel: string;
  isActive?: boolean;
  priority?: number;
}

export interface AiUsageLogDto {
  id: string;
  provider_type: string;
  model: string;
  feature_key: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  status: string;
  latency_ms: number;
  created_at: string;
}

export async function listOrgAiProviders(): Promise<{ providers: AiProviderDto[]; hasPlatformFallback: boolean }> {
  const { data } = await get<{ providers: AiProviderDto[]; hasPlatformFallback: boolean }>('/ai-providers');
  return data;
}

export async function createOrgAiProvider(payload: CreateAiProviderPayload): Promise<AiProviderDto> {
  const { data } = await post<AiProviderDto>('/ai-providers', payload);
  return data;
}

export async function updateOrgAiProvider(
  id: string,
  payload: Partial<CreateAiProviderPayload>,
): Promise<AiProviderDto> {
  const { data } = await patch<AiProviderDto>(`/ai-providers/${id}`, payload);
  return data;
}

export async function deleteOrgAiProvider(id: string): Promise<void> {
  await del(`/ai-providers/${id}`);
}

export async function getOrgAiUsage(): Promise<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number } }> {
  const { data } = await get<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number } }>('/ai-usage');
  return data;
}
