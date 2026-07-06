-- 037_reservation_options.sql
-- Adds structured option selections + freeform notes to reservations
-- so the Nova Prodaja wizard can persist hotel/room/transport/excursion
-- choices alongside the booking without separate side tables.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for option-based lookups (future filtering / reporting)
CREATE INDEX IF NOT EXISTS idx_reservations_options
  ON reservations USING gin (options jsonb_path_ops);

-- Atomic capacity reservation with explicit oversell protection.
-- Used by POST /reservations when status='confirmed'.
CREATE OR REPLACE FUNCTION reserve_capacity_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_party_size INT
)
RETURNS TABLE (booked_after INT, capacity INT) AS $$
DECLARE
  v_booked INT;
  v_capacity INT;
BEGIN
  SELECT booked, capacity
  INTO v_booked, v_capacity
  FROM departures
  WHERE id = p_departure_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  IF v_booked + p_party_size > v_capacity THEN
    RAISE EXCEPTION 'CAPACITY_FULL';
  END IF;

  UPDATE departures
  SET booked = booked + p_party_size
  WHERE id = p_departure_id;

  RETURN QUERY SELECT v_booked + p_party_size, v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
