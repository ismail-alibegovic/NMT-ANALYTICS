-- Reservation accommodation requirements + operational room slots.
-- Canonical model:
-- package_hotels = reusable package accommodation template
-- hotel_allocations = dated departure allotment snapshot
-- reservation_accommodation_requirements = what a reservation bought/needs
-- departure_room_slots = Travline operational room containers generated from allotment
-- departure_room_slot_assignments = passenger placement into operational slots

CREATE TABLE IF NOT EXISTS public.reservation_accommodation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  hotel_allocation_id UUID NOT NULL REFERENCES public.hotel_allocations(id) ON DELETE RESTRICT,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  room_type TEXT NOT NULL,
  room_label TEXT,
  room_count INTEGER NOT NULL DEFAULT 1,
  guests_expected INTEGER NOT NULL DEFAULT 1,
  capacity_per_room INTEGER NOT NULL DEFAULT 1,
  unit_sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_net_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservation_accommodation_room_count_positive CHECK (room_count > 0),
  CONSTRAINT reservation_accommodation_guests_positive CHECK (guests_expected > 0),
  CONSTRAINT reservation_accommodation_capacity_positive CHECK (capacity_per_room > 0),
  CONSTRAINT reservation_accommodation_prices_nonnegative CHECK (unit_sell_price >= 0 AND unit_net_price >= 0 AND total_sell_price >= 0),
  CONSTRAINT reservation_accommodation_one_requirement_per_reservation UNIQUE (reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_res_acc_org ON public.reservation_accommodation_requirements(org_id);
CREATE INDEX IF NOT EXISTS idx_res_acc_departure ON public.reservation_accommodation_requirements(org_id, departure_id);
CREATE INDEX IF NOT EXISTS idx_res_acc_allocation ON public.reservation_accommodation_requirements(org_id, hotel_allocation_id);
CREATE INDEX IF NOT EXISTS idx_res_acc_reservation ON public.reservation_accommodation_requirements(org_id, reservation_id);

ALTER TABLE public.reservation_accommodation_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservation accommodation org isolation" ON public.reservation_accommodation_requirements;
CREATE POLICY "reservation accommodation org isolation" ON public.reservation_accommodation_requirements
  FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_my_org_id()))
  WITH CHECK (org_id = (SELECT public.get_my_org_id()));

REVOKE ALL ON TABLE public.reservation_accommodation_requirements FROM anon;
REVOKE ALL ON TABLE public.reservation_accommodation_requirements FROM authenticated;
GRANT ALL ON TABLE public.reservation_accommodation_requirements TO service_role;

CREATE TABLE IF NOT EXISTS public.departure_room_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  hotel_allocation_id UUID NOT NULL REFERENCES public.hotel_allocations(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  display_label TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  actual_hotel_room_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departure_room_slots_capacity_positive CHECK (capacity > 0),
  CONSTRAINT departure_room_slots_slot_number_positive CHECK (slot_number > 0),
  CONSTRAINT departure_room_slots_unique_sequence UNIQUE (org_id, departure_id, hotel_allocation_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_departure_room_slots_org_departure ON public.departure_room_slots(org_id, departure_id);
CREATE INDEX IF NOT EXISTS idx_departure_room_slots_allocation ON public.departure_room_slots(org_id, hotel_allocation_id);

ALTER TABLE public.departure_room_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departure room slots org isolation" ON public.departure_room_slots;
CREATE POLICY "departure room slots org isolation" ON public.departure_room_slots
  FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_my_org_id()))
  WITH CHECK (org_id = (SELECT public.get_my_org_id()));

REVOKE ALL ON TABLE public.departure_room_slots FROM anon;
REVOKE ALL ON TABLE public.departure_room_slots FROM authenticated;
GRANT ALL ON TABLE public.departure_room_slots TO service_role;

CREATE TABLE IF NOT EXISTS public.departure_room_slot_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  room_slot_id UUID NOT NULL REFERENCES public.departure_room_slots(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.departure_passengers(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  passenger_name TEXT NOT NULL,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departure_room_slot_assignments_passenger_unique UNIQUE (org_id, departure_id, passenger_id),
  CONSTRAINT departure_room_slot_assignments_slot_passenger_unique UNIQUE (room_slot_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_departure_room_slot_assignments_slot ON public.departure_room_slot_assignments(org_id, room_slot_id);
CREATE INDEX IF NOT EXISTS idx_departure_room_slot_assignments_departure ON public.departure_room_slot_assignments(org_id, departure_id);
CREATE INDEX IF NOT EXISTS idx_departure_room_slot_assignments_reservation ON public.departure_room_slot_assignments(org_id, reservation_id);

ALTER TABLE public.departure_room_slot_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departure room slot assignments org isolation" ON public.departure_room_slot_assignments;
CREATE POLICY "departure room slot assignments org isolation" ON public.departure_room_slot_assignments
  FOR ALL TO authenticated
  USING (org_id = (SELECT public.get_my_org_id()))
  WITH CHECK (org_id = (SELECT public.get_my_org_id()));

REVOKE ALL ON TABLE public.departure_room_slot_assignments FROM anon;
REVOKE ALL ON TABLE public.departure_room_slot_assignments FROM authenticated;
GRANT ALL ON TABLE public.departure_room_slot_assignments TO service_role;

DROP TRIGGER IF EXISTS trg_reservation_accommodation_requirements_updated_at ON public.reservation_accommodation_requirements;
CREATE TRIGGER trg_reservation_accommodation_requirements_updated_at
BEFORE UPDATE ON public.reservation_accommodation_requirements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_departure_room_slots_updated_at ON public.departure_room_slots;
CREATE TRIGGER trg_departure_room_slots_updated_at
BEFORE UPDATE ON public.departure_room_slots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_departure_room_slot_assignments_updated_at ON public.departure_room_slot_assignments;
CREATE TRIGGER trg_departure_room_slot_assignments_updated_at
BEFORE UPDATE ON public.departure_room_slot_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_departure_room_slots_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_hotel_allocation_id UUID DEFAULT NULL
)
RETURNS TABLE (slot_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alloc RECORD;
  current_max INTEGER;
  seq INTEGER;
  excess_occupied INTEGER;
  removed_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.departures d
    WHERE d.id = p_departure_id AND d.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  FOR alloc IN
    SELECT ha.id, ha.org_id, ha.departure_id, ha.hotel_id, ha.room_type, ha.room_label, ha.rooms_reserved, ha.capacity_per_room
    FROM public.hotel_allocations ha
    WHERE ha.org_id = p_org_id
      AND ha.departure_id = p_departure_id
      AND (p_hotel_allocation_id IS NULL OR ha.id = p_hotel_allocation_id)
    ORDER BY ha.sort_order ASC, ha.id ASC
  LOOP
    SELECT COALESCE(MAX(slot_number), 0)
    INTO current_max
    FROM public.departure_room_slots
    WHERE org_id = p_org_id
      AND departure_id = p_departure_id
      AND hotel_allocation_id = alloc.id;

    IF current_max < alloc.rooms_reserved THEN
      FOR seq IN (current_max + 1)..alloc.rooms_reserved LOOP
        INSERT INTO public.departure_room_slots (
          org_id, departure_id, hotel_allocation_id, hotel_id,
          room_type, slot_number, display_label, capacity
        )
        VALUES (
          p_org_id,
          p_departure_id,
          alloc.id,
          alloc.hotel_id,
          alloc.room_type,
          seq,
          COALESCE(NULLIF(initcap(replace(alloc.room_label, '_', ' ')), ''), initcap(alloc.room_type)) || ' ' || lpad(seq::text, 2, '0'),
          GREATEST(alloc.capacity_per_room, 1)
        )
        ON CONFLICT (org_id, departure_id, hotel_allocation_id, slot_number) DO UPDATE
          SET capacity = EXCLUDED.capacity,
              room_type = EXCLUDED.room_type,
              hotel_id = EXCLUDED.hotel_id;
      END LOOP;
    ELSIF current_max > alloc.rooms_reserved THEN
      SELECT COUNT(*)
      INTO excess_occupied
      FROM public.departure_room_slots s
      JOIN public.departure_room_slot_assignments a ON a.room_slot_id = s.id
      WHERE s.org_id = p_org_id
        AND s.departure_id = p_departure_id
        AND s.hotel_allocation_id = alloc.id
        AND s.slot_number > alloc.rooms_reserved;

      IF excess_occupied > 0 THEN
        RAISE EXCEPTION 'ROOM_SLOT_OCCUPIED';
      END IF;

      DELETE FROM public.departure_room_slots s
      WHERE s.org_id = p_org_id
        AND s.departure_id = p_departure_id
        AND s.hotel_allocation_id = alloc.id
        AND s.slot_number > alloc.rooms_reserved;
      GET DIAGNOSTICS removed_count = ROW_COUNT;
    END IF;

    UPDATE public.departure_room_slots s
    SET capacity = GREATEST(alloc.capacity_per_room, 1),
        room_type = alloc.room_type,
        hotel_id = alloc.hotel_id
    WHERE s.org_id = p_org_id
      AND s.departure_id = p_departure_id
      AND s.hotel_allocation_id = alloc.id
      AND s.slot_number <= alloc.rooms_reserved;
  END LOOP;

  RETURN QUERY
    SELECT COUNT(*)::INTEGER
    FROM public.departure_room_slots s
    WHERE s.org_id = p_org_id
      AND s.departure_id = p_departure_id
      AND (p_hotel_allocation_id IS NULL OR s.hotel_allocation_id = p_hotel_allocation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_reservation_accommodation_requirement_atomic(
  p_org_id UUID,
  p_reservation_id UUID,
  p_hotel_allocation_id UUID,
  p_room_count INTEGER,
  p_guests_expected INTEGER,
  p_notes TEXT DEFAULT NULL
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
  res_row RECORD;
  alloc_row RECORD;
  existing_row RECORD;
  sold_rooms INTEGER;
  available_rooms INTEGER;
  v_total NUMERIC;
BEGIN
  IF p_room_count < 1 THEN
    RAISE EXCEPTION 'ROOM_COUNT_INVALID';
  END IF;
  IF p_guests_expected < 1 THEN
    RAISE EXCEPTION 'GUESTS_INVALID';
  END IF;

  SELECT r.id, r.org_id, r.departure_id, r.status
  INTO res_row
  FROM public.reservations r
  WHERE r.id = p_reservation_id AND r.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  IF res_row.departure_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_HAS_NO_DEPARTURE';
  END IF;
  IF res_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED';
  END IF;

  SELECT ha.*
  INTO alloc_row
  FROM public.hotel_allocations ha
  WHERE ha.id = p_hotel_allocation_id
    AND ha.org_id = p_org_id
    AND ha.departure_id = res_row.departure_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALLOTMENT_NOT_FOUND';
  END IF;

  SELECT *
  INTO existing_row
  FROM public.reservation_accommodation_requirements rar
  WHERE rar.org_id = p_org_id AND rar.reservation_id = p_reservation_id
  FOR UPDATE;

  SELECT COALESCE(SUM(rar.room_count), 0)::INTEGER
  INTO sold_rooms
  FROM public.reservation_accommodation_requirements rar
  JOIN public.reservations r ON r.id = rar.reservation_id AND r.org_id = rar.org_id
  WHERE rar.org_id = p_org_id
    AND rar.hotel_allocation_id = p_hotel_allocation_id
    AND r.status <> 'cancelled'
    AND rar.reservation_id <> p_reservation_id;

  available_rooms := alloc_row.rooms_reserved - sold_rooms;
  IF p_room_count > available_rooms THEN
    RAISE EXCEPTION 'ACCOMMODATION_OVERBOOKED';
  END IF;

  IF p_guests_expected > (p_room_count * GREATEST(alloc_row.capacity_per_room, 1)) THEN
    RAISE EXCEPTION 'ACCOMMODATION_CAPACITY_INSUFFICIENT';
  END IF;

  v_total := p_room_count * COALESCE(alloc_row.sell_price, 0);

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
    res_row.departure_id,
    alloc_row.id,
    alloc_row.hotel_id,
    alloc_row.room_type,
    alloc_row.room_label,
    p_room_count,
    p_guests_expected,
    GREATEST(alloc_row.capacity_per_room, 1),
    COALESCE(alloc_row.sell_price, 0),
    COALESCE(alloc_row.net_price, alloc_row.price_per_night, 0),
    v_total,
    p_notes
  )
  ON CONFLICT (reservation_id)
  DO UPDATE SET
    departure_id = EXCLUDED.departure_id,
    hotel_allocation_id = EXCLUDED.hotel_allocation_id,
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

  RETURN QUERY
    SELECT rar.id, rar.reservation_id, rar.departure_id, rar.hotel_allocation_id, rar.hotel_id,
      rar.room_type, rar.room_label, rar.room_count, rar.guests_expected, rar.capacity_per_room,
      rar.unit_sell_price, rar.unit_net_price, rar.total_sell_price, rar.notes
    FROM public.reservation_accommodation_requirements rar
    WHERE rar.org_id = p_org_id AND rar.reservation_id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_departure_room_slot_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  slot_row RECORD;
  passenger_row RECORD;
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

DROP TRIGGER IF EXISTS trg_enforce_departure_room_slot_assignment ON public.departure_room_slot_assignments;
CREATE TRIGGER trg_enforce_departure_room_slot_assignment
BEFORE INSERT OR UPDATE ON public.departure_room_slot_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_departure_room_slot_assignment();

COMMENT ON TABLE public.reservation_accommodation_requirements IS 'Canonical reservation accommodation requirement: what the customer bought/needs for a departure allotment';
COMMENT ON TABLE public.departure_room_slots IS 'Travline operational room slots generated from departure hotel allotments; not supplier physical room numbers';
COMMENT ON TABLE public.departure_room_slot_assignments IS 'Passenger assignments into Travline operational room slots';
