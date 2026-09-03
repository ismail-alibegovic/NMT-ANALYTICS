-- corrective: replace apply_rooming_proposal_atomic with row-locked replaceable-assignment validation
-- 20260903080000 is already live; this is append-only

CREATE OR REPLACE FUNCTION apply_rooming_proposal_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_replaceable_assignment_ids UUID[],
  p_proposed JSONB,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS TABLE(
  deleted_count INTEGER,
  inserted_count INTEGER,
  error_detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_inserted INTEGER := 0;
  v_count INTEGER;
  v_actual_count INTEGER;
  v_proposed JSONB;
  v_pax JSONB;
  v_req JSONB;
  v_slot JSONB;
  v_occ INTEGER;
  v_cap INTEGER;
  v_assignment_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- validate departure ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.departures
    WHERE id = p_departure_id AND org_id = p_org_id
  ) THEN
    error_detail := 'DEPARTURE_NOT_FOUND';
    RETURN QUERY SELECT 0, 0, error_detail;
    RETURN;
  END IF;

  -- lock and validate every expected replaceable assignment before deleting
  -- this guarantees the assignment hasn't become manual or locked since proposal generation
  SELECT count(*) INTO v_actual_count
  FROM public.departure_room_slot_assignments
  WHERE id = ANY(p_replaceable_assignment_ids)
    AND departure_id = p_departure_id
  FOR UPDATE;

  IF v_actual_count <> array_length(p_replaceable_assignment_ids, 1) THEN
    error_detail := 'STALE_REPLACEABLE_ASSIGNMENTS';
    RETURN QUERY SELECT 0, 0, error_detail;
    RETURN;
  END IF;

  -- verify NO locked or manual assignments among replaceable set
  SELECT count(*) INTO v_count
  FROM public.departure_room_slot_assignments
  WHERE id = ANY(p_replaceable_assignment_ids)
    AND departure_id = p_departure_id
    AND (is_manual = true OR locked = true);

  IF v_count > 0 THEN
    error_detail := 'ROOM_ASSIGNMENT_LOCKED';
    RETURN QUERY SELECT 0, 0, error_detail;
    RETURN;
  END IF;

  -- validate all passengers BEFORE any delete
  FOR v_proposed IN SELECT * FROM jsonb_array_elements(p_proposed)
  LOOP
    -- passenger exists on this departure
    IF NOT EXISTS (
      SELECT 1 FROM public.departure_passengers
      WHERE id = (v_proposed->>'passenger_id')::UUID
        AND departure_id = p_departure_id
        AND org_id = p_org_id
    ) THEN
      error_detail := 'PASSENGER_NOT_FOUND (' || (v_proposed->>'passenger_id') || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;

    -- passenger has a mapped accommodation requirement
    SELECT row_to_json(r) INTO v_req
    FROM public.reservation_accommodation_requirements r
    WHERE r.passenger_id = (v_proposed->>'passenger_id')::UUID;

    IF v_req IS NULL OR v_req->>'hotel_id' IS NULL OR v_req->>'hotel_allocation_id' IS NULL OR v_req->>'room_type' IS NULL THEN
      error_detail := 'PASSENGER_REQUIREMENT_UNASSIGNED (' || (v_proposed->>'passenger_id') || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;

    -- slot exists and matches requirement
    SELECT row_to_json(s) INTO v_slot
    FROM public.departure_room_slots s
    WHERE s.id = (v_proposed->>'room_slot_id')::UUID
      AND s.departure_id = p_departure_id;

    IF v_slot IS NULL THEN
      error_detail := 'SLOT_NOT_FOUND (' || (v_proposed->>'room_slot_id') || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;

    IF (v_slot->>'hotel_id')::TEXT <> (v_req->>'hotel_id')::TEXT
       OR (v_slot->>'hotel_allocation_id')::TEXT <> (v_req->>'hotel_allocation_id')::TEXT
       OR (v_slot->>'room_type')::TEXT <> (v_req->>'room_type')::TEXT THEN
      error_detail := 'REQUIREMENT_MISMATCH (pax ' || (v_proposed->>'passenger_id') || ', slot ' || (v_proposed->>'room_slot_id') || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;

    -- duplicate passenger check
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_proposed) AS other
      WHERE other->>'passenger_id' = (v_proposed->>'passenger_id')::TEXT
        AND other <> v_proposed
    ) THEN
      error_detail := 'DUPLICATE_PASSENGER (' || (v_proposed->>'passenger_id') || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;
  END LOOP;

  -- capacity validation
  FOR v_slot IN
    SELECT s.* FROM public.departure_room_slots s, jsonb_array_elements(p_proposed) AS prop
    WHERE s.id = (prop->>'room_slot_id')::UUID
    GROUP BY s.id
  LOOP
    SELECT count(*) INTO v_occ
    FROM public.departure_room_slot_assignments a
    WHERE a.room_slot_id = v_slot.id
      AND a.departure_id = p_departure_id
      AND a.id <> ALL(p_replaceable_assignment_ids);

    v_occ := v_occ + (
      SELECT count(*) FROM jsonb_array_elements(p_proposed) AS prop
      WHERE (prop->>'room_slot_id')::UUID = v_slot.id
    );

    IF v_occ > (v_slot.capacity).int THEN
      error_detail := 'NO_COMPATIBLE_ROOM_CAPACITY (slot ' || v_slot.id || ', capacity ' || (v_slot.capacity).int || ', occupied ' || v_occ || ')';
      RETURN QUERY SELECT 0, 0, error_detail;
      RETURN;
    END IF;
  END LOOP;

  -- delete replaceable assignments
  DELETE FROM public.departure_room_slot_assignments
  WHERE id = ANY(p_replaceable_assignment_ids)
    AND departure_id = p_departure_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- insert proposed assignments as is_manual=false, locked=false
  INSERT INTO public.departure_room_slot_assignments (
    id,
    departure_id,
    room_slot_id,
    passenger_id,
    reservation_id,
    passenger_name,
    is_manual,
    locked,
    assigned_by,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    p_departure_id,
    (prop->>'room_slot_id')::UUID,
    (prop->>'passenger_id')::UUID,
    dp.reservation_id,
    dp.full_name,
    false,
    false,
    p_assigned_by,
    now(),
    now()
  FROM jsonb_array_elements(p_proposed) AS prop
  JOIN public.departure_passengers dp ON dp.id = (prop->>'passenger_id')::UUID;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_inserted, NULL::TEXT;
END;
$$;

-- preserve grants
REVOKE ALL ON FUNCTION apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) TO service_role;
