-- M08.3 — Safe passenger removal + passenger group member_count integrity
--
-- 1) Restores canonical member_count maintenance on trip_passenger_group_members.
--    The count is RECOMPUTED from actual membership rows on every INSERT/DELETE
--    so drift can heal. Idempotent pattern (DROP TRIGGER IF EXISTS /
--    CREATE OR REPLACE FUNCTION / CREATE TRIGGER) works both on the live
--    production schema and on clean migration replay.
-- 2) Adds an atomic server-only safe passenger delete that enforces M08.1
--    group locks, reassigns the primary passenger deterministically when the
--    primary is removed, deletes an unlocked group whose last member is
--    removed, and keeps member_count in sync.

-- ============================================================
-- 1. member_count integrity
-- ============================================================

DROP TRIGGER IF EXISTS trg_group_member_count ON public.trip_passenger_group_members;

DROP FUNCTION IF EXISTS public.update_group_member_count();

CREATE OR REPLACE FUNCTION public.recompute_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_passenger_groups g
  SET
    member_count = (
      SELECT COUNT(*)
      FROM public.trip_passenger_group_members m
      WHERE m.group_id = g.id
    ),
    updated_at = now()
  WHERE g.id = COALESCE(NEW.group_id, OLD.group_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_group_member_count
  AFTER INSERT OR DELETE ON public.trip_passenger_group_members
  FOR EACH ROW EXECUTE FUNCTION public.recompute_group_member_count();

COMMENT ON FUNCTION public.recompute_group_member_count()
IS 'Keeps trip_passenger_groups.member_count equal to the real membership row count (recompute semantics; heals drift).';

-- Backfill existing groups so member_count matches actual membership.
UPDATE public.trip_passenger_groups g
SET member_count = sub.actual_count
FROM (
  SELECT group_id, COUNT(*) AS actual_count
  FROM public.trip_passenger_group_members
  GROUP BY group_id
) sub
WHERE g.id = sub.group_id
  AND g.member_count <> sub.actual_count;

-- Groups with no membership rows must read 0.
UPDATE public.trip_passenger_groups g
SET member_count = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.trip_passenger_group_members m
  WHERE m.group_id = g.id
)
AND g.member_count <> 0;

-- ============================================================
-- 2. Atomic safe passenger delete
-- ============================================================

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
  LOOP
    PERFORM 1
    FROM public.trip_passenger_groups g2
    WHERE g2.id = v_group.id
    FOR UPDATE;

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
IS 'Atomically deletes a departure passenger: enforces passenger-group locks, reassigns the primary passenger deterministically, removes an unlocked group left empty, and preserves member_count integrity.';

REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_departure_passenger_safe(UUID, UUID) TO service_role;
