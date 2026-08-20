CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_id_org_unique ON inquiries(id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_services_id_org_unique ON supplier_services(id, org_id);

CREATE TABLE IF NOT EXISTS itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inquiry_id UUID,
  title TEXT NOT NULL,
  trip_type TEXT NOT NULL DEFAULT 'other' CHECK (trip_type IN (
    'scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only',
    'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  destination TEXT,
  travel_start DATE,
  travel_end DATE,
  travelers INTEGER NOT NULL DEFAULT 1 CHECK (travelers > 0),
  currency TEXT NOT NULL DEFAULT 'BAM',
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, org_id),
  CONSTRAINT itineraries_inquiry_org_fk FOREIGN KEY (inquiry_id, org_id)
    REFERENCES inquiries(id, org_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS itinerary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  itinerary_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  name TEXT NOT NULL DEFAULT 'Working version',
  summary TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT itinerary_versions_itinerary_org_fk FOREIGN KEY (itinerary_id, org_id)
    REFERENCES itineraries(id, org_id) ON DELETE CASCADE,
  UNIQUE (itinerary_id, version_number),
  UNIQUE (id, org_id)
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  itinerary_version_id UUID NOT NULL,
  day_number INTEGER NOT NULL DEFAULT 1 CHECK (day_number > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_time TIME,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'accommodation', 'transport', 'flight', 'guide', 'activity', 'meal',
    'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'
  )),
  supplier_id UUID,
  supplier_service_id UUID,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'fixed' CHECK (unit IN (
    'per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group',
    'per_booking', 'per_day', 'per_hour', 'fixed'
  )),
  net_unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_unit_price >= 0),
  currency TEXT NOT NULL DEFAULT 'BAM',
  markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (markup_percent >= 0 AND markup_percent <= 1000),
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT itinerary_items_version_org_fk FOREIGN KEY (itinerary_version_id, org_id)
    REFERENCES itinerary_versions(id, org_id) ON DELETE CASCADE,
  CONSTRAINT itinerary_items_supplier_org_fk FOREIGN KEY (supplier_id, org_id)
    REFERENCES suppliers(id, org_id) ON DELETE RESTRICT,
  CONSTRAINT itinerary_items_service_org_fk FOREIGN KEY (supplier_service_id, org_id)
    REFERENCES supplier_services(id, org_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_itineraries_org_status ON itineraries(org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_itineraries_org_inquiry ON itineraries(org_id, inquiry_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_versions_itinerary ON itinerary_versions(org_id, itinerary_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_version_day ON itinerary_items(org_id, itinerary_version_id, day_number, sort_order);

ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itineraries_org_isolation ON itineraries;
CREATE POLICY itineraries_org_isolation ON itineraries FOR ALL
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
DROP POLICY IF EXISTS itinerary_versions_org_isolation ON itinerary_versions;
CREATE POLICY itinerary_versions_org_isolation ON itinerary_versions FOR ALL
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
DROP POLICY IF EXISTS itinerary_items_org_isolation ON itinerary_items;
CREATE POLICY itinerary_items_org_isolation ON itinerary_items FOR ALL
  USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE itineraries IS 'Cross-agency commercial trip cases linked optionally to an inquiry.';
COMMENT ON TABLE itinerary_versions IS 'Immutable version headers for itinerary snapshots.';
COMMENT ON TABLE itinerary_items IS 'Ordered day-by-day itinerary items with supplier cost snapshots.';
