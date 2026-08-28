-- RECONSTRUCTED MIGRATION SOURCE
-- Live schema_migrations.statements is NULL for this version, so exact production SQL is not recoverable.
-- The original Git policy compared uuid org_id to text JWT claims and fails on clean replay.
-- This uses the canonical Travline public.get_my_org_id() tenant helper and grants service_role access
-- to match the known production security model for these server-managed operational tables.

-- ============================================================
-- Trip Passenger Groups (Društva putnika)
-- Generic entity usable by bus seating, hotel allocation,
-- transfer, excursions, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS trip_passenger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  departure_id UUID NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  name TEXT,
  color TEXT NOT NULL DEFAULT '#6b7280',
  primary_passenger_id UUID,
  notes TEXT,
  seating_preference TEXT NOT NULL DEFAULT 'prefer_together'
    CHECK (seating_preference IN ('keep_together','prefer_together','no_preference')),
  accommodation_preference TEXT NOT NULL DEFAULT 'prefer_together'
    CHECK (accommodation_preference IN ('same_room','adjacent_rooms','same_floor','nearby','no_preference')),
  locked BOOLEAN NOT NULL DEFAULT false,
  member_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_passenger_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES trip_passenger_groups(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, passenger_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tpg_org ON trip_passenger_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_tpg_departure ON trip_passenger_groups(departure_id);
CREATE INDEX IF NOT EXISTS idx_tpgm_group ON trip_passenger_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_tpgm_passenger ON trip_passenger_group_members(passenger_id);
CREATE INDEX IF NOT EXISTS idx_tpgm_reservation ON trip_passenger_group_members(reservation_id);

-- RLS
ALTER TABLE trip_passenger_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_passenger_groups org isolation" ON trip_passenger_groups;
CREATE POLICY "trip_passenger_groups org isolation" ON trip_passenger_groups
  FOR ALL USING (org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

ALTER TABLE trip_passenger_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_passenger_group_members org isolation" ON trip_passenger_group_members;
CREATE POLICY "trip_passenger_group_members org isolation" ON trip_passenger_group_members
  FOR ALL USING (
    group_id IN (
      SELECT id FROM trip_passenger_groups
      WHERE org_id = public.get_my_org_id()
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM trip_passenger_groups
      WHERE org_id = public.get_my_org_id()
    )
  );

-- Trigger: auto-update member_count
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE trip_passenger_groups SET member_count = member_count + 1, updated_at = now()
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE trip_passenger_groups SET member_count = member_count - 1, updated_at = now()
    WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_group_member_count ON trip_passenger_group_members;
CREATE TRIGGER trg_group_member_count
  AFTER INSERT OR DELETE ON trip_passenger_group_members
  FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

COMMENT ON TABLE trip_passenger_groups IS 'Generic passenger group entity — shared across bus seating, hotel allocation, transfers, excursions.';
COMMENT ON COLUMN trip_passenger_groups.seating_preference IS 'keep_together | prefer_together | no_preference';
COMMENT ON COLUMN trip_passenger_groups.accommodation_preference IS 'same_room | adjacent_rooms | same_floor | nearby | no_preference';

GRANT ALL ON public.trip_passenger_groups TO service_role;
GRANT ALL ON public.trip_passenger_group_members TO service_role;
