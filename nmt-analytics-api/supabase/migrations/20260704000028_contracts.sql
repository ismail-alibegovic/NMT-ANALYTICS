-- 028_contracts.sql
-- Digital per-reservation travel contracts. Auto-generated contract number UG-YYYY-XXXX.

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  contract_number TEXT NOT NULL,
  contract_date DATE NOT NULL DEFAULT CURRENT_DATE,
  traveler_name TEXT NOT NULL,
  traveler_phone TEXT,
  traveler_email TEXT,
  package_description TEXT,
  departure_date DATE,
  return_date DATE,
  party_size INT NOT NULL DEFAULT 1,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BAM',
  payment_terms TEXT,
  cancellation_policy TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique contract number per organization (and globally is fine since prefix encodes org via sequence)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_number_org ON contracts(org_id, contract_number);

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS idx_contracts_org_created ON contracts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_reservation ON contracts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(org_id, status);

-- Row Level Security
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant access - Contracts" ON contracts;
CREATE POLICY "Tenant access - Contracts" ON contracts
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE contracts IS 'Digital travel contracts generated per reservation';
COMMENT ON COLUMN contracts.contract_number IS 'Auto-generated format: UG-YYYY-XXXX (org-scoped sequence)';
COMMENT ON COLUMN contracts.status IS 'draft | signed | cancelled';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_contracts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_touch_updated_at ON contracts;
CREATE TRIGGER contracts_touch_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION trg_contracts_touch_updated_at();
