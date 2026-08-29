import { del, get, patch, post } from './client';

export type CampaignChannel = 'email' | 'sms';
export type CampaignStatus = 'draft' | 'sending' | 'scheduled' | 'completed' | 'failed';
export type CampaignAudienceType = 'all' | 'departure' | 'reservations' | 'customers';

export type CampaignAudiencePayload =
  | { audienceType: 'all' }
  | { audienceType: 'departure'; departureId: string }
  | { audienceType: 'reservations'; reservationIds: string[] }
  | { audienceType: 'customers'; customerIds: string[] };

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  channel: CampaignChannel;
  template_id: string | null;
  subject: string | null;
  body: string;
  audience: CampaignAudiencePayload | null;
  status: CampaignStatus;
  recipient_count: number;
  created_at: string;
  updated_at: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
}

export interface CampaignPreview {
  audienceType: CampaignAudienceType;
  totalCandidates: number;
  uniqueRecipients: number;
  sendableRecipients: number;
  skippedEmpty: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  sampleRecipients: string[];
  skipped?: Array<{
    recipient: string;
    reason: string;
  }>;
}

export interface CampaignPayload {
  name: string;
  channel: CampaignChannel;
  template_id?: string | null;
  subject?: string | null;
  body: string;
  audience?: CampaignAudiencePayload;
  recipient_count?: number;
}

export async function getCampaigns(params?: { channel?: CampaignChannel; status?: CampaignStatus }) {
  const { data } = await get<{ data: Campaign[] }>('/settings/campaigns', { params });
  return data.data || [];
}

export async function getCampaign(id: string) {
  const { data } = await get<Campaign>(`/settings/campaigns/${id}`);
  return data;
}

export async function createCampaign(payload: CampaignPayload) {
  const { data } = await post<Campaign>('/settings/campaigns', payload);
  return data;
}

export async function updateCampaign(id: string, payload: Partial<CampaignPayload>) {
  const { data } = await patch<Campaign>(`/settings/campaigns/${id}`, payload);
  return data;
}

export async function deleteCampaign(id: string) {
  await del(`/settings/campaigns/${id}`);
}

export async function previewCampaignAudience(payload: {
  channel: CampaignChannel;
  audience: CampaignAudiencePayload;
  template_id?: string | null;
}) {
  const { data } = await post<CampaignPreview>('/settings/campaigns/preview', payload);
  return data;
}

export async function scheduleCampaign(id: string, scheduledAt: string) {
  const { data } = await post<{ campaignId: string; scheduledAt: string }>(`/settings/campaigns/${id}/schedule`, { scheduled_at: scheduledAt });
  return data;
}

export async function rescheduleCampaign(id: string, scheduledAt: string) {
  const { data } = await patch<{ campaignId: string; scheduledAt: string }>(`/settings/campaigns/${id}/schedule`, { scheduled_at: scheduledAt });
  return data;
}

export async function cancelSchedule(id: string) {
  const { data } = await post<{ campaignId: string; previousStatus: string }>(`/settings/campaigns/${id}/schedule/cancel`);
  return data;
}

export async function launchCampaign(id: string) {
  const { data } = await post<{
    status: CampaignStatus;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    totalRecipients: number;
    sentAt: string;
    preview: CampaignPreview;
  }>(`/settings/campaigns/${id}/send`, {});
  return data;
}
