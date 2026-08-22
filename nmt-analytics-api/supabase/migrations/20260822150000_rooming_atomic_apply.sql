-- ============================================================
-- Migration 20260822150000_rooming_atomic_apply.sql
-- Phase 6C — Atomic rooming apply RPC (all-or-nothing)
-- v5 — each passenger validated, batch committed inside single txn
-- Any failure (stale pax, capacity exceeded, wrong org/dep) → zero rows written.
-- ============================================================

-- Drop old function if it exists from an earlier session
DROP FUNCTION IF EXISTS apply_accommodation_assignments_atomic(UUID,UUID,JSONB);

CREATE OR REPLACE FUNCTION apply_accommodation_assignments_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_assignments JSONB,
  OUT applied_count INT,
  OUT error_detail TEXT
)
RETURNS SETOF RECORD
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate_count INT;
  v_unique_pax INT;
  v_room_cap_needed RECORD;
  v_solo_check BOOLEAN;
  v_already_exists BOOLEAN;
  v_count INT;
  v_room_cap INT;
  v_existing_occ INT;
  v_new_occ INT;
BEGIN
  -- Lock buildings for this departure so concurrent proposals don't race
  PERFORM 1 FROM accommodation_buildings
  WHERE departure_id = p_departure_id AND org_id = p_org_id
  FOR UPDATE;

  SELECT count(*) INTO v_candidate_count
  FROM jsonb_array_elements(p_assignments);

  IF v_candidate_count = 0 THEN
    error_detail := 'Proposal is empty';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- Duplicate passenger within proposal?
  SELECT count(DISTINCT item->>'passengerId') INTO v_unique_pax
  FROM jsonb_array_elements(p_assignments) AS item;

  IF v_unique_pax < v_candidate_count THEN
    error_detail := format('Proposal contains %s duplicate passenger(s)',
      v_candidate_count - v_unique_pax);
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- Every passenger belongs to this departure + org
  SELECT bool_or(NOT ok) INTO v_solo_check
  FROM (
    SELECT EXISTS(
      SELECT 1 FROM departure_passengers
      WHERE id = (item->>'passengerId')::UUID
        AND org_id = p_org_id
        AND departure_id = p_departure_id
    ) AS ok
    FROM jsonb_array_elements(p_assignments) AS item
  ) sub;

  IF v_solo_check THEN
    error_detail := 'One or more passengers do not belong to this departure/org';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- No passenger is already assigned
  SELECT bool_or(already) INTO v_already_exists
  FROM (
    SELECT EXISTS(
      SELECT 1 FROM accommodation_assignments
      WHERE passenger_id = (item->>'passengerId')::UUID
        AND org_id = p_org_id
    ) AS already
    FROM jsonb_array_elements(p_assignments) AS item
  ) sub;

  IF v_already_exists THEN
    error_detail := 'One or more passengers already assigned';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- Every room belongs to this departure + org
  SELECT bool_or(NOT valid) INTO v_solo_check
  FROM (
    SELECT EXISTS(
      SELECT 1 FROM accommodation_rooms r
      JOIN accommodation_buildings b ON r.building_id = b.id
      WHERE r.id = (item->>'roomId')::UUID
        AND r.org_id = p_org_id
        AND b.departure_id = p_departure_id
    ) AS valid
    FROM jsonb_array_elements(p_assignments) AS item
  ) sub;

  IF v_solo_check THEN
    error_detail := 'One or more rooms do not belong to this departure/org';
    RAISE EXCEPTION '%', error_detail;
  END IF;

  -- Validate room capacity for the whole batch
  FOR v_room_cap_needed IN
    SELECT
      (item->>'roomId')::UUID AS room_id,
      count(*) AS proposed_additions
    FROM jsonb_array_elements(p_assignments) AS item
    GROUP BY (item->>'roomId')::UUID
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
      error_detail := format('Room capacity exceeded');
      RAISE EXCEPTION '%', error_detail;
    END IF;
  END LOOP;

  -- All validations passed — insert all assignments atomically
  INSERT INTO accommodation_assignments (
    org_id, room_id, passenger_id, passenger_name, assigned_by
  )
  SELECT
    p_org_id,
    (item->>'roomId')::UUID,
    (item->>'passengerId')::UUID,
    item->>'passengerName',
    NULL
  FROM jsonb_array_elements(p_assignments) AS item;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  applied_count := v_count;
  error_detail := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION apply_accommodation_assignments_atomic(UUID,UUID,JSONB)
  IS 'Atomic all-or-nothing accommodation batch apply. Any failure → zero rows written.';
