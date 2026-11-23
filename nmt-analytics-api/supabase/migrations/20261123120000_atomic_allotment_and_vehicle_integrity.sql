BEGIN;

-- Harden sync_departure_room_slots_atomic:
-- 1) Pin search_path = '' for SECURITY DEFINER hygiene.
-- 2) Lock departure (FOR SHARE), target hotel_allocations (FOR UPDATE), and
--    relevant departure_room_slots in deterministic (slot_number, id) order
--    FOR UPDATE before checking excess occupancy or deleting excess slots.
--    This eliminates the race between COUNT(assignments) and DELETE(slots)
--    ON DELETE CASCADE against concurrent assign/move/apply_rooming_proposal.
CREATE OR REPLACE FUNCTION public.sync_departure_room_slots_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_hotel_allocation_id UUID DEFAULT NULL
)
RETURNS TABLE (slot_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  alloc RECORD;
  current_max INTEGER;
  seq INTEGER;
  excess_occupied INTEGER;
  removed_count INTEGER;
BEGIN
  PERFORM 1
    FROM public.departures d
   WHERE d.id = p_departure_id AND d.org_id = p_org_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  FOR alloc IN
    SELECT ha.id, ha.org_id, ha.departure_id, ha.hotel_id, ha.room_type, ha.room_label, ha.rooms_reserved, ha.capacity_per_room
      FROM public.hotel_allocations ha
     WHERE ha.org_id = p_org_id
       AND ha.departure_id = p_departure_id
       AND (p_hotel_allocation_id IS NULL OR ha.id = p_hotel_allocation_id)
     ORDER BY ha.sort_order ASC, ha.id ASC
     FOR UPDATE
  LOOP
    -- Lock all existing slots for this allocation in deterministic order so
    -- concurrent assign/move triggers (which lock departure_room_slots FOR UPDATE)
    -- serialize cleanly and cannot slip an assignment between COUNT and DELETE CASCADE.
    PERFORM s.id
      FROM public.departure_room_slots s
     WHERE s.org_id = p_org_id
       AND s.departure_id = p_departure_id
       AND s.hotel_allocation_id = alloc.id
     ORDER BY s.slot_number ASC, s.id ASC
     FOR UPDATE;

    SELECT COALESCE(MAX(s.slot_number), 0)
      INTO current_max
      FROM public.departure_room_slots s
     WHERE s.org_id = p_org_id
       AND s.departure_id = p_departure_id
       AND s.hotel_allocation_id = alloc.id;

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

REVOKE ALL ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID)
  TO service_role;

-- Atomic departure hotel allotment update + room-slot sync.
-- Lock hierarchy (deadlock-free with apply_rooming_proposal_atomic, manual
-- assign/move trigger enforce_departure_room_slot_assignment, and
-- upsert_reservation_accommodation_requirement_atomic):
--   1) departures FOR SHARE
--   2) hotel_allocations FOR UPDATE
--   3) departure_room_slots ORDER BY slot_number ASC, id ASC FOR UPDATE
-- Any conflict (ALLOTMENT_BELOW_RESERVED or ROOM_SLOT_OCCUPIED) rolls back
-- the entire mutation atomically.
CREATE OR REPLACE FUNCTION public.update_departure_accommodation_allotment_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_item_id UUID,
  p_room_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alloc public.hotel_allocations%ROWTYPE;
  v_sold_rooms INTEGER;
  v_hotel JSONB;
BEGIN
  IF p_room_count IS NULL OR p_room_count < 0 OR p_room_count > 1000 THEN
    RAISE EXCEPTION 'INVALID_ALLOTMENT_ROOM_COUNT' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.departures d
   WHERE d.id = p_departure_id
     AND d.org_id = p_org_id
   FOR SHARE;

  SELECT *
    INTO v_alloc
    FROM public.hotel_allocations ha
   WHERE ha.id = p_item_id
     AND ha.departure_id = p_departure_id
     AND ha.org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALLOTMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Lock relevant operational slots in deterministic order before validating
  -- and syncing so concurrent assign/move/apply transactions serialize safely.
  PERFORM s.id
    FROM public.departure_room_slots s
   WHERE s.org_id = p_org_id
     AND s.departure_id = p_departure_id
     AND s.hotel_allocation_id = p_item_id
   ORDER BY s.slot_number ASC, s.id ASC
   FOR UPDATE;

  SELECT COALESCE(SUM(rar.room_count), 0)::INTEGER
    INTO v_sold_rooms
    FROM public.reservation_accommodation_requirements rar
    JOIN public.reservations r
      ON r.id = rar.reservation_id
     AND r.org_id = rar.org_id
   WHERE rar.org_id = p_org_id
     AND rar.hotel_allocation_id = p_item_id
     AND r.status <> 'cancelled';

  IF p_room_count < v_sold_rooms THEN
    RAISE EXCEPTION 'ALLOTMENT_BELOW_RESERVED:%', v_sold_rooms USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hotel_allocations
     SET rooms_reserved = p_room_count
   WHERE id = p_item_id
     AND departure_id = p_departure_id
     AND org_id = p_org_id
  RETURNING * INTO v_alloc;

  PERFORM public.sync_departure_room_slots_atomic(p_org_id, p_departure_id, p_item_id);

  SELECT jsonb_build_object(
           'id', h.id,
           'name', h.name,
           'destination', h.destination,
           'stars', h.stars
         )
    INTO v_hotel
    FROM public.hotels h
   WHERE h.id = v_alloc.hotel_id
     AND h.org_id = p_org_id;

  RETURN to_jsonb(v_alloc) || jsonb_build_object(
    'sold_rooms', v_sold_rooms,
    'hotels', COALESCE(v_hotel, 'null'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_departure_accommodation_allotment_atomic(UUID, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_departure_accommodation_allotment_atomic(UUID, UUID, UUID, INTEGER)
  TO service_role;

-- Harden update_vehicle_atomic while keeping its exact 6-argument signature:
-- - Pin search_path = '' for SECURITY DEFINER hygiene.
-- - Allow explicit clearing of registration_number by passing '' (empty string),
--   while NULL preserves the existing registration_number when the field is omitted.
-- - Reject whitespace-only labels, out-of-range capacities, or unsupported layouts.
CREATE OR REPLACE FUNCTION public.update_vehicle_atomic(
  p_org_id              UUID,
  p_departure_id        UUID,
  p_vehicle_label       TEXT,
  p_registration_number TEXT,
  p_capacity            INT,
  p_layout_type         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_departure       RECORD;
  v_existing        RECORD;
  v_vehicle_id      UUID;
  v_new_capacity    INT;
  v_occupied_above  INT;
  v_seat            INT;
  v_row             INT;
  v_col             INT;
  v_clean_label     TEXT;
  v_clean_reg       TEXT;
BEGIN
  IF p_vehicle_label IS NOT NULL THEN
    v_clean_label := btrim(p_vehicle_label);
    IF length(v_clean_label) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'INVALID_VEHICLE_INPUT' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_registration_number IS NOT NULL THEN
    v_clean_reg := NULLIF(btrim(p_registration_number), '');
    IF v_clean_reg IS NOT NULL AND length(v_clean_reg) > 50 THEN
      RAISE EXCEPTION 'INVALID_VEHICLE_INPUT' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_capacity IS NOT NULL AND (p_capacity < 1 OR p_capacity > 500) THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_INPUT' USING ERRCODE = '22023';
  END IF;

  IF p_layout_type IS NOT NULL AND p_layout_type <> 'standard_2_plus_2' THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT id, transport_type, capacity
    INTO v_departure
    FROM public.departures
   WHERE id = p_departure_id AND org_id = p_org_id
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPARTURE_NOT_FOUND'; END IF;
  IF v_departure.transport_type <> 'bus' THEN RAISE EXCEPTION 'NOT_BUS_DEPARTURE'; END IF;

  SELECT id, capacity
    INTO v_existing
    FROM public.departure_vehicle_assignments
   WHERE departure_id = p_departure_id AND org_id = p_org_id
   FOR UPDATE;

  v_new_capacity := COALESCE(p_capacity, v_existing.capacity, v_departure.capacity);
  IF v_new_capacity < 1 OR v_new_capacity > 500 THEN
    RAISE EXCEPTION 'INVALID_VEHICLE_INPUT' USING ERRCODE = '22023';
  END IF;
  IF v_new_capacity < v_departure.capacity THEN RAISE EXCEPTION 'CAPACITY_TOO_LOW'; END IF;

  IF v_existing.id IS NOT NULL AND v_new_capacity < v_existing.capacity THEN
    SELECT COUNT(*) INTO v_occupied_above
      FROM public.departure_passengers
     WHERE departure_id = p_departure_id AND org_id = p_org_id
       AND seat_number IS NOT NULL AND seat_number > v_new_capacity;
    IF v_occupied_above > 0 THEN
      RAISE EXCEPTION 'VEHICLE_CHANGE_CONFLICT: % occupied seats above new capacity', v_occupied_above;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.departure_vehicle_assignments
       SET vehicle_label = COALESCE(v_clean_label, vehicle_label),
           registration_number = CASE WHEN p_registration_number IS NULL THEN registration_number ELSE v_clean_reg END,
           capacity = v_new_capacity,
           layout_type = COALESCE(p_layout_type, layout_type),
           updated_at = now()
     WHERE id = v_existing.id;
    v_vehicle_id := v_existing.id;
  ELSE
    INSERT INTO public.departure_vehicle_assignments (
      org_id, departure_id, vehicle_label, registration_number, capacity, layout_type
    ) VALUES (
      p_org_id,
      p_departure_id,
      COALESCE(v_clean_label, 'Bus ' || left(p_departure_id::text, 8)),
      v_clean_reg,
      v_new_capacity,
      COALESCE(p_layout_type, 'standard_2_plus_2')
    )
    RETURNING id INTO v_vehicle_id;
  END IF;

  UPDATE public.departure_vehicle_seats
     SET is_active = false
   WHERE departure_vehicle_assignment_id = v_vehicle_id AND seat_number > v_new_capacity;

  FOR v_seat IN 1..v_new_capacity LOOP
    v_row := ((v_seat - 1) / 4) + 1;
    v_col := (v_seat - 1) % 4;
    INSERT INTO public.departure_vehicle_seats (
      org_id, departure_vehicle_assignment_id, departure_id, seat_number, seat_label,
      row_number, column_index, side, is_active
    ) VALUES (
      p_org_id, v_vehicle_id, p_departure_id, v_seat, 'Seat ' || v_seat,
      v_row, v_col, CASE WHEN v_col < 2 THEN 'left' ELSE 'right' END, true
    )
    ON CONFLICT (departure_vehicle_assignment_id, seat_number)
    DO UPDATE SET is_active = true, seat_label = EXCLUDED.seat_label;
  END LOOP;

  RETURN (
    SELECT jsonb_build_object(
      'vehicle', to_jsonb(vehicle),
      'seats', COALESCE((
        SELECT jsonb_agg(to_jsonb(seat) ORDER BY seat.seat_number)
          FROM (
            SELECT id, seat_number, seat_label, row_number, column_index, side, is_active
              FROM public.departure_vehicle_seats
             WHERE departure_vehicle_assignment_id = vehicle.id AND is_active = true
          ) seat
      ), '[]'::jsonb)
    )
    FROM (
      SELECT id, vehicle_label, registration_number, capacity, layout_type, created_at, updated_at
        FROM public.departure_vehicle_assignments
       WHERE id = v_vehicle_id
    ) vehicle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_vehicle_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_vehicle_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
