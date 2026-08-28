-- RECONSTRUCTED MIGRATION SOURCE
-- Live schema_migrations.statements is NULL for this version, so exact production SQL is not recoverable.
-- The original Git policies compared uuid org_id to text JWT claims and fail on clean replay.
-- This uses public.get_my_org_id() and aligns accommodation_assignments with the current production shape.

-- ============================================================
-- Accommodation Module: Buildings → Floors → Rooms → Beds
-- Supports: Hotel, Hostel, Studentski dom, Apartman, Other
-- ============================================================

CREATE TABLE IF NOT EXISTS accommodation_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  departure_id UUID NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'hotel' 
    CHECK (type IN ('hotel','hostel','dormitory','apartment','other')),
  address TEXT,
  contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accommodation_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES accommodation_buildings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  floor_number INT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accommodation_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES accommodation_floors(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES accommodation_buildings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  room_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'double'
    CHECK (type IN ('single','double','triple','quadruple','custom')),
  capacity INT NOT NULL DEFAULT 2,
  beds JSONB,           -- [{"label":"Bed A","assignedPassengerId":null},...]
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (floor_id, room_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ab_org ON accommodation_buildings(org_id);
CREATE INDEX IF NOT EXISTS idx_ab_departure ON accommodation_buildings(departure_id);
CREATE INDEX IF NOT EXISTS idx_af_building ON accommodation_floors(building_id);
CREATE INDEX IF NOT EXISTS idx_af_org ON accommodation_floors(org_id);
CREATE INDEX IF NOT EXISTS idx_ar_floor ON accommodation_rooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_ar_building ON accommodation_rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_ar_org ON accommodation_rooms(org_id);

-- RLS
ALTER TABLE accommodation_buildings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_buildings org isolation" ON accommodation_buildings;
CREATE POLICY "acc_buildings org isolation" ON accommodation_buildings
  FOR ALL USING (org_id = public.get_my_org_id());

ALTER TABLE accommodation_floors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_floors org isolation" ON accommodation_floors;
CREATE POLICY "acc_floors org isolation" ON accommodation_floors
  FOR ALL USING (org_id = public.get_my_org_id());

ALTER TABLE accommodation_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_rooms org isolation" ON accommodation_rooms;
CREATE POLICY "acc_rooms org isolation" ON accommodation_rooms
  FOR ALL USING (org_id = public.get_my_org_id());

-- Room assignments: which passenger is in which room/bed
CREATE TABLE IF NOT EXISTS accommodation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  room_id UUID NOT NULL REFERENCES accommodation_rooms(id) ON DELETE CASCADE,
  passenger_id UUID,
  reservation_id UUID,
  passenger_name TEXT NOT NULL,
  bed_label TEXT,           -- e.g. "Bed A", null = room-level assignment
  group_id UUID REFERENCES trip_passenger_groups(id) ON DELETE SET NULL,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_aa_room ON accommodation_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_aa_org ON accommodation_assignments(org_id);

ALTER TABLE accommodation_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acc_assignments org isolation" ON accommodation_assignments;
CREATE POLICY "acc_assignments org isolation" ON accommodation_assignments
  FOR ALL USING (org_id = public.get_my_org_id());

COMMENT ON TABLE accommodation_buildings IS 'Hotel, hostel, dormitory, apartment building';
COMMENT ON TABLE accommodation_floors IS 'Floors within a building';
COMMENT ON TABLE accommodation_rooms IS 'Rooms with capacity and bed layout';
COMMENT ON TABLE accommodation_assignments IS 'Passenger-to-room/bed assignments';
