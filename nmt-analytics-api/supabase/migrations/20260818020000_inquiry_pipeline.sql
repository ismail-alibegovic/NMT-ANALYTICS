CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  trip_type TEXT NOT NULL DEFAULT 'other' CHECK (trip_type IN (
    'scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only',
    'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'
  )),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN (
    'new', 'qualified', 'proposal', 'follow_up', 'won', 'lost'
  )),
  source TEXT NOT NULL DEFAULT 'other' CHECK (source IN (
    'web', 'phone', 'email', 'walk_in', 'partner', 'social', 'referral', 'other'
  )),
  destination TEXT,
  travel_start DATE,
  travel_end DATE,
  travelers INTEGER NOT NULL DEFAULT 1 CHECK (travelers > 0),
  budget NUMERIC(14,2) CHECK (budget IS NULL OR budget >= 0),
  currency TEXT NOT NULL DEFAULT 'BAM',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  next_action_at TIMESTAMPTZ,
  notes TEXT,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_org_stage ON inquiries(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_inquiries_org_next_action ON inquiries(org_id, next_action_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON inquiries(assigned_to);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiries_org_isolation ON inquiries;
CREATE POLICY inquiries_org_isolation ON inquiries
  FOR ALL
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE inquiries IS
  'Cross-agency sales cases covering scheduled, tailor-made, ticketing, accommodation, corporate, pilgrimage, excursion, and transfer requests.';
