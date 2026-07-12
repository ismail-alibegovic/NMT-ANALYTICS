import { get, post, patch, del } from './client';

export interface WaiverTemplate {
  id: string;
  org_id: string;
  title: string;
  body_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WaiverStatus {
  waiver_id: string | null;
  passenger_id: string;
  passenger_name: string;
  reservation_id: string;
  status: 'pending' | 'signed' | 'expired' | 'not_issued';
  signed_at: string | null;
  issued_at: string | null;
  expires_at: string | null;
  sign_url: string | null;
  template_title: string | null;
}

export const listWaiverTemplates = async (): Promise<WaiverTemplate[]> => {
  const { data } = await get<WaiverTemplate[]>('/waivers/templates');
  return data || [];
};

export const createWaiverTemplate = async (payload: {
  title: string;
  body_text: string;
}): Promise<WaiverTemplate> => {
  const { data } = await post<WaiverTemplate>('/waivers/templates', payload);
  return data;
};

export const updateWaiverTemplate = async (
  id: string,
  payload: Partial<Pick<WaiverTemplate, 'title' | 'body_text' | 'is_active'>>,
): Promise<WaiverTemplate> => {
  const { data } = await patch<WaiverTemplate>(`/waivers/templates/${id}`, payload);
  return data;
};

export const deleteWaiverTemplate = async (id: string): Promise<void> => {
  await del(`/waivers/templates/${id}`);
};

export const issueWaiver = async (payload: {
  passenger_id?: string;
  reservation_id?: string;
  template_id?: string;
}[]): Promise<any[]> => {
  // Single issue
  if (payload.length === 1) {
    const { data } = await post<any>('/waivers/issue', payload[0]);
    return [data];
  }
  // Bulk issue — fire in parallel
  const results = await Promise.all(
    payload.map((p) => post<any>('/waivers/issue', p).then((r) => r.data).catch((e) => ({ error: e?.message }))),
  );
  return results;
};

export const getDepartureWaiverStatus = async (departureId: string): Promise<WaiverStatus[]> => {
  const { data } = await get<WaiverStatus[]>(`/departures/${departureId}/waivers`);
  return data || [];
};

export const sendWaiverEmail = async (waiverId: string): Promise<void> => {
  await post(`/waivers/${waiverId}/send`, {});
};

export const revokeWaiver = async (waiverId: string): Promise<void> => {
  await del(`/waivers/${waiverId}`);
};

// ── Public signing (no auth) ───────────────────────────────
export interface PublicWaiver {
  waiver_id: string;
  template_title: string;
  template_body: string;
  passenger_name: string;
  package_name: string | null;
  destination: string | null;
  depart_at: string | null;
  expires_at: string | null;
  status: string;
  signed_at: string | null;
}

export async function fetchPublicWaiver(token: string): Promise<{ waiver: PublicWaiver | null; token: string }> {
  const api = (await import('../lib/apiClient')).default;
  const { data } = await api.get(`/public/waiver/${token}`);
  return { waiver: data?.waiver || null, token };
}

export async function signPublicWaiver(
  token: string,
  payload: { signature_text: string },
): Promise<{ signed_at: string }> {
  const api = (await import('../lib/apiClient')).default;
  const { data } = await api.post(`/public/waiver/${token}/sign`, payload);
  return data;
}
