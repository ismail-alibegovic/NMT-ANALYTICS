-- 029_receipts.sql
-- Fiscal receipts: advance / final / refund. Linked to reservation + contract.
-- Auto-generated receipt number FR-YYYY-XXXX.

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('advance', 'final', 'refund')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BAM',
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank')),
  linked_receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  fiscal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_number_org ON receipts(org_id, receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipts_org_issued ON receipts(org_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_reservation ON receipts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_receipts_contract ON receipts(contract_id);
CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(org_id, receipt_type);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant access - Receipts" ON receipts;
CREATE POLICY "Tenant access - Receipts" ON receipts
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE receipts IS 'Fiscal receipts issued per reservation/contract';
COMMENT ON COLUMN receipts.receipt_number IS 'Auto-generated: FR-YYYY-XXXX (org-scoped)';
COMMENT ON COLUMN receipts.receipt_type IS 'advance | final | refund';
COMMENT ON COLUMN receipts.linked_receipt_id IS 'For advances → final linkage';
COMMENT ON COLUMN receipts.fiscal_data IS 'Government fiscal fields (CIS, ePorezna)';
