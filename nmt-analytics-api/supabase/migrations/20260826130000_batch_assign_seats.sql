CREATE OR REPLACE FUNCTION batch_update_seats_atomic(
  p_org_id uuid,
  p_departure_id uuid,
  p_assignments jsonb
) RETURNS SETOF departure_passengers
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  rec record;
  existing record;
BEGIN
  FOR rec IN SELECT * FROM jsonb_to_recordset(p_assignments) AS x(id uuid, seat_number int)
  LOOP
    SELECT seat_number INTO existing FROM departure_passengers
    WHERE id = rec.id AND org_id = p_org_id AND departure_id = p_departure_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Passenger % not found or wrong departure', rec.id;
    END IF;

    IF rec.seat_number IS NOT NULL AND EXISTS (
      SELECT 1 FROM departure_passengers
      WHERE departure_id = p_departure_id
        AND org_id = p_org_id
        AND seat_number = rec.seat_number
        AND id <> rec.id
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'Seat % is already occupied', rec.seat_number;
    END IF;

    UPDATE departure_passengers SET seat_number = rec.seat_number
    WHERE id = rec.id AND org_id = p_org_id AND departure_id = p_departure_id
    RETURNING * INTO rec;

    RETURN NEXT rec;
  END LOOP;

  RETURN;
END;
$$;
