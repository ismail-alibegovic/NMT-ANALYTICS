-- RECONSTRUCTED MIGRATION SOURCE
-- Live schema_migrations.statements is NULL for this version, so exact production SQL is not recoverable.
-- The original Git policy compared uuid org_id to text JWT claims and fails on clean replay.
-- This uses the canonical public.get_my_org_id() tenant helper and keeps the production seat uniqueness invariant.

-- ============================================================
-- Departure Passengers — real traveller entity
-- Links Reservation → Passengers → Groups/Seats/Accommodation/Documents
-- ============================================================

CREATE TABLE IF NOT EXISTS departure_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_document_number TEXT,
  id_document_type TEXT CHECK (id_document_type IN ('passport', 'id_card', 'none')),
  nationality TEXT,
  date_of_birth DATE,
  seat_number INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dp_org ON departure_passengers(org_id);
CREATE INDEX IF NOT EXISTS idx_dp_reservation ON departure_passengers(reservation_id);
CREATE INDEX IF NOT EXISTS idx_dp_departure ON departure_passengers(departure_id);
CREATE INDEX IF NOT EXISTS idx_dp_reservation_departure ON departure_passengers(reservation_id, departure_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_departure_passengers_seat ON departure_passengers(departure_id, seat_number) WHERE seat_number IS NOT NULL AND seat_number > 0;

-- RLS: org isolation matching existing conventions
ALTER TABLE departure_passengers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departure_passengers org isolation" ON departure_passengers;
CREATE POLICY "departure_passengers org isolation" ON departure_passengers
  FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_my_org_id()))
  WITH CHECK (org_id = (SELECT public.get_my_org_id()));

-- Wire trip_passenger_group_members.passenger_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trip_passenger_group_members_passenger_id_fkey'
  ) THEN
    ALTER TABLE trip_passenger_group_members
      DROP CONSTRAINT trip_passenger_group_members_passenger_id_fkey;
  END IF;
END $$;

ALTER TABLE trip_passenger_group_members
  ADD CONSTRAINT trip_passenger_group_members_passenger_id_fkey
  FOREIGN KEY (passenger_id) REFERENCES departure_passengers(id) ON DELETE CASCADE;

COMMENT ON TABLE departure_passengers IS 'Real traveller entity: Reservation → Passengers → Groups/Seats/Accommodation';
COMMENT ON COLUMN departure_passengers.id_document_type IS 'passport | id_card | none';
COMMENT ON COLUMN departure_passengers.departure_id IS 'Denormalised for fast manifest queries. Must match reservation.departure_id.';

-- Add FK constraint that was applied separately
-- ALTER TABLE trip_passenger_group_members
--   ADD CONSTRAINT tpgm_passenger_fkey 
--   FOREIGN KEY (passenger_id) REFERENCES departure_passengers(id) ON DELETE CASCADE;
