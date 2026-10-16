import { supabaseAdmin } from '../supabase';
import type { EmailProvider } from './EmailService';
import { SmtpEmailProvider, type SmtpConfig } from './SmtpProvider';

/**
 * Resolve the organisation's own saved SMTP provider, or null when it has none.
 * Providers are always built per send and never installed process-wide, so one
 * tenant's credentials or sender identity can never be used for another tenant.
 */
export async function resolveOrgEmailProvider(orgId: string): Promise<EmailProvider | null> {
  const { data, error } = await supabaseAdmin
    .from('org_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', 'smtp_config')
    .maybeSingle();

  if (error || !data?.value) return null;
  const config = data.value as Partial<SmtpConfig>;
  if (!config.host || !config.user || !config.pass) return null;
  return new SmtpEmailProvider(config as SmtpConfig);
}
