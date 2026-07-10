import { supabaseAdmin } from '../supabase';
import type { FiscalProvider, FiscalProviderConfig, GuestData, SubmissionPayload, SubmissionResult, FiscalMarket } from './types';

/**
 * Fiskalizacija 2.0 — Hrvatska (HR)
 * Active since 2026-01-01: non-cash transactions (prepayments, installments,
 * card/bank transfers) now require real-time fiscalization.
 * B2B e-invoice exchange mandatory from 2027.
 *
 * This is a STRUCTURAL STUB — the real implementation requires:
 * 1. Registering as a certified software vendor with Porezna Uprava (tax authority)
 * 2. Obtaining a certificate/API key
 * 3. Implementing the TU (Fiskalna Blagajna) protocol for receipt generation
 * 4. Real-time SOAP/XML calls to Porezna Uprava server
 */
export class FiskalizacijaHrProvider implements FiscalProvider {
  readonly market: FiscalMarket = 'HR';
  readonly displayName = 'Fiskalizacija 2.0';
  readonly description = 'Hrvatska — Fiskalizacija u realnom vremenu (Porezna Uprava)';

  async getConfig(orgId: string): Promise<FiscalProviderConfig | null> {
    const { data } = await supabaseAdmin
      .from('org_settings')
      .select('hr_fiscal_endpoint, hr_fiscal_cert')
      .eq('org_id', orgId)
      .single();
    if (!data?.hr_fiscal_endpoint) return null;
    return {
      endpoint: data.hr_fiscal_endpoint,
      credentials: data.hr_fiscal_cert || '',
    };
  }

  async buildGuestPayload(): Promise<{ guests: GuestData[]; departure: any } | null> {
    // HR fiscalization applies to payment/receipt, not guestlists
    return null;
  }

  async submit(config: FiscalProviderConfig, payload: SubmissionPayload): Promise<SubmissionResult> {
    // Stub: log + return not-implemented
    console.warn('FiskalizacijaHrProvider.submit called but not yet implemented');
    return { success: false, status: 'NOT_IMPLEMENTED', body: { error: 'HR fiscalization not yet implemented' } };
  }

  async saveSubmissionRecord(
    orgId: string,
    _departureId: string | null,
    _guestCount: number,
    _payload: SubmissionPayload,
    result: SubmissionResult,
  ) {
    return supabaseAdmin.from('fiscal_submissions').insert({
      org_id: orgId,
      market: 'HR',
      response_status: result.status,
      response_body: result.body,
    });
  }
}
