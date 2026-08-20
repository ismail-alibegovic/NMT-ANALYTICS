CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'accommodation', 'transport', 'airline', 'guide', 'activity', 'restaurant',
    'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  country TEXT,
  city TEXT,
  address TEXT,
  tax_id TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  default_currency TEXT NOT NULL DEFAULT 'BAM',
  payment_terms TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, org_id)
);

CREATE TABLE IF NOT EXISTS supplier_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'accommodation', 'transport', 'flight', 'guide', 'activity', 'meal',
    'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'
  )),
  unit TEXT NOT NULL DEFAULT 'fixed' CHECK (unit IN (
    'per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group',
    'per_booking', 'per_day', 'per_hour', 'fixed'
  )),
  net_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_price >= 0),
  currency TEXT NOT NULL DEFAULT 'BAM',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  default_markup NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_markup >= 0 AND default_markup <= 1000),
  valid_from DATE,
  valid_to DATE,
  min_quantity NUMERIC(10,2) CHECK (min_quantity IS NULL OR min_quantity >= 0),
  max_quantity NUMERIC(10,2) CHECK (max_quantity IS NULL OR max_quantity >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_services_supplier_org_fk
    FOREIGN KEY (supplier_id, org_id) REFERENCES suppliers(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_category ON suppliers(org_id, category, status);
CREATE INDEX IF NOT EXISTS idx_supplier_services_org_supplier ON supplier_services(org_id, supplier_id, active);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_org_isolation ON suppliers;
CREATE POLICY suppliers_org_isolation ON suppliers
  FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

DROP POLICY IF EXISTS supplier_services_org_isolation ON supplier_services;
CREATE POLICY supplier_services_org_isolation ON supplier_services
  FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE suppliers IS 'Cross-agency supplier directory for accommodation, transport, DMC, ticketing, corporate, pilgrimage, and group operations.';
COMMENT ON TABLE supplier_services IS 'Reusable supplier cost items used by itinerary costing and quotations.';
