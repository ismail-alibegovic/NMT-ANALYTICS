-- M08.3 corrective migration: lock the group row while reading its lock state.
-- This preserves the existing safe-delete contract and removes the stale-read race.

CREATE OR REPLACE FUNCTION public.delete_departure_passenger_safe(
  p_org_id UUID,
  p_passenger_id UUID
)
RETURNS TABLE (
  passenger_id UUID,
  reservation_id UUID,
  departure_id UUID,
  full_name TEXT,
  group_id UUID,
  group_deleted BOOLEAN,
  new_primary_passenger_id UUID,
  new_primary_passenger_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_departure_id UUID;
  v_full_name TEXT;
  v_group RECORD;
  v_affected_group_id UUID := NULL;
  v_remaining_count INTEGER;
  v_new_primary_id UUID := NULL;
  v_new_primary_name TEXT := NULL;
  v_group_deleted BOOLEAN := false;
BEGIN
  SELECT dp.reservation_id, dp.departure_id, dp.full_name
  INTO v_reservation_id, v_departure_id, v_full_name
  FROM public.departure_passengers dp
  WHERE dp.id = p_passenger_id
    AND dp.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PASSENGER_NOT_FOUND';
  END IF;

  -- Phase 1: lock every affected group and enforce the M08.1 lock before
  -- anything is mutated. Cascading membership removal must never bypass
  -- the lock.
  FOR v_group IN
    SELECT g.*
    FROM public.trip_passenger_group_members m
    JOIN public.trip_passenger_groups g ON g.id = m.group_id
    WHERE m.passenger_id = p_passenger_id
      AND g.org_id = p_org_id
    ORDER BY m.created_at ASC, m.id ASC
    FOR UPDATE OF g
  LOOP
    IF v_group.locked IS TRUE THEN
      RAISE EXCEPTION 'GROUP_LOCKED';
    END IF;
  END LOOP;

  -- Phase 2: prepare the canonical (first) affected group.
  SELECT g.*
  INTO v_group
  FROM public.trip_passenger_group_members m
  JOIN public.trip_passenger_groups g ON g.id = m.group_id
  WHERE m.passenger_id = p_passenger_id
    AND g.org_id = p_org_id
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1;

  IF FOUND THEN
    v_affected_group_id := v_group.id;

    SELECT COUNT(*)
    INTO v_remaining_count
    FROM public.trip_passenger_group_members m
    WHERE m.group_id = v_group.id
      AND m.passenger_id <> p_passenger_id;

    IF v_remaining_count = 0 THEN
      -- Last member: delete the group in the same atomic operation.
      DELETE FROM public.trip_passenger_groups
      WHERE id = v_group.id
        AND org_id = p_org_id;
      v_group_deleted := true;
    ELSIF v_group.primary_passenger_id = p_passenger_id THEN
      -- Deterministic replacement: earliest created membership, then id.
      SELECT m.passenger_id
      INTO v_new_primary_id
      FROM public.trip_passenger_group_members m
      WHERE m.group_id = v_group.id
        AND m.passenger_id <> p_passenger_id
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1;

      SELECT dp.full_name
      INTO v_new_primary_name
      FROM public.departure_passengers dp
      WHERE dp.id = v_new_primary_id
        AND dp.org_id = p_org_id;

      UPDATE public.trip_passenger_group_members m
      SET is_primary = (m.passenger_id = v_new_primary_id)
      WHERE m.group_id = v_group.id;

      UPDATE public.trip_passenger_groups g
      SET
        primary_passenger_id = v_new_primary_id,
        primary_passenger_name = v_new_primary_name,
        updated_at = now()
      WHERE g.id = v_group.id
        AND g.org_id = p_org_id;
    END IF;
  END IF;

  -- Phase 3: delete the passenger row. FK cascades remove memberships
  -- (trigger recomputes member_count), seat and accommodation assignments.
  DELETE FROM public.departure_passengers
  WHERE id = p_passenger_id
    AND org_id = p_org_id;

  RETURN QUERY
  SELECT
    p_passenger_id,
    v_reservation_id,
    v_departure_id,
    v_full_name,
    v_affected_group_id,
    v_group_deleted,
    v_new_primary_id,
    v_new_primary_name;
END;
$$;


COMMENT ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID)
IS 'Atomically deletes a departure passenger with race-safe passenger-group lock enforcement.';

REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) TO service_role;
