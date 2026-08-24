import { del, get, patch, post } from './client';

export type CampaignChannel = 'email' | 'sms';
export type CampaignStatus = 'draft' | 'sending' | 'completed' | 'failed';
export type CampaignAudienceType = 'departure' | 'reservations' | 'customers';

export interface Campaign {
  id: string;
  org_id: string;
  name: string;
  channel: CampaignChannel;
  subject: string | null;
  body: string;
  status: CampaignStatus;
  created_at: string;
  sent_at: string | null;
}

export type CampaignAudiencePayload =
  | { audienceType: 'departure'; departureId: string }
  | { audienceType: 'reservations'; reservationIds: string[] }
  | { audienceType: 'customers'; customerIds: string[] };

export interface CampaignPreview {
  audienceType: CampaignAudienceType;
  totalCandidates: number;
  uniqueRecipients: number;
  sendableRecipients: number;
  skippedEmpty: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  sampleRecipients: string[];
}

export async function getCampaigns(params?: { channel?: CampaignChannel; status?: CampaignStatus }) {
  const { data } = await get<{ data: Campaign[] }>('/settings/campaigns', { params });
  return data.data || [];
}

export async function createCampaign(payload: {
  name: string;
  channel: CampaignChannel;
  subject?: string | null;
  body: string;
}) {
  const { data } = await post<Campaign>('/settings/campaigns', payload);
  return data;
}

export async function updateCampaign(id: string, payload: {
  name?: string;
  channel?: CampaignChannel;
  subject?: string | null;
  body?: string;
}) {
  const { data } = await patch<Campaign>(`/settings/campaigns/${id}`, payload);
  return data;
}

export async function previewCampaign(id: string, payload: CampaignAudiencePayload) {
  const { data } = await post<CampaignPreview>(`/settings/campaigns/${id}/preview`, payload);
  return data;
}

export async function sendCampaignApi(id: string, payload: CampaignAudiencePayload) {
  const { data } = await post<{
    status: CampaignStatus;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    totalRecipients: number;
    sentAt: string;
    preview: CampaignPreview;
  }>(`/settings/campaigns/${id}/send`, payload);
  return data;
}
