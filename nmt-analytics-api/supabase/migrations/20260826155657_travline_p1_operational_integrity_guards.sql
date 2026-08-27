-- Canonical multi-tenant keys used by composite foreign keys.
ALTER TABLE public.departures
  ADD CONSTRAINT departures_id_org_key UNIQUE (id, org_id);
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_id_departure_org_key UNIQUE (id, departure_id, org_id);
ALTER TABLE public.departure_passengers
  ADD CONSTRAINT departure_passengers_id_org_key UNIQUE (id, org_id),
  ADD CONSTRAINT departure_passengers_id_reservation_org_key UNIQUE (id, reservation_id, org_id);
ALTER TABLE public.accommodation_buildings
  ADD CONSTRAINT accommodation_buildings_id_org_key UNIQUE (id, org_id);
ALTER TABLE public.accommodation_floors
  ADD CONSTRAINT accommodation_floors_id_building_org_key UNIQUE (id, building_id, org_id);
ALTER TABLE public.accommodation_rooms
  ADD CONSTRAINT accommodation_rooms_id_org_key UNIQUE (id, org_id);

ALTER TABLE public.departure_passengers
  ADD CONSTRAINT departure_passengers_reservation_departure_org_fk
  FOREIGN KEY (reservation_id, departure_id, org_id)
  REFERENCES public.reservations (id, departure_id, org_id)
  ON DELETE CASCADE;
ALTER TABLE public.departure_passengers
  ADD CONSTRAINT departure_passengers_departure_org_fk
  FOREIGN KEY (departure_id, org_id)
  REFERENCES public.departures (id, org_id)
  ON DELETE CASCADE;

ALTER TABLE public.accommodation_floors
  ADD CONSTRAINT accommodation_floors_building_org_fk
  FOREIGN KEY (building_id, org_id)
  REFERENCES public.accommodation_buildings (id, org_id)
  ON DELETE CASCADE;
ALTER TABLE public.accommodation_rooms
  ADD CONSTRAINT accommodation_rooms_building_org_fk
  FOREIGN KEY (building_id, org_id)
  REFERENCES public.accommodation_buildings (id, org_id)
  ON DELETE CASCADE,
  ADD CONSTRAINT accommodation_rooms_floor_building_org_fk
  FOREIGN KEY (floor_id, building_id, org_id)
  REFERENCES public.accommodation_floors (id, building_id, org_id)
  ON DELETE CASCADE;
ALTER TABLE public.accommodation_assignments
  ADD CONSTRAINT accommodation_assignments_room_org_fk
  FOREIGN KEY (room_id, org_id)
  REFERENCES public.accommodation_rooms (id, org_id)
  ON DELETE CASCADE,
  ADD CONSTRAINT accommodation_assignments_passenger_org_fk
  FOREIGN KEY (passenger_id, org_id)
  REFERENCES public.departure_passengers (id, org_id)
  ON DELETE CASCADE;

-- Validate assignments inside PostgreSQL and lock the room while checking capacity.
CREATE OR REPLACE FUNCTION public.trg_validate_accommodation_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_passenger_departure uuid;
  v_passenger_reservation uuid;
  v_passenger_name text;
  v_room_departure uuid;
  v_capacity integer;
  v_beds jsonb;
  v_occupied integer;
  v_bed jsonb;
BEGIN
  SELECT dp.departure_id, dp.reservation_id, dp.full_name
    INTO v_passenger_departure, v_passenger_reservation, v_passenger_name
  FROM public.departure_passengers dp
  WHERE dp.id = NEW.passenger_id
    AND dp.org_id = NEW.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Passenger does not belong to assignment organization'
      USING ERRCODE = '23503';
  END IF;

  SELECT b.departure_id, r.capacity, r.beds
    INTO v_room_departure, v_capacity, v_beds
  FROM public.accommodation_rooms r
  JOIN public.accommodation_buildings b
    ON b.id = r.building_id AND b.org_id = r.org_id
  WHERE r.id = NEW.room_id
    AND r.org_id = NEW.org_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room does not belong to assignment organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_room_departure IS DISTINCT FROM v_passenger_departure THEN
    RAISE EXCEPTION 'Passenger and room belong to different departures'
      USING ERRCODE = '23514';
  END IF;

  NEW.reservation_id := v_passenger_reservation;
  NEW.passenger_name := v_passenger_name;

  SELECT count(*) INTO v_occupied
  FROM public.accommodation_assignments aa
  WHERE aa.room_id = NEW.room_id
    AND (TG_OP = 'INSERT' OR aa.id <> NEW.id);

  IF v_occupied >= v_capacity THEN
    RAISE EXCEPTION 'Room is at capacity (%/%).', v_occupied, v_capacity
      USING ERRCODE = '23514';
  END IF;

  IF NEW.bed_label IS NOT NULL THEN
    IF v_beds IS NULL OR jsonb_typeof(v_beds) <> 'array' THEN
      RAISE EXCEPTION 'Room has no configured beds' USING ERRCODE = '23514';
    END IF;

    SELECT e.value INTO v_bed
    FROM jsonb_array_elements(v_beds) e(value)
    WHERE e.value->>'label' = NEW.bed_label
    LIMIT 1;

    IF v_bed IS NULL THEN
      RAISE EXCEPTION 'Bed % does not exist in room', NEW.bed_label USING ERRCODE = '23514';
    END IF;

    IF NULLIF(v_bed->>'assignedPassengerId', '') IS NOT NULL
       AND v_bed->>'assignedPassengerId' <> NEW.passenger_id::text THEN
      RAISE EXCEPTION 'Bed % is already occupied', NEW.bed_label USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_accommodation_assignment ON public.accommodation_assignments;
CREATE TRIGGER validate_accommodation_assignment
BEFORE INSERT OR UPDATE OF room_id, passenger_id, org_id, reservation_id, passenger_name, bed_label
ON public.accommodation_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_validate_accommodation_assignment();

-- Keep the room.beds JSON projection synchronized with relational assignments.
CREATE OR REPLACE FUNCTION public.trg_sync_accommodation_bed_json()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND (OLD.room_id, OLD.bed_label, OLD.passenger_id)
         IS DISTINCT FROM (NEW.room_id, NEW.bed_label, NEW.passenger_id)) THEN
    IF OLD.bed_label IS NOT NULL THEN
      UPDATE public.accommodation_rooms r
      SET beds = (
        SELECT jsonb_agg(
          CASE
            WHEN elem.value->>'label' = OLD.bed_label
             AND elem.value->>'assignedPassengerId' = OLD.passenger_id::text
            THEN jsonb_set(elem.value, '{assignedPassengerId}', 'null'::jsonb, true)
            ELSE elem.value
          END
          ORDER BY elem.ordinality
        )
        FROM jsonb_array_elements(r.beds) WITH ORDINALITY AS elem(value, ordinality)
      )
      WHERE r.id = OLD.room_id
        AND r.beds IS NOT NULL
        AND jsonb_typeof(r.beds) = 'array';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.bed_label IS NOT NULL THEN
    UPDATE public.accommodation_rooms r
    SET beds = (
      SELECT jsonb_agg(
        CASE
          WHEN elem.value->>'label' = NEW.bed_label
          THEN jsonb_set(elem.value, '{assignedPassengerId}', to_jsonb(NEW.passenger_id::text), true)
          ELSE elem.value
        END
        ORDER BY elem.ordinality
      )
      FROM jsonb_array_elements(r.beds) WITH ORDINALITY AS elem(value, ordinality)
    )
    WHERE r.id = NEW.room_id
      AND r.beds IS NOT NULL
      AND jsonb_typeof(r.beds) = 'array';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_accommodation_bed_json ON public.accommodation_assignments;
CREATE TRIGGER sync_accommodation_bed_json
AFTER INSERT OR UPDATE OR DELETE
ON public.accommodation_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_accommodation_bed_json();
