CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL,
  itinerary_version_id UUID NOT NULL,
  title TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  client_notes TEXT,
  internal_notes TEXT,
  valid_until DATE,
  markup_strategy TEXT NOT NULL DEFAULT 'per_item' CHECK (markup_strategy IN ('uniform', 'per_item')),
  global_markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (global_markup_percent >= 0 AND global_markup_percent <= 1000),
  sell_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BAM',
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, org_id),
  UNIQUE (org_id, reference),
  CONSTRAINT quotations_itinerary_org_fk FOREIGN KEY (itinerary_id, org_id)
    REFERENCES itineraries(id, org_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_version_org_fk FOREIGN KEY (itinerary_version_id, org_id)
    REFERENCES itinerary_versions(id, org_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_quotations_org_status ON quotations(org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_org_itinerary ON quotations(org_id, itinerary_id);
CREATE INDEX IF NOT EXISTS idx_quotations_ref ON quotations(org_id, reference);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotations_org_isolation ON quotations;
CREATE POLICY quotations_org_isolation ON quotations FOR ALL
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE quotations IS 'Immutable, version-locked priced offers generated from itinerary snapshots.';
