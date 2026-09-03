-- corrective (append-only): rebuild apply_rooming_proposal_atomic on the
-- WORKING 20260903080000 logic, adding only replaceable-assignment race
-- protection. Fixes requirement lookup (no passenger_id on
-- reservation_accommodation_requirements), missing org_id on insert,
-- invalid aggregate FOR UPDATE, and JSONB-as-loop-variable capacity logic.

CREATE OR REPLACE FUNCTION public.apply_rooming_proposal_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_replaceable_assignment_ids UUID[],
  p_proposed JSONB,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS TABLE (deleted_count INTEGER, inserted_count INTEGER, error_detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep_check RECORD;
  replaceable_expected INTEGER;
  replaceable_actual INTEGER;
  replaceable_row RECORD;
  proposed_item JSONB;
  slot_row RECORD;
  pax_row RECORD;
  req_row RECORD;
  slot_occupancy INTEGER;
  existing_pax_assignment_count INTEGER;
  v_deleted INTEGER := 0;
  v_inserted INTEGER := 0;
  v_reservation_id UUID;
  v_hotel_id UUID;
  v_hotel_allocation_id UUID;
  v_room_type TEXT;
BEGIN
  -- Validate departure belongs to org
  SELECT d.id INTO dep_check
  FROM public.departures d
  WHERE d.id = p_departure_id AND d.org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  -- Replaceable-assignment race protection.
  -- Lock the expected rows directly via a FOR-loop with FOR UPDATE,
  -- then verify count and state (never use aggregate+FOR UPDATE).
  -- A concurrent lock (locked=true) or manual flip after proposal
  -- generation must abort the whole apply with zero writes.
  IF p_replaceable_assignment_ids IS NOT NULL AND array_length(p_replaceable_assignment_ids, 1) > 0 THEN
    replaceable_expected := array_length(p_replaceable_assignment_ids, 1);
    replaceable_actual := 0;

    FOR replaceable_row IN
      SELECT a.id, a.is_manual, a.locked
      FROM public.departure_room_slot_assignments a
      WHERE a.id = ANY(p_replaceable_assignment_ids)
        AND a.org_id = p_org_id
        AND a.departure_id = p_departure_id
      FOR UPDATE OF a
    LOOP
      replaceable_actual := replaceable_actual + 1;
      IF replaceable_row.is_manual = true OR replaceable_row.locked = true THEN
        RAISE EXCEPTION 'STALE_REPLACEABLE_ASSIGNMENTS';
      END IF;
    END LOOP;

    IF replaceable_actual <> replaceable_expected THEN
      RAISE EXCEPTION 'STALE_REPLACEABLE_ASSIGNMENTS';
    END IF;

    WITH deleted AS (
      DELETE FROM public.departure_room_slot_assignments a
      WHERE a.id = ANY(p_replaceable_assignment_ids)
        AND a.org_id = p_org_id
        AND a.departure_id = p_departure_id
        AND a.is_manual = false
        AND a.locked = false
      RETURNING a.id
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    IF v_deleted <> replaceable_expected THEN
      RAISE EXCEPTION 'STALE_REPLACEABLE_ASSIGNMENTS';
    END IF;
  END IF;

  -- Process each proposed assignment
  FOR proposed_item IN SELECT * FROM jsonb_array_elements(p_proposed) LOOP
    -- Resolve passenger (org + departure scoped)
    SELECT p.id, p.full_name, p.reservation_id, p.reservation_accommodation_requirement_id
    INTO pax_row
    FROM public.departure_passengers p
    WHERE p.id = (proposed_item->>'passenger_id')::UUID
      AND p.org_id = p_org_id
      AND p.departure_id = p_departure_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PASSENGER_NOT_FOUND (%)', proposed_item->>'passenger_id';
    END IF;

    v_reservation_id := pax_row.reservation_id;

    -- Resolve canonical accommodation requirement through
    -- departure_passengers.reservation_accommodation_requirement_id
    -- (reservation_accommodation_requirements has NO passenger_id).
    IF pax_row.reservation_accommodation_requirement_id IS NOT NULL THEN
      SELECT r.hotel_id, r.hotel_allocation_id, r.room_type
      INTO req_row
      FROM public.reservation_accommodation_requirements r
      WHERE r.id = pax_row.reservation_accommodation_requirement_id
        AND r.org_id = p_org_id;
    END IF;

    IF req_row.hotel_id IS NULL
       OR req_row.hotel_allocation_id IS NULL
       OR req_row.room_type IS NULL THEN
      RAISE EXCEPTION 'PASSENGER_REQUIREMENT_UNASSIGNED (%)', proposed_item->>'passenger_id';
    END IF;

    v_hotel_id := req_row.hotel_id;
    v_hotel_allocation_id := req_row.hotel_allocation_id;
    v_room_type := req_row.room_type;

    -- Resolve slot and validate compatibility
    SELECT s.* INTO slot_row
    FROM public.departure_room_slots s
    WHERE s.id = (proposed_item->>'room_slot_id')::UUID
      AND s.org_id = p_org_id
      AND s.departure_id = p_departure_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SLOT_NOT_FOUND (%)', proposed_item->>'room_slot_id';
    END IF;

    IF slot_row.hotel_id != v_hotel_id
       OR slot_row.hotel_allocation_id != v_hotel_allocation_id
       OR slot_row.room_type != v_room_type THEN
      RAISE EXCEPTION 'REQUIREMENT_MISMATCH (pax %, slot %)', proposed_item->>'passenger_id', proposed_item->>'room_slot_id';
    END IF;

    -- Check passenger is not already assigned
    SELECT COUNT(*) INTO existing_pax_assignment_count
    FROM public.departure_room_slot_assignments a
    WHERE a.passenger_id = (proposed_item->>'passenger_id')::UUID
      AND a.org_id = p_org_id
      AND a.departure_id = p_departure_id;
    IF existing_pax_assignment_count > 0 THEN
      RAISE EXCEPTION 'DUPLICATE_PASSENGER (%)', proposed_item->>'passenger_id';
    END IF;

    -- Check slot capacity
    SELECT COUNT(*) INTO slot_occupancy
    FROM public.departure_room_slot_assignments a
    WHERE a.room_slot_id = (proposed_item->>'room_slot_id')::UUID
      AND a.org_id = p_org_id
      AND a.departure_id = p_departure_id;
    IF slot_occupancy >= slot_row.capacity THEN
      RAISE EXCEPTION 'NO_COMPATIBLE_ROOM_CAPACITY (slot %, capacity %, occupied %)',
        proposed_item->>'room_slot_id', slot_row.capacity, slot_occupancy;
    END IF;

    INSERT INTO public.departure_room_slot_assignments (
      org_id, departure_id, room_slot_id, passenger_id, reservation_id,
      passenger_name, assigned_by, is_manual, locked
    )
    VALUES (
      p_org_id, p_departure_id, (proposed_item->>'room_slot_id')::UUID,
      (proposed_item->>'passenger_id')::UUID, v_reservation_id,
      pax_row.full_name, p_assigned_by, false, false
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN QUERY SELECT v_deleted, v_inserted, NULL::TEXT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT 0, 0, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rooming_proposal_atomic(UUID, UUID, UUID[], JSONB, UUID) TO service_role;
