/**
 * Fetch org branding for a given org_id.
 * Returns a partial style object the PDF generators understand.
 */
export async function getOrgBranding(orgId: string): Promise<{
  primaryColor?: string;
  secondaryColor?: string;
  footerText?: string;
  showQr?: boolean;
  logoUrl?: string | null;
}> {
  const { supabaseAdmin } = await import('./supabase');
  const { data } = await supabaseAdmin
    .from('org_branding')
    .select('primary_color, accent_color, display_name, logo_url')
    .eq('org_id', orgId)
    .single();

  if (!data) return {};

  return {
    primaryColor: data.primary_color || undefined,
    secondaryColor: data.accent_color || undefined,
    logoUrl: data.logo_url || null,
    footerText: data.display_name ? `Hvala na povjerenju — ${data.display_name}.` : undefined,
  };
}
