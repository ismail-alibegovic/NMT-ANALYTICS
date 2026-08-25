-- Phase 12.3A: Quotation Snapshots
-- Makes quotations independent snapshots via quotation_items,
-- while preserving itinerary-derived creation.
-- itinerary_id + itinerary_version_id become nullable (both-or-neither).

-- 1. Create quotation_items snapshot table

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  day_number INTEGER NOT NULL DEFAULT 1 CHECK (day_number > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_time TIME,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'fixed',
  net_unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_unit_price >= 0),
  markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (markup_percent >= 0 AND markup_percent <= 1000),
  currency TEXT NOT NULL DEFAULT 'BAM',
  included BOOLEAN NOT NULL DEFAULT TRUE,
  supplier_id UUID,
  supplier_service_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_items_quotation_org_fk FOREIGN KEY (quotation_id, org_id)
    REFERENCES quotations(id, org_id) ON DELETE CASCADE,
  CONSTRAINT quotation_items_supplier_org_fk FOREIGN KEY (supplier_id, org_id)
    REFERENCES suppliers(id, org_id) ON DELETE RESTRICT,
  CONSTRAINT quotation_items_service_org_fk FOREIGN KEY (supplier_service_id, org_id)
    REFERENCES supplier_services(id, org_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
  ON quotation_items(org_id, quotation_id, day_number, sort_order);

ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotation_items_org_isolation ON quotation_items;
CREATE POLICY quotation_items_org_isolation ON quotation_items FOR ALL
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE quotation_items IS 'Canonical line-item snapshot for a quotation; survives itinerary edits.';

-- 2. Backfill quotation_items from existing itinerary items

INSERT INTO quotation_items (
  org_id, quotation_id, title, description, location, category,
  day_number, sort_order, start_time, quantity, unit,
  net_unit_price, markup_percent, currency, included,
  supplier_id, supplier_service_id
)
SELECT
  ii.org_id, q.id, ii.title, ii.description, ii.location, ii.category,
  ii.day_number, ii.sort_order, ii.start_time, ii.quantity, ii.unit,
  ii.net_unit_price, ii.markup_percent, ii.currency, ii.included,
  ii.supplier_id, ii.supplier_service_id
FROM itinerary_items ii
JOIN quotations q ON q.itinerary_version_id = ii.itinerary_version_id AND q.org_id = ii.org_id;

-- 3. Make itinerary_id + itinerary_version_id nullable

ALTER TABLE quotations
  DROP CONSTRAINT quotations_itinerary_org_fk,
  DROP CONSTRAINT quotations_version_org_fk;

ALTER TABLE quotations
  ALTER COLUMN itinerary_id DROP NOT NULL,
  ALTER COLUMN itinerary_version_id DROP NOT NULL;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_itinerary_org_fk FOREIGN KEY (itinerary_id, org_id)
    REFERENCES itineraries(id, org_id) ON DELETE SET NULL,
  ADD CONSTRAINT quotations_version_org_fk FOREIGN KEY (itinerary_version_id, org_id)
    REFERENCES itinerary_versions(id, org_id) ON DELETE SET NULL;

-- 4. Both-or-neither business rule check

ALTER TABLE quotations
  ADD CONSTRAINT quotations_itinerary_both_or_neither
  CHECK (
    (itinerary_id IS NULL AND itinerary_version_id IS NULL) OR
    (itinerary_id IS NOT NULL AND itinerary_version_id IS NOT NULL)
  );
