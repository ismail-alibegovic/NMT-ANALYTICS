import { get, post } from './client';

export interface AiAssistantResponse {
  answer: string;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  groundedAt: string;
  roleScope: 'operational' | 'full_financial';
}

export interface ExecutiveSignalItem {
  key: 'low_occupancy_departures' | 'open_balance_reservations' | 'stale_inquiries';
  severity: 'high' | 'medium' | 'info';
  count: number;
  route: string;
  items: any[];
}

export async function askTravlineAssistant(question: string, locale: 'bs' | 'en'): Promise<AiAssistantResponse> {
  const { data } = await post<AiAssistantResponse>('/ai/assistant', { question, locale });
  return data;
}

export async function getExecutiveSignals(): Promise<{ generatedAt: string; signals: ExecutiveSignalItem[] }> {
  const { data } = await get<{ generatedAt: string; signals: ExecutiveSignalItem[] }>('/ai/signals');
  return data;
}
