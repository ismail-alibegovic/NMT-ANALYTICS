-- Fix the vehicle RPC return query so PostgreSQL accepts the vehicle object
-- alongside the aggregated seat list without relying on non-standard grouping.
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
  SELECT id, transport_type, capacity
    INTO v_departure
    FROM public.departures
   WHERE id = p_departure_id AND org_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEPARTURE_NOT_FOUND'; END IF;
  IF v_departure.transport_type <> 'bus' THEN RAISE EXCEPTION 'NOT_BUS_DEPARTURE'; END IF;

  SELECT id, capacity
    INTO v_existing
    FROM public.departure_vehicle_assignments
   WHERE departure_id = p_departure_id AND org_id = p_org_id
   FOR UPDATE;

  v_new_capacity := COALESCE(p_capacity, v_existing.capacity, v_departure.capacity);
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
       SET vehicle_label = COALESCE(p_vehicle_label, vehicle_label),
           registration_number = CASE WHEN p_registration_number IS NULL THEN registration_number ELSE p_registration_number END,
           capacity = v_new_capacity,
           layout_type = COALESCE(p_layout_type, layout_type),
           updated_at = now()
     WHERE id = v_existing.id;
    v_vehicle_id := v_existing.id;
  ELSE
    INSERT INTO public.departure_vehicle_assignments (
      org_id, departure_id, vehicle_label, registration_number, capacity, layout_type
    ) VALUES (
      p_org_id, p_departure_id, COALESCE(p_vehicle_label, 'Bus ' || left(p_departure_id::text, 8)),
      p_registration_number, v_new_capacity, COALESCE(p_layout_type, 'standard_2_plus_2')
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
