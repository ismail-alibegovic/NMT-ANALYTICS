import { get, patch } from './client';

export interface OrgBranding {
  display_name: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

export interface BrandingUpdate {
  display_name?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  accent_color?: string;
}

const DEFAULT_BRANDING: OrgBranding = {
  display_name: null,
  logo_url: null,
  primary_color: '#1D4ED8',
  accent_color: '#0EA5E9',
};

/**
 * Fetch the signed-in org's branding. Lives behind /settings/branding (auth required,
 * org-scoped by JWT). Returns sensible defaults if the org has no branding row yet.
 */
export async function getBranding(): Promise<OrgBranding> {
  try {
    const { data } = await get<OrgBranding>('/settings/branding');
    return {
      display_name: data.display_name,
      logo_url: data.logo_url,
      primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
      accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** Update branding. Director-only on the backend (PATCH /settings/branding). */
export async function updateBranding(payload: BrandingUpdate): Promise<OrgBranding> {
  const { data } = await patch<OrgBranding>('/settings/branding', payload);
  return data;
}
