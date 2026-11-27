import { get, post } from './client';

export interface AiAssistantResponse {
  answer: string;
  provider: string;
  model: string;
  routedModel?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  tokensPerSec?: number | null;
  groundedAt: string;
  roleScope: 'operational' | 'full_financial';
  toolsUsed?: string[];
}

export interface ExecutiveSignalItem {
  key:
    | 'low_occupancy_departures'
    | 'open_balance_reservations'
    | 'stale_inquiries'
    | 'missing_seat_assignments'
    | 'missing_room_assignments';
  severity: 'high' | 'medium' | 'info';
  count: number;
  route: string;
  items: any[];
}

const AI_CHAT_TIMEOUT = { timeout: 60000 };

export async function askTravlineAssistant(
  question: string,
  locale: 'bs' | 'en',
  options?: {
    providerId?: string;
    modelId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    pageContext?: { route?: string; entityType?: string; entityId?: string };
  },
): Promise<AiAssistantResponse> {
  const { data } = await post<AiAssistantResponse>(
    '/ai/assistant',
    {
      question,
      locale,
      ...(options?.providerId ? { providerId: options.providerId } : {}),
      ...(options?.modelId ? { modelId: options.modelId } : {}),
      ...(options?.history?.length ? { history: options.history } : {}),
      ...(options?.pageContext ? { pageContext: options.pageContext } : {}),
    },
    AI_CHAT_TIMEOUT,
  );
  return data;
}

export async function getExecutiveSignals(): Promise<{ generatedAt: string; signals: ExecutiveSignalItem[] }> {
  const { data } = await get<{ generatedAt: string; signals: ExecutiveSignalItem[] }>('/ai/signals');
  return data;
}

export type AiActionType =
  | 'create_inquiry'
  | 'create_quotation_draft'
  | 'create_customer_draft'
  | 'create_package_draft'
  | 'create_departure_draft';

export interface AiActionProposalDto {
  id: string;
  action_type: AiActionType;
  status: 'draft' | 'executed' | 'rejected';
  prompt: string;
  proposed_payload: Record<string, any>;
  edited_payload?: Record<string, any> | null;
  missing_fields?: string[] | null;
  missingFields?: string[];
  expires_at?: string | null;
  execution_result?: { entityType: string; entityId: string; route: string } | null;
  created_at: string;
}

export async function listAiProposals(): Promise<AiActionProposalDto[]> {
  const { data } = await get<{ proposals: AiActionProposalDto[] }>('/ai/proposals');
  return data.proposals || [];
}

export async function createAiProposal(
  actionType: AiActionType,
  prompt: string,
  locale: 'bs' | 'en',
  options?: { providerId?: string; modelId?: string },
): Promise<AiActionProposalDto> {
  const { data } = await post<AiActionProposalDto>(
    '/ai/proposals',
    {
      actionType,
      prompt,
      locale,
      ...(options?.providerId ? { providerId: options.providerId } : {}),
      ...(options?.modelId ? { modelId: options.modelId } : {}),
    },
    AI_CHAT_TIMEOUT,
  );
  return data;
}

export async function confirmAiProposal(
  id: string,
  idempotencyKey: string,
  editedPayload?: Record<string, any>,
): Promise<{ executed: boolean; idempotentReplay: boolean; proposal: AiActionProposalDto; result: any }> {
  const { data } = await post<{ executed: boolean; idempotentReplay: boolean; proposal: AiActionProposalDto; result: any }>(
    `/ai/proposals/${id}/confirm`,
    { idempotencyKey, editedPayload },
    AI_CHAT_TIMEOUT,
  );
  return data;
}

export async function rejectAiProposal(id: string): Promise<AiActionProposalDto> {
  const { data } = await post<AiActionProposalDto>(`/ai/proposals/${id}/reject`, {});
  return data;
}
