import { mergeWithDefaults, type TemplateConfig } from './pdfTemplateConfig';

export interface OrgBranding {
  primaryColor?: string;
  secondaryColor?: string;
  footerText?: string;
  showQr?: boolean;
  logoUrl?: string | null;
  pdfTemplateConfig?: TemplateConfig;
}

/**
 * Fetch org branding for a given org_id, plus the stored PDF template config
 * (merged with defaults so missing blocks auto-fill). One Supabase round-trip.
 */
export async function getOrgBranding(orgId: string): Promise<OrgBranding> {
  const { supabaseAdmin } = await import('./supabase');
  const { data } = await supabaseAdmin
    .from('org_branding')
    .select('primary_color, accent_color, display_name, logo_url, pdf_template_config')
    .eq('org_id', orgId)
    .single();

  if (!data) return {};

  let pdfTemplateConfig: TemplateConfig | undefined;
  const raw = (data as any).pdf_template_config;
  if (raw && typeof raw === 'object') {
    pdfTemplateConfig = mergeWithDefaults(raw as Partial<TemplateConfig>);
  }

  return {
    primaryColor: data.primary_color || undefined,
    secondaryColor: data.accent_color || undefined,
    logoUrl: data.logo_url || null,
    footerText: data.display_name ? `Hvala na povjerenju — ${data.display_name}.` : undefined,
    pdfTemplateConfig,
  };
}
