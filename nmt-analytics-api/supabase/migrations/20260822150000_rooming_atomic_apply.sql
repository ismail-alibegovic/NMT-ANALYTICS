-- ===============================================================
-- Phase 6C: Atomic Rooming Apply RPC
-- Replaces the sequential-insert loop in rooming.ts with a single
-- Postgres transaction that validates + inserts atomically.
-- ===============================================================

CREATE OR REPLACE FUNCTION apply_accommodation_assignments_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_assignments JSONB  -- [{passengerId, roomId, passengerName}, ...]
)
RETURNS TABLE (
  applied_count INT,
  error_detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec JSONB;
  v_passenger_exists BOOLEAN;
  v_room RECORD;
  v_current_occupied INT;
  v_assignment_count INT := 0;
BEGIN
  -- Lock the accommodation tables to prevent concurrent assignments
  -- on the same departure during this batch.
  PERFORM 1 FROM accommodation_buildings
    WHERE departure_id = p_departure_id AND org_id = p_org_id
    FOR UPDATE;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    -- Validate passenger exists, belongs to org + departure, and is unassigned
    SELECT EXISTS(
      SELECT 1 FROM departure_passengers
      WHERE id = (rec->>'passengerId')::UUID
        AND org_id = p_org_id
        AND departure_id = p_departure_id
    ) INTO v_passenger_exists;

    IF NOT v_passenger_exists THEN
      error_detail := format('Passenger %s not found in this departure/org', rec->>'passengerId');
      RAISE EXCEPTION '%', error_detail;
    END IF;

    -- Check passenger is not already assigned
    IF EXISTS(
      SELECT 1 FROM accommodation_assignments
      WHERE passenger_id = (rec->>'passengerId')::UUID
        AND org_id = p_org_id
    ) THEN
      error_detail := format('Passenger %s is already assigned', rec->>'passengerName');
      RAISE EXCEPTION '%', error_detail;
    END IF;

    -- Validate room exists with capacity
    SELECT r.id, r.capacity
    INTO v_room
    FROM accommodation_rooms r
    JOIN accommodation_buildings b ON r.building_id = b.id
    WHERE r.id = (rec->>'roomId')::UUID
      AND r.org_id = p_org_id
      AND b.departure_id = p_departure_id;

    IF NOT FOUND THEN
      error_detail := format('Room %s not found for this departure/org', rec->>'roomId');
      RAISE EXCEPTION '%', error_detail;
    END IF;

    -- Check capacity
    SELECT COUNT(*) INTO v_current_occupied
    FROM accommodation_assignments
    WHERE room_id = (rec->>'roomId')::UUID
      AND org_id = p_org_id;

    IF v_current_occupied >= v_room.capacity THEN
      error_detail := format('Room (capacity %s) is full', v_room.capacity);
      RAISE EXCEPTION '%', error_detail;
    END IF;

    -- Insert assignment
    INSERT INTO accommodation_assignments (
      org_id, room_id, passenger_id, passenger_name, assigned_by
    ) VALUES (
      p_org_id,
      (rec->>'roomId')::UUID,
      (rec->>'passengerId')::UUID,
      rec->>'passengerName',
      NULL  -- assigned_by set from application context
    );

    v_assignment_count := v_assignment_count + 1;
  END LOOP;

  applied_count := v_assignment_count;
  error_detail := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION apply_accommodation_assignments_atomic IS
  'Atomically validates and inserts accommodation assignments for a batch of passengers. All-or-nothing: if any validation fails, the entire batch is rolled back.';
