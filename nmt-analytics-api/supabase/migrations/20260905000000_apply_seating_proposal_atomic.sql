-- M12.2: Atomic seating proposal apply RPC.
-- Applies a reviewed M12.1 seating proposal atomically.
-- Preserves manual/locked assignments, never modifies them.
-- Enforces org/departure ownership, BUS-only, vehicle existence,
-- physical seat validity, no duplicates, no collisions.

CREATE OR REPLACE FUNCTION public.apply_seating_proposal_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_proposed JSONB
)
RETURNS TABLE (cleared_count INTEGER, applied_count INTEGER, error_detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_departure RECORD;
  v_vehicle RECORD;
  v_proposed_item JSONB;
  v_passenger RECORD;
  v_seat RECORD;
  v_existing RECORD;
  v_cleared INTEGER := 0;
  v_applied INTEGER := 0;
  v_passenger_ids UUID[] := '{}';
BEGIN
  -- 1. Validate departure belongs to org and is BUS
  SELECT d.id, d.transport_type
    INTO v_departure
    FROM public.departures d
   WHERE d.id = p_departure_id
     AND d.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  IF v_departure.transport_type <> 'bus' THEN
    RAISE EXCEPTION 'NOT_BUS_DEPARTURE';
  END IF;

  -- 2. Validate vehicle belongs to departure
  SELECT dva.id
    INTO v_vehicle
    FROM public.departure_vehicle_assignments dva
   WHERE dva.departure_id = p_departure_id
     AND dva.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- 3. Clear old automatic assignments (non-manual, non-locked) for passengers
  --    who are in the new proposal. This makes the apply idempotent and
  --    replaces old automatic assignments with the new canonical ones.
  WITH cleared AS (
    UPDATE public.departure_passengers dp
       SET seat_number = NULL,
           seat_is_manual = false,
           seat_locked = false
     WHERE dp.departure_id = p_departure_id
       AND dp.org_id = p_org_id
       AND dp.seat_is_manual = false
       AND dp.seat_locked = false
       AND dp.id = ANY(
             SELECT (p->>'passenger_id')::UUID
               FROM jsonb_array_elements(p_proposed) p
           )
    RETURNING dp.id
  )
  SELECT COUNT(*) INTO v_cleared FROM cleared;

  -- 4. Process each proposed assignment
  FOR v_proposed_item IN SELECT * FROM jsonb_array_elements(p_proposed) LOOP
    -- Lock the passenger row
    SELECT dp.id, dp.departure_id, dp.seat_number, dp.seat_is_manual, dp.seat_locked
      INTO v_passenger
      FROM public.departure_passengers dp
     WHERE dp.id = (v_proposed_item->>'passenger_id')::UUID
       AND dp.org_id = p_org_id
       AND dp.departure_id = p_departure_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PASSENGER_NOT_FOUND (%)', v_proposed_item->>'passenger_id';
    END IF;

    -- Never modify manual/locked assignments
    IF v_passenger.seat_is_manual OR v_passenger.seat_locked THEN
      RAISE EXCEPTION 'SEAT_LOCKED (%)', v_proposed_item->>'passenger_id';
    END IF;

    -- Resolve the physical seat
    SELECT dvs.id, dvs.seat_number, dvs.is_active
      INTO v_seat
      FROM public.departure_vehicle_seats dvs
     WHERE dvs.id = (v_proposed_item->>'seat_id')::UUID
       AND dvs.departure_vehicle_assignment_id = v_vehicle.id
       AND dvs.org_id = p_org_id
       AND dvs.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEAT_NOT_FOUND (%)', v_proposed_item->>'seat_id';
    END IF;

    -- Check for duplicate seat (another passenger already has it)
    SELECT dp.id
      INTO v_existing
      FROM public.departure_passengers dp
     WHERE dp.seat_number = v_seat.seat_number
       AND dp.departure_id = p_departure_id
       AND dp.org_id = p_org_id
       AND dp.id <> v_passenger.id
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'SEAT_CONFLICT (%)', v_proposed_item->>'seat_id';
    END IF;

    -- Apply the assignment
    UPDATE public.departure_passengers
       SET seat_number = v_seat.seat_number,
           seat_is_manual = false,
           seat_locked = false
     WHERE id = v_passenger.id;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN QUERY SELECT v_cleared, v_applied, NULL::TEXT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_seating_proposal_atomic(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_seating_proposal_atomic(UUID, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.apply_seating_proposal_atomic(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_seating_proposal_atomic(UUID, UUID, JSONB) TO service_role;
