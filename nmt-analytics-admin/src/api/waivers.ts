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
  status: 'pending' | 'signed' | 'expired' | 'revoked' | 'not_issued';
  signed_at: string | null;
  issued_at: string | null;
  expires_at: string | null;
  sign_url: string | null;
  template_title: string | null;
}

export const listWaiverTemplates = async (): Promise<WaiverTemplate[]> => {
  const { data } = await get<WaiverTemplate[]>('/waiver-templates');
  return data || [];
};

export const createWaiverTemplate = async (payload: {
  title: string;
  body_text: string;
}): Promise<WaiverTemplate> => {
  const { data } = await post<WaiverTemplate>('/waiver-templates', payload);
  return data;
};

export const updateWaiverTemplate = async (
  id: string,
  payload: Partial<Pick<WaiverTemplate, 'title' | 'body_text' | 'is_active'>>,
): Promise<WaiverTemplate> => {
  const { data } = await patch<WaiverTemplate>(`/waiver-templates/${id}`, payload);
  return data;
};

export const deleteWaiverTemplate = async (id: string): Promise<void> => {
  await del(`/waiver-templates/${id}`);
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
  const { data } = await get<any[]>(`/waivers/by-departure/${departureId}`);
  return (data || []).map(row => ({
    waiver_id: row.id, passenger_id: row.passenger_id,
    passenger_name: row.passenger_name_snapshot, reservation_id: row.reservation_id,
    status: row.status, signed_at: row.signed_at, issued_at: row.created_at,
    expires_at: row.expires_at, sign_url: null, template_title: row.template_title,
  }));
};

export const sendWaiverEmail = async (waiverId: string): Promise<void> => {
  await post(`/waivers/${waiverId}/send`, {});
};

export const revokeWaiver = async (waiverId: string): Promise<void> => {
  await post(`/waivers/${waiverId}/revoke`, {});
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
  return { waiver: data ? { ...data, waiver_id: data.id } : null, token };
}

export async function signPublicWaiver(
  token: string,
  payload: { signer_name: string; agreed: true; signature_png?: string; declarations?: Record<string, boolean> },
): Promise<{ signed_at: string }> {
  const api = (await import('../lib/apiClient')).default;
  const { data } = await api.post(`/public/waiver/${token}/sign`, payload);
  return data;
}
