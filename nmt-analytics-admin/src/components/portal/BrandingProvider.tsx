import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getBranding, type OrgBranding } from '../../api/branding';
import { useApp } from '../../context/AppContext';
import { logger } from '../../utils/logger';

interface BrandingContextValue {
  branding: OrgBranding | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setBranding: (b: OrgBranding) => void;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { userContext } = useApp();
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = userContext?.org?.id;
  const stableOrgId = orgId ?? 'no-org';

  const refresh = async () => {
    if (!orgId) {
      setBranding(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const b = await getBranding();
      setBranding(b);
    } catch (err) {
      logger.warn('[BrandingProvider] fetch failed', err);
      setBranding(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // re-fetch when the signed-in org changes (e.g. after sign-in)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableOrgId]);

  return (
    <BrandingContext.Provider
      value={{ branding, loading, refresh, setBranding }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return ctx;
}
