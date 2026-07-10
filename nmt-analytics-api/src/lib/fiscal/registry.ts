import type { FiscalMarket, FiscalProvider } from './types';
import { EtuRistaProvider } from './eturista-provider';
import { FiskalizacijaHrProvider } from './fiskalizacija-hr-provider';

class FiscalRegistry {
  private providers = new Map<FiscalMarket, FiscalProvider>();

  constructor() {
    this.register(new EtuRistaProvider());
    this.register(new FiskalizacijaHrProvider());
  }

  register(provider: FiscalProvider): void {
    this.providers.set(provider.market, provider);
  }

  get(market: FiscalMarket): FiscalProvider | undefined {
    return this.providers.get(market);
  }

  getAll(): FiscalProvider[] {
    return Array.from(this.providers.values());
  }

  getMarkets(): FiscalMarket[] {
    return Array.from(this.providers.keys());
  }

  /** Resolve the provider(s) for an organization based on their configured fiscal_market(s). */
  async getForOrg(orgId: string): Promise<FiscalProvider[]> {
    const { supabaseAdmin } = await import('../supabase');
    const { data } = await supabaseAdmin
      .from('org_settings')
      .select('fiscal_market')
      .eq('org_id', orgId)
      .single();

    if (!data?.fiscal_market) return [];

    const markets: FiscalMarket[] = Array.isArray(data.fiscal_market)
      ? data.fiscal_market
      : [data.fiscal_market as FiscalMarket];

    return markets
      .map((m) => this.providers.get(m))
      .filter((p): p is FiscalProvider => p !== undefined);
  }
}

export const fiscalRegistry = new FiscalRegistry();
