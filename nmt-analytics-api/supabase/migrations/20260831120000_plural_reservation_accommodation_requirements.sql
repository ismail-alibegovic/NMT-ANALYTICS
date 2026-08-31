-- Plural reservation accommodation requirements + explicit passenger mapping.

ALTER TABLE public.reservation_accommodation_requirements
  DROP CONSTRAINT IF EXISTS reservation_accommodation_one_requirement_per_reservation;

ALTER TABLE public.reservation_accommodation_requirements
  ADD CONSTRAINT reservation_accommodation_unique_reservation_allocation
  UNIQUE (reservation_id, hotel_allocation_id);

ALTER TABLE public.departure_passengers
  ADD COLUMN IF NOT EXISTS reservation_accommodation_requirement_id UUID
  REFERENCES public.reservation_accommodation_requirements(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departure_passengers_res_acc_req
  ON public.departure_passengers(org_id, reservation_accommodation_requirement_id);

CREATE OR REPLACE FUNCTION public.enforce_departure_passenger_accommodation_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requirement_row RECORD;
BEGIN
  IF NEW.reservation_accommodation_requirement_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, org_id, reservation_id, departure_id
  INTO requirement_row
  FROM public.reservation_accommodation_requirements
  WHERE id = NEW.reservation_accommodation_requirement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOMMODATION_REQUIREMENT_NOT_FOUND';
  END IF;

  IF requirement_row.org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'CROSS_ORG_ACCOMMODATION_REQUIREMENT';
  END IF;

  IF requirement_row.reservation_id <> NEW.reservation_id THEN
    RAISE EXCEPTION 'CROSS_RESERVATION_ACCOMMODATION_REQUIREMENT';
  END IF;

  IF requirement_row.departure_id <> NEW.departure_id THEN
    RAISE EXCEPTION 'CROSS_DEPARTURE_ACCOMMODATION_REQUIREMENT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_departure_passenger_accommodation_requirement ON public.departure_passengers;
CREATE TRIGGER trg_enforce_departure_passenger_accommodation_requirement
BEFORE INSERT OR UPDATE ON public.departure_passengers
FOR EACH ROW EXECUTE FUNCTION public.enforce_departure_passenger_accommodation_requirement();

DO $$
BEGIN
  -- Natural migration for existing singular reservations: if a reservation has exactly
  -- one canonical requirement line, map all of its passengers to that single line.
  UPDATE public.departure_passengers p
  SET reservation_accommodation_requirement_id = only_req.id
  FROM (
    SELECT rar.reservation_id, MIN(rar.id::text)::uuid AS id
    FROM public.reservation_accommodation_requirements rar
    GROUP BY rar.reservation_id
    HAVING COUNT(*) = 1
  ) AS only_req
  WHERE p.reservation_id = only_req.reservation_id
    AND p.reservation_accommodation_requirement_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.replace_reservation_accommodation_requirements_atomic(
  p_org_id UUID,
  p_reservation_id UUID,
  p_requirements JSONB
)
RETURNS TABLE (
  id UUID,
  reservation_id UUID,
  departure_id UUID,
  hotel_allocation_id UUID,
  hotel_id UUID,
  room_type TEXT,
  room_label TEXT,
  room_count INTEGER,
  guests_expected INTEGER,
  capacity_per_room INTEGER,
  unit_sell_price NUMERIC,
  unit_net_price NUMERIC,
  total_sell_price NUMERIC,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation_row RECORD;
  requirement_row RECORD;
  allocation_row RECORD;
  sold_other INTEGER;
  total_guests INTEGER := 0;
  reservation_passenger_count INTEGER := 0;
  mapped_passenger_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_requirements, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_REQUIREMENTS_PAYLOAD';
  END IF;

  SELECT r.*
  INTO reservation_row
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF reservation_row.departure_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_HAS_NO_DEPARTURE';
  END IF;

  IF reservation_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED';
  END IF;

  CREATE TEMP TABLE tmp_reservation_accommodation_requirements (
    hotel_allocation_id UUID NOT NULL,
    room_count INTEGER NOT NULL,
    guests_expected INTEGER NOT NULL,
    notes TEXT,
    passenger_ids UUID[] NULL,
    requirement_id UUID NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_reservation_accommodation_requirements (
    hotel_allocation_id,
    room_count,
    guests_expected,
    notes,
    passenger_ids
  )
  SELECT
    line.hotel_allocation_id,
    line.room_count,
    line.guests_expected,
    line.notes,
    CASE
      WHEN line.passenger_ids IS NULL THEN NULL
      ELSE ARRAY(SELECT jsonb_array_elements_text(line.passenger_ids)::uuid)
    END
  FROM jsonb_to_recordset(COALESCE(p_requirements, '[]'::jsonb)) AS line(
    hotel_allocation_id UUID,
    room_count INTEGER,
    guests_expected INTEGER,
    notes TEXT,
    passenger_ids JSONB
  );

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT hotel_allocation_id, COUNT(*) AS c
      FROM tmp_reservation_accommodation_requirements
      GROUP BY hotel_allocation_id
    ) dup
    WHERE dup.c > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ALLOTMENT_LINES';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_reservation_accommodation_requirements
    WHERE room_count < 1 OR guests_expected < 1
  ) THEN
    RAISE EXCEPTION 'INVALID_REQUIREMENT_QUANTITY';
  END IF;

  SELECT COALESCE(SUM(guests_expected), 0)
  INTO total_guests
  FROM tmp_reservation_accommodation_requirements;

  IF total_guests > 0 AND total_guests <> reservation_row.party_size THEN
    RAISE EXCEPTION 'ACCOMMODATION_COVERAGE_MISMATCH';
  END IF;

  PERFORM 1
  FROM public.departure_passengers p
  WHERE p.org_id = p_org_id
    AND p.reservation_id = p_reservation_id
    AND p.departure_id = reservation_row.departure_id
  FOR UPDATE;

  SELECT COUNT(*)
  INTO reservation_passenger_count
  FROM public.departure_passengers p
  WHERE p.org_id = p_org_id
    AND p.reservation_id = p_reservation_id
    AND p.departure_id = reservation_row.departure_id;

  IF reservation_passenger_count > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM tmp_reservation_accommodation_requirements
      WHERE passenger_ids IS NULL
    ) THEN
      RAISE EXCEPTION 'PASSENGER_REQUIREMENT_COVERAGE_MISMATCH';
    END IF;

    WITH all_mapped AS (
      SELECT unnest(passenger_ids) AS passenger_id
      FROM tmp_reservation_accommodation_requirements
    )
    SELECT COUNT(*)
    INTO mapped_passenger_count
    FROM all_mapped;

    IF mapped_passenger_count <> reservation_passenger_count THEN
      RAISE EXCEPTION 'PASSENGER_REQUIREMENT_COVERAGE_MISMATCH';
    END IF;

    IF EXISTS (
      WITH all_mapped AS (
        SELECT unnest(passenger_ids) AS passenger_id
        FROM tmp_reservation_accommodation_requirements
      )
      SELECT passenger_id
      FROM all_mapped
      GROUP BY passenger_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_PASSENGER_REQUIREMENT_MAPPING';
    END IF;

    IF EXISTS (
      WITH all_mapped AS (
        SELECT unnest(passenger_ids) AS passenger_id
        FROM tmp_reservation_accommodation_requirements
      )
      SELECT 1
      FROM all_mapped m
      LEFT JOIN public.departure_passengers p
        ON p.id = m.passenger_id
       AND p.org_id = p_org_id
       AND p.reservation_id = p_reservation_id
       AND p.departure_id = reservation_row.departure_id
      WHERE p.id IS NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_PASSENGER_REQUIREMENT_MAPPING';
    END IF;
  END IF;

  FOR requirement_row IN
    SELECT *
    FROM tmp_reservation_accommodation_requirements
    ORDER BY hotel_allocation_id
  LOOP
    SELECT ha.*
    INTO allocation_row
    FROM public.hotel_allocations ha
    WHERE ha.id = requirement_row.hotel_allocation_id
      AND ha.org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ALLOTMENT_NOT_FOUND';
    END IF;

    IF allocation_row.departure_id <> reservation_row.departure_id THEN
      RAISE EXCEPTION 'ALLOTMENT_WRONG_DEPARTURE';
    END IF;

    IF requirement_row.guests_expected > requirement_row.room_count * GREATEST(1, allocation_row.capacity_per_room) THEN
      RAISE EXCEPTION 'ACCOMMODATION_LINE_CAPACITY_INSUFFICIENT';
    END IF;

    SELECT COALESCE(SUM(rar.room_count), 0)
    INTO sold_other
    FROM public.reservation_accommodation_requirements rar
    JOIN public.reservations r ON r.id = rar.reservation_id
    WHERE rar.org_id = p_org_id
      AND rar.hotel_allocation_id = requirement_row.hotel_allocation_id
      AND rar.reservation_id <> p_reservation_id
      AND r.status IN ('pending', 'confirmed', 'completed');

    IF sold_other + requirement_row.room_count > allocation_row.rooms_reserved THEN
      RAISE EXCEPTION 'ACCOMMODATION_OVERBOOKED';
    END IF;

    INSERT INTO public.reservation_accommodation_requirements (
      org_id,
      reservation_id,
      departure_id,
      hotel_allocation_id,
      hotel_id,
      room_type,
      room_label,
      room_count,
      guests_expected,
      capacity_per_room,
      unit_sell_price,
      unit_net_price,
      total_sell_price,
      notes
    )
    VALUES (
      p_org_id,
      p_reservation_id,
      reservation_row.departure_id,
      allocation_row.id,
      allocation_row.hotel_id,
      allocation_row.room_type,
      allocation_row.room_label,
      requirement_row.room_count,
      requirement_row.guests_expected,
      GREATEST(1, allocation_row.capacity_per_room),
      COALESCE(allocation_row.sell_price, 0),
      COALESCE(allocation_row.net_price, allocation_row.price_per_night, 0),
      COALESCE(allocation_row.sell_price, 0) * requirement_row.room_count,
      requirement_row.notes
    )
    ON CONFLICT (reservation_id, hotel_allocation_id) DO UPDATE
    SET departure_id = EXCLUDED.departure_id,
        hotel_id = EXCLUDED.hotel_id,
        room_type = EXCLUDED.room_type,
        room_label = EXCLUDED.room_label,
        room_count = EXCLUDED.room_count,
        guests_expected = EXCLUDED.guests_expected,
        capacity_per_room = EXCLUDED.capacity_per_room,
        unit_sell_price = EXCLUDED.unit_sell_price,
        unit_net_price = EXCLUDED.unit_net_price,
        total_sell_price = EXCLUDED.total_sell_price,
        notes = EXCLUDED.notes,
        updated_at = now();

    UPDATE tmp_reservation_accommodation_requirements tmp
    SET requirement_id = rar.id
    FROM public.reservation_accommodation_requirements rar
    WHERE rar.org_id = p_org_id
      AND rar.reservation_id = p_reservation_id
      AND rar.hotel_allocation_id = tmp.hotel_allocation_id
      AND tmp.hotel_allocation_id = requirement_row.hotel_allocation_id;
  END LOOP;

  UPDATE public.departure_passengers
  SET reservation_accommodation_requirement_id = NULL
  WHERE org_id = p_org_id
    AND reservation_id = p_reservation_id
    AND departure_id = reservation_row.departure_id;

  IF reservation_passenger_count > 0 THEN
    UPDATE public.departure_passengers p
    SET reservation_accommodation_requirement_id = mapped.requirement_id
    FROM (
      SELECT requirement_id, unnest(passenger_ids) AS passenger_id
      FROM tmp_reservation_accommodation_requirements
      WHERE requirement_id IS NOT NULL
        AND passenger_ids IS NOT NULL
    ) AS mapped
    WHERE p.id = mapped.passenger_id
      AND p.org_id = p_org_id
      AND p.reservation_id = p_reservation_id
      AND p.departure_id = reservation_row.departure_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.departure_room_slot_assignments a
    JOIN public.departure_passengers p
      ON p.id = a.passenger_id
     AND p.org_id = a.org_id
    JOIN public.departure_room_slots s
      ON s.id = a.room_slot_id
     AND s.org_id = a.org_id
    LEFT JOIN public.reservation_accommodation_requirements rar
      ON rar.id = p.reservation_accommodation_requirement_id
    WHERE a.org_id = p_org_id
      AND p.reservation_id = p_reservation_id
      AND p.departure_id = reservation_row.departure_id
      AND rar.id IS NOT NULL
      AND (
        rar.hotel_id <> s.hotel_id
        OR rar.hotel_allocation_id <> s.hotel_allocation_id
        OR rar.room_type <> s.room_type
      )
  ) THEN
    RAISE EXCEPTION 'EXISTING_ROOM_ASSIGNMENT_CONFLICT';
  END IF;

  DELETE FROM public.reservation_accommodation_requirements rar
  WHERE rar.org_id = p_org_id
    AND rar.reservation_id = p_reservation_id
    AND NOT EXISTS (
      SELECT 1
      FROM tmp_reservation_accommodation_requirements tmp
      WHERE tmp.hotel_allocation_id = rar.hotel_allocation_id
    );

  RETURN QUERY
    SELECT rar.id, rar.reservation_id, rar.departure_id, rar.hotel_allocation_id, rar.hotel_id,
      rar.room_type, rar.room_label, rar.room_count, rar.guests_expected, rar.capacity_per_room,
      rar.unit_sell_price, rar.unit_net_price, rar.total_sell_price, rar.notes
    FROM public.reservation_accommodation_requirements rar
    WHERE rar.org_id = p_org_id
      AND rar.reservation_id = p_reservation_id
    ORDER BY rar.hotel_allocation_id;
END;
$$;

COMMENT ON FUNCTION public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB)
IS 'Atomically replaces the full reservation accommodation requirement set, validates coverage and inventory, and updates passenger-to-requirement mappings.';

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

  IF passenger_row.reservation_accommodation_requirement_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.reservation_accommodation_requirements rar
      WHERE rar.org_id = NEW.org_id
        AND rar.reservation_id = passenger_row.reservation_id
    ) THEN
      RAISE EXCEPTION 'PASSENGER_REQUIREMENT_UNASSIGNED';
    END IF;
  ELSE
    SELECT *
    INTO requirement_row
    FROM public.reservation_accommodation_requirements rar
    WHERE rar.id = passenger_row.reservation_accommodation_requirement_id
      AND rar.org_id = NEW.org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACCOMMODATION_REQUIREMENT_NOT_FOUND';
    END IF;

    IF requirement_row.hotel_id <> slot_row.hotel_id
      OR requirement_row.hotel_allocation_id <> slot_row.hotel_allocation_id
      OR requirement_row.room_type <> slot_row.room_type THEN
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
