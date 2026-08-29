import { del, get, patch, post } from './client';

export type AutomationChannel = 'email' | 'sms';
export type TriggerType = 'before_departure' | 'after_reservation' | 'before_payment_due';
export type TimingUnit = 'hours' | 'days';

export interface AutomationRule {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  channel: AutomationChannel;
  template_id: string | null;
  trigger_type: TriggerType;
  timing: { value: number; unit: TimingUnit };
  human_trigger: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRulePayload {
  name: string;
  is_active?: boolean;
  channel: AutomationChannel;
  template_id?: string | null;
  trigger_type: TriggerType;
  timing: { value: number; unit: TimingUnit };
}

export async function getAutomationRules(params?: {
  channel?: AutomationChannel;
  activeOnly?: boolean;
}) {
  const { data } = await get<{ data: AutomationRule[] }>('/settings/automation-rules', { params });
  return data.data || [];
}

export async function getAutomationRule(id: string) {
  const { data } = await get<AutomationRule>(`/settings/automation-rules/${id}`);
  return data;
}

export async function createAutomationRule(payload: AutomationRulePayload) {
  const { data } = await post<AutomationRule>('/settings/automation-rules', payload);
  return data;
}

export async function updateAutomationRule(id: string, payload: Partial<AutomationRulePayload>) {
  const { data } = await patch<AutomationRule>(`/settings/automation-rules/${id}`, payload);
  return data;
}

export async function deleteAutomationRule(id: string) {
  const { data } = await del<{ success: boolean }>(`/settings/automation-rules/${id}`);
  return data;
}

export async function toggleAutomationRule(id: string, is_active: boolean) {
  const { data } = await patch<AutomationRule>(`/settings/automation-rules/${id}/toggle`, { is_active });
  return data;
}
