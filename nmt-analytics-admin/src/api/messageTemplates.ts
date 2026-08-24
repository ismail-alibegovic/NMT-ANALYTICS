import { del, get, patch, post } from './client';

export type MessageTemplateChannel = 'email' | 'sms';

export interface MessageTemplate {
  id: string;
  org_id: string;
  name: string;
  channel: MessageTemplateChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getMessageTemplates(params?: { channel?: MessageTemplateChannel; activeOnly?: boolean }) {
  const { data } = await get<{ data: MessageTemplate[] }>('/settings/message-templates', { params });
  return data.data || [];
}

export async function createMessageTemplate(payload: {
  name: string;
  channel: MessageTemplateChannel;
  subject?: string | null;
  body: string;
  is_active?: boolean;
}) {
  const { data } = await post<MessageTemplate>('/settings/message-templates', payload);
  return data;
}

export async function updateMessageTemplate(id: string, payload: Partial<{
  name: string;
  channel: MessageTemplateChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
}>) {
  const { data } = await patch<MessageTemplate>(`/settings/message-templates/${id}`, payload);
  return data;
}

export async function archiveMessageTemplate(id: string) {
  const { data } = await del<{ success: boolean }>(`/settings/message-templates/${id}`);
  return data;
}
