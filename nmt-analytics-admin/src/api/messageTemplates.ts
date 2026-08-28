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

export interface MessageTemplatePayload {
  name: string;
  channel: MessageTemplateChannel;
  subject?: string | null;
  body: string;
  is_active?: boolean;
}

export async function getMessageTemplates(params?: {
  channel?: MessageTemplateChannel;
  activeOnly?: boolean;
}) {
  const { data } = await get<{ data: MessageTemplate[] }>('/settings/message-templates', { params });
  return data.data || [];
}

export async function getMessageTemplate(id: string) {
  const { data } = await get<MessageTemplate>(`/settings/message-templates/${id}`);
  return data;
}

export async function createMessageTemplate(payload: MessageTemplatePayload) {
  const { data } = await post<MessageTemplate>('/settings/message-templates', payload);
  return data;
}

export async function updateMessageTemplate(id: string, payload: Partial<MessageTemplatePayload>) {
  const { data } = await patch<MessageTemplate>(`/settings/message-templates/${id}`, payload);
  return data;
}

export async function duplicateMessageTemplate(id: string) {
  const { data } = await post<MessageTemplate>(`/settings/message-templates/${id}/duplicate`);
  return data;
}

/**
 * Hard-delete a template. Permanent removal.
 */
export async function deleteMessageTemplate(id: string) {
  const { data } = await del<{ success: boolean }>(`/settings/message-templates/${id}`);
  return data;
}

/**
 * Soft-archive a template by flipping is_active to false.
 * Retained for the legacy Settings page, which treats "archive" as deactivation.
 */
export async function archiveMessageTemplate(id: string) {
  const { data } = await patch<MessageTemplate>(`/settings/message-templates/${id}`, {
    is_active: false,
  });
  return data;
}
