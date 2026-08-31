-- Harden canonical accommodation-rooming invariants and safe capacity rollback.

CREATE OR REPLACE FUNCTION public.release_capacity_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_party_size INT
)
RETURNS TABLE (booked_after INT, capacity INT) AS $$
DECLARE
  v_booked INT;
  v_capacity INT;
BEGIN
  IF p_party_size IS NULL OR p_party_size < 1 THEN
    RAISE EXCEPTION 'INVALID_PARTY_SIZE';
  END IF;

  SELECT booked, capacity
  INTO v_booked, v_capacity
  FROM public.departures
  WHERE id = p_departure_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  UPDATE public.departures
  SET booked = GREATEST(0, booked - p_party_size)
  WHERE id = p_departure_id AND org_id = p_org_id
  RETURNING booked, capacity INTO v_booked, v_capacity;

  RETURN QUERY SELECT v_booked, v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_departure_room_slot_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  slot_row RECORD;
  passenger_row RECORD;
  requirement_row RECORD;
  occupied_count INTEGER;
BEGIN
  SELECT *
  INTO slot_row
  FROM public.departure_room_slots s
  WHERE s.id = NEW.room_slot_id
    AND s.org_id = NEW.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_SLOT_NOT_FOUND';
  END IF;

  SELECT *
  INTO passenger_row
  FROM public.departure_passengers p
  WHERE p.id = NEW.passenger_id
    AND p.org_id = NEW.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASSENGER_NOT_FOUND';
  END IF;

  IF passenger_row.departure_id <> slot_row.departure_id THEN
    RAISE EXCEPTION 'CROSS_DEPARTURE';
  END IF;

  IF passenger_row.reservation_id IS NOT NULL THEN
    SELECT *
    INTO requirement_row
    FROM public.reservation_accommodation_requirements rar
    WHERE rar.org_id = NEW.org_id
      AND rar.reservation_id = passenger_row.reservation_id
    LIMIT 1;

    IF FOUND AND (
      requirement_row.hotel_id <> slot_row.hotel_id
      OR requirement_row.hotel_allocation_id <> slot_row.hotel_allocation_id
      OR requirement_row.room_type <> slot_row.room_type
    ) THEN
      RAISE EXCEPTION 'ROOM_REQUIREMENT_MISMATCH';
    END IF;
  END IF;

  NEW.departure_id := slot_row.departure_id;
  NEW.reservation_id := passenger_row.reservation_id;
  NEW.passenger_name := passenger_row.full_name;

  SELECT COUNT(*)
  INTO occupied_count
  FROM public.departure_room_slot_assignments a
  WHERE a.room_slot_id = NEW.room_slot_id
    AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  IF occupied_count >= slot_row.capacity THEN
    RAISE EXCEPTION 'ROOM_SLOT_FULL';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT)
IS 'Atomically releases a previously reserved confirmed party size without overwriting concurrent capacity increments.';

COMMENT ON FUNCTION public.enforce_departure_room_slot_assignment()
IS 'Enforces room slot capacity and canonical reservation accommodation requirement compatibility for passenger rooming assignments.';
