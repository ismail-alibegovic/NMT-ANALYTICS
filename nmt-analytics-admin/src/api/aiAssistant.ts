import { post } from './client';

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

export async function askTravlineAssistant(question: string, locale: 'bs' | 'en'): Promise<AiAssistantResponse> {
  const { data } = await post<AiAssistantResponse>('/ai/assistant', { question, locale });
  return data;
}
