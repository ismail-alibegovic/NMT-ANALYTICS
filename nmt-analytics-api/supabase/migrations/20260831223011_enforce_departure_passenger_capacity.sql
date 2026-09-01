CREATE OR REPLACE FUNCTION public.enforce_departure_passenger_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  departure_row RECORD;
  reservation_row RECORD;
  active_passenger_count INTEGER;
  reservation_passenger_count INTEGER;
BEGIN
  SELECT id, capacity
  INTO departure_row
  FROM public.departures
  WHERE id = NEW.departure_id
    AND org_id = NEW.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  SELECT id, party_size, status
  INTO reservation_row
  FROM public.reservations
  WHERE id = NEW.reservation_id
    AND departure_id = NEW.departure_id
    AND org_id = NEW.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_DEPARTURE_MISMATCH';
  END IF;

  SELECT COUNT(*)
  INTO reservation_passenger_count
  FROM public.departure_passengers p
  WHERE p.org_id = NEW.org_id
    AND p.departure_id = NEW.departure_id
    AND p.reservation_id = NEW.reservation_id
    AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

  IF reservation_passenger_count + 1 > COALESCE(reservation_row.party_size, 0) THEN
    RAISE EXCEPTION 'RESERVATION_PARTY_SIZE_EXCEEDED';
  END IF;

  IF reservation_row.status <> 'cancelled' THEN
    SELECT COUNT(*)
    INTO active_passenger_count
    FROM public.departure_passengers p
    JOIN public.reservations r
      ON r.id = p.reservation_id
     AND r.org_id = p.org_id
    WHERE p.org_id = NEW.org_id
      AND p.departure_id = NEW.departure_id
      AND r.status <> 'cancelled'
      AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

    IF active_passenger_count + 1 > COALESCE(departure_row.capacity, 0) THEN
      RAISE EXCEPTION 'DEPARTURE_CAPACITY_EXCEEDED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_departure_passenger_capacity ON public.departure_passengers;

CREATE TRIGGER trg_enforce_departure_passenger_capacity
BEFORE INSERT OR UPDATE OF departure_id, reservation_id, org_id
ON public.departure_passengers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_departure_passenger_capacity();
