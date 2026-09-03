-- M11.1 corrective: atomic vehicle update + manual seat/lock RPCs.
-- Replaces route-level check-then-update patterns with single-transaction
-- server functions so seat state and physical seat sync are race-safe.
-- The already-applied foundation migration 20260904000000 (table DDL + backfill)
-- is NOT modified.
-- No automatic seating (M12 later).

-- ---------------------------------------------------------------------------
-- 1) Atomic vehicle create/update + physical seat synchronisation
-- ---------------------------------------------------------------------------
-- On create: creates the vehicle and seats 1..N.
-- On capacity increase: creates missing seats up to N.
-- On capacity decrease: fails if any seat > N is occupied, otherwise
-- deactivates seats > N. Vehicle capacity must remain >= departure.capacity.
-- ---------------------------------------------------------------------------
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
SET search_path = public
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
BEGIN
  -- Verify the departure exists in the caller org and is a bus.
  SELECT id, transport_type, capacity
    INTO v_departure
    FROM public.departures
   WHERE id = p_departure_id
     AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  IF v_departure.transport_type <> 'bus' THEN
    RAISE EXCEPTION 'NOT_BUS_DEPARTURE';
  END IF;

  -- Look up (and lock) the existing vehicle assignment.
  SELECT id, capacity
    INTO v_existing
    FROM public.departure_vehicle_assignments
   WHERE departure_id = p_departure_id
     AND org_id = p_org_id
   FOR UPDATE;

  v_new_capacity := COALESCE(p_capacity, v_existing.capacity, v_departure.capacity);

  IF v_new_capacity < v_departure.capacity THEN
    RAISE EXCEPTION 'CAPACITY_TOO_LOW';
  END IF;

  -- Capacity decrease guard: no occupied seat may sit above the new capacity.
  IF v_existing.id IS NOT NULL AND v_new_capacity < v_existing.capacity THEN
    SELECT COUNT(*) INTO v_occupied_above
      FROM public.departure_passengers
     WHERE departure_id = p_departure_id
       AND org_id = p_org_id
       AND seat_number IS NOT NULL
       AND seat_number > v_new_capacity;

    IF v_occupied_above > 0 THEN
      RAISE EXCEPTION 'VEHICLE_CHANGE_CONFLICT: % occupied seats above new capacity', v_occupied_above;
    END IF;
  END IF;

  -- Upsert the vehicle assignment.
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.departure_vehicle_assignments
       SET vehicle_label       = COALESCE(p_vehicle_label, vehicle_label),
           registration_number = CASE WHEN p_registration_number IS NULL
                                      THEN registration_number
                                      ELSE p_registration_number END,
           capacity            = v_new_capacity,
           layout_type         = COALESCE(p_layout_type, layout_type),
           updated_at          = now()
     WHERE id = v_existing.id;

    v_vehicle_id := v_existing.id;
  ELSE
    INSERT INTO public.departure_vehicle_assignments (
      org_id, departure_id, vehicle_label, registration_number,
      capacity, layout_type
    ) VALUES (
      p_org_id,
      p_departure_id,
      COALESCE(p_vehicle_label, 'Bus ' || left(p_departure_id::text, 8)),
      p_registration_number,
      v_new_capacity,
      COALESCE(p_layout_type, 'standard_2_plus_2')
    )
    RETURNING id INTO v_vehicle_id;
  END IF;

  -- Deactivate seats above the new capacity (idempotent).
  UPDATE public.departure_vehicle_seats
     SET is_active = false
   WHERE departure_vehicle_assignment_id = v_vehicle_id
     AND seat_number > v_new_capacity;

  -- Ensure active physical seats exist for exactly 1..N (standard 2+2).
  FOR v_seat IN 1..v_new_capacity LOOP
    v_row := ((v_seat - 1) / 4) + 1;
    v_col := (v_seat - 1) % 4;

    INSERT INTO public.departure_vehicle_seats (
      org_id, departure_vehicle_assignment_id, departure_id,
      seat_number, seat_label, row_number, column_index, side, is_active
    ) VALUES (
      p_org_id,
      v_vehicle_id,
      p_departure_id,
      v_seat,
      'Seat ' || v_seat,
      v_row,
      v_col,
      CASE WHEN v_col < 2 THEN 'left' ELSE 'right' END,
      true
    )
    ON CONFLICT (departure_vehicle_assignment_id, seat_number)
    DO UPDATE SET is_active = true, seat_label = EXCLUDED.seat_label;
  END LOOP;

  -- Return canonical vehicle + seats shape consumed by the API.
  RETURN (
    SELECT jsonb_build_object(
      'vehicle', jsonb_build_object(
        'id', dva.id,
        'vehicle_label', dva.vehicle_label,
        'registration_number', dva.registration_number,
        'capacity', dva.capacity,
        'layout_type', dva.layout_type,
        'created_at', dva.created_at,
        'updated_at', dva.updated_at
      ),
      'seats', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', dvs.id,
            'seat_number', dvs.seat_number,
            'seat_label', dvs.seat_label,
            'row_number', dvs.row_number,
            'column_index', dvs.column_index,
            'side', dvs.side,
            'is_active', dvs.is_active
          ) ORDER BY dvs.seat_number
        ) FILTER (WHERE dvs.id IS NOT NULL),
        '[]'::jsonb
      )
    )
    FROM public.departure_vehicle_assignments dva
    LEFT JOIN public.departure_vehicle_seats dvs
      ON dvs.departure_vehicle_assignment_id = dva.id
     AND dvs.is_active = true
    WHERE dva.id = v_vehicle_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Atomic manual seat assign / unassign
-- ---------------------------------------------------------------------------
-- seat_number NULL => unassign (clears manual + lock flags).
-- Otherwise assign to an active, unoccupied seat. Locks the passenger row and
-- enforces BUS-only, vehicle existence, seat-lock and seat-conflict rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manual_seat_assign(
  p_org_id       UUID,
  p_passenger_id UUID,
  p_seat_number  INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passenger RECORD;
  v_departure RECORD;
  v_vehicle   RECORD;
  v_target    RECORD;
  v_updated   JSONB;
BEGIN
  -- Lock the passenger row.
  SELECT dp.id, dp.departure_id, dp.seat_number, dp.seat_locked
    INTO v_passenger
    FROM public.departure_passengers dp
   WHERE dp.id = p_passenger_id
     AND dp.org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASSENGER_NOT_FOUND';
  END IF;

  -- Verify the departure.
  SELECT d.id, d.transport_type
    INTO v_departure
    FROM public.departures d
   WHERE d.id = v_passenger.departure_id
     AND d.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  IF v_departure.transport_type <> 'bus' THEN
    RAISE EXCEPTION 'NOT_BUS_DEPARTURE';
  END IF;

  -- Verify a vehicle is configured.
  SELECT dva.id
    INTO v_vehicle
    FROM public.departure_vehicle_assignments dva
   WHERE dva.departure_id = v_departure.id
     AND dva.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- Unassign.
  IF p_seat_number IS NULL THEN
    IF v_passenger.seat_locked THEN
      RAISE EXCEPTION 'SEAT_LOCKED';
    END IF;

    UPDATE public.departure_passengers
       SET seat_number    = NULL,
           seat_is_manual = false,
           seat_locked    = false
     WHERE id = p_passenger_id
     RETURNING to_jsonb(departure_passengers.*) INTO v_updated;

    RETURN v_updated;
  END IF;

  -- Assign.
  IF v_passenger.seat_locked THEN
    RAISE EXCEPTION 'SEAT_LOCKED';
  END IF;

  -- Verify the target seat exists and is active.
  SELECT dvs.id
    INTO v_target
    FROM public.departure_vehicle_seats dvs
   WHERE dvs.departure_vehicle_assignment_id = v_vehicle.id
     AND dvs.seat_number = p_seat_number
     AND dvs.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEAT_NOT_FOUND';
  END IF;

  -- Assign. The departure+seat unique index remains the final concurrency guard.
  UPDATE public.departure_passengers
     SET seat_number    = p_seat_number,
         seat_is_manual = true
   WHERE id = p_passenger_id
   RETURNING to_jsonb(departure_passengers.*) INTO v_updated;

  RETURN v_updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Atomic manual seat lock / unlock
-- ---------------------------------------------------------------------------
-- Requires an assigned seat and a bus departure. Locks the passenger row so
-- lock state cannot race with a concurrent move/unassign.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manual_seat_lock(
  p_org_id       UUID,
  p_passenger_id UUID,
  p_locked       BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_passenger RECORD;
  v_departure RECORD;
  v_updated   JSONB;
BEGIN
  -- Lock the passenger row.
  SELECT dp.id, dp.departure_id, dp.seat_number
    INTO v_passenger
    FROM public.departure_passengers dp
   WHERE dp.id = p_passenger_id
     AND dp.org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASSENGER_NOT_FOUND';
  END IF;

  IF v_passenger.seat_number IS NULL OR v_passenger.seat_number <= 0 THEN
    RAISE EXCEPTION 'SEAT_NOT_ASSIGNED';
  END IF;

  -- Verify the departure is a bus.
  SELECT d.transport_type
    INTO v_departure
    FROM public.departures d
   WHERE d.id = v_passenger.departure_id
     AND d.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  IF v_departure.transport_type <> 'bus' THEN
    RAISE EXCEPTION 'NOT_BUS_DEPARTURE';
  END IF;

  UPDATE public.departure_passengers
     SET seat_locked = p_locked
   WHERE id = p_passenger_id
   RETURNING to_jsonb(departure_passengers.*) INTO v_updated;

  RETURN v_updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants — service_role only (server-managed).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_vehicle_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_vehicle_atomic(UUID, UUID, TEXT, TEXT, INT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.manual_seat_assign(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.manual_seat_assign(UUID, UUID, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.manual_seat_lock(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.manual_seat_lock(UUID, UUID, BOOLEAN) TO service_role;
