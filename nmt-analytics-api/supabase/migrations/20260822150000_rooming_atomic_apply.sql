-- ===============================================================
-- Phase 6C: Atomic Rooming Apply RPC — true all-or-nothing v2
-- ===============================================================
-- Phase 1: Validate EVERY proposed assignment against canonical state.
-- Phase 2: Insert ALL assignments in one statement.
-- If ANY validation fails, the entire transaction rolls back.

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
  rec              JSONB;
  v_candidate_count INT;
  v_unique_pax      INT;
  v_unique_rooms    INT;
  v_room_cap_needed RECORD;
  v_solo_check      BOOLEAN;
  v_already_exists  BOOLEAN;
  v_count           INT;
  v_room_cap        INT;
  v_existing_occ    INT;
  v_new_occ         INT;
BEGIN
  -- Lock the accommodation tables for this departure to prevent
  -- concurrent assignments during validation.
  PERFORM 1 FROM accommodation_buildings
    WHERE departure_id = p_departure_id AND org_id = p_org_id
    FOR UPDATE;

  -- ================================================================
  -- PHASE 1: VALIDATE ALL ASSIGNMENTS BEFORE ANY WRITE
  -- ================================================================

  -- 1a: Count input
  SELECT count(*) INTO v_candidate_count
    FROM jsonb_array_elements(p_assignments);

  IF v_candidate_count = 0 THEN
    error_detail := 'Proposal is empty';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- 1b: No duplicate passengers within the proposal
  SELECT count(DISTINCT rec->>'passengerId') INTO v_unique_pax
    FROM jsonb_array_elements(p_assignments) AS rec;

  IF v_unique_pax < v_candidate_count THEN
    error_detail := format('Proposal contains %s duplicate passenger(s)', v_candidate_count - v_unique_pax);
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- 1c: Every passenger exists, belongs to this org + departure, and is unassigned
  SELECT bool_or(NOT ok) INTO v_solo_check
  FROM (
    SELECT
      rec->>'passengerId' AS pid,
      rec->>'passengerName' AS pname,
      EXISTS(
        SELECT 1 FROM departure_passengers
        WHERE id = (rec->>'passengerId')::UUID
          AND org_id = p_org_id
          AND departure_id = p_departure_id
      ) AS ok
    FROM jsonb_array_elements(p_assignments) AS rec
  ) sub;

  IF v_solo_check THEN
    error_detail := 'One or more passengers do not belong to this departure/org';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- 1d: No passenger already has an accommodation assignment
  SELECT bool_or(already) INTO v_already_exists
  FROM (
    SELECT EXISTS(
      SELECT 1 FROM accommodation_assignments
      WHERE passenger_id = (rec->>'passengerId')::UUID
        AND org_id = p_org_id
    ) AS already
    FROM jsonb_array_elements(p_assignments) AS rec
  ) sub;

  IF v_already_exists THEN
    error_detail := 'One or more passengers already have an accommodation assignment';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- 1e: Every room exists and belongs to this departure/org
  SELECT bool_or(NOT valid) INTO v_solo_check
  FROM (
    SELECT
      rec->>'roomId' AS rid,
      EXISTS(
        SELECT 1 FROM accommodation_rooms r
        JOIN accommodation_buildings b ON r.building_id = b.id
        WHERE r.id = (rec->>'roomId')::UUID
          AND r.org_id = p_org_id
          AND b.departure_id = p_departure_id
      ) AS valid
    FROM jsonb_array_elements(p_assignments) AS rec
  ) sub;

  IF v_solo_check THEN
    error_detail := 'One or more rooms do not belong to this departure/org';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- 1f: Room capacity — must accommodate the entire batch
  FOR v_room_cap_needed IN
    SELECT
      (rec->>'roomId')::UUID AS room_id,
      count(*)              AS proposed_additions
    FROM jsonb_array_elements(p_assignments) AS rec
    GROUP BY (rec->>'roomId')::UUID
  LOOP
    SELECT r.capacity INTO v_room_cap
      FROM accommodation_rooms r
      WHERE r.id = v_room_cap_needed.room_id;

    SELECT count(*) INTO v_existing_occ
      FROM accommodation_assignments
      WHERE room_id = v_room_cap_needed.room_id
        AND org_id = p_org_id;

    v_new_occ := v_existing_occ + v_room_cap_needed.proposed_additions;

    IF v_new_occ > v_room_cap THEN
      error_detail := format(
        'Room %s: would go from %s/%s to %s/%s (proposal adds %s)',
        v_room_cap_needed.room_id, v_existing_occ, v_room_cap,
        v_new_occ, v_room_cap, v_room_cap_needed.proposed_additions
      );
      RAISE EXCEPTION '%', error_detail;
    END IF;
  END LOOP;

  -- ================================================================
  -- PHASE 2: ALL VALIDATIONS PASSED — INSERT ALL ASSIGNMENTS
  -- ================================================================

  INSERT INTO accommodation_assignments (
    org_id, room_id, passenger_id, passenger_name, assigned_by
  )
  SELECT
    p_org_id,
    (rec->>'roomId')::UUID,
    (rec->>'passengerId')::UUID,
    rec->>'passengerName',
    NULL
  FROM jsonb_array_elements(p_assignments) AS rec;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  applied_count := v_count;
  error_detail := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION apply_accommodation_assignments_atomic IS
  'Atomically validates a batch of accommodation assignments then inserts them all. True all-or-nothing: two-phase validate-then-write inside one PostgreSQL transaction. If any validation fails (stale passenger, missing room, capacity overflow, within-proposal duplicate), zero rows are written.';
