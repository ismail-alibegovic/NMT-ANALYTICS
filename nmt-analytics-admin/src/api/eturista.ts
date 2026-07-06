import { post, get } from './client';

export interface ETuristaSubmission {
  id: string;
  orgId: string;
  submissionDate: string;
  departureId?: string;
  guestCount: number;
  responseStatus: string;
  createdAt: string;
}

export async function submitETurista(departureId?: string): Promise<{ success: boolean; message: string; id?: string }> {
  const { data } = await post<{ success: boolean; message: string; id?: string }>('/integrations/eturista/submit', { departureId });
  return data;
}

export async function getETuristaHistory(): Promise<ETuristaSubmission[]> {
  const { data } = await get<{ data: ETuristaSubmission[] }>('/integrations/eturista/history');
  return data.data || [];
}
