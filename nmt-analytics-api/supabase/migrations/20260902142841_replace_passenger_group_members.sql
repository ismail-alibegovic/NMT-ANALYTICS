CREATE OR REPLACE FUNCTION public.replace_passenger_group_members(
  p_org_id UUID,
  p_group_id UUID,
  p_member_ids UUID[],
  p_primary_passenger_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  color TEXT,
  org_id UUID,
  departure_id UUID,
  primary_passenger_id UUID,
  primary_passenger_name TEXT,
  notes TEXT,
  seating_preference TEXT,
  accommodation_preference TEXT,
  locked BOOLEAN,
  member_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_row RECORD;
  passenger_count INTEGER;
  duplicate_count INTEGER;
  conflicting_count INTEGER;
  primary_name TEXT;
BEGIN
  SELECT g.*
  INTO group_row
  FROM public.trip_passenger_groups g
  WHERE g.id = p_group_id
    AND g.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF group_row.locked IS TRUE THEN
    RAISE EXCEPTION 'GROUP_LOCKED';
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL OR array_length(p_member_ids, 1) = 0 THEN
    RAISE EXCEPTION 'GROUP_MEMBERS_REQUIRED';
  END IF;

  SELECT COUNT(*) - COUNT(DISTINCT member_id)
  INTO duplicate_count
  FROM unnest(p_member_ids) AS member_id;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER_IDS';
  END IF;

  IF p_primary_passenger_id IS NULL OR NOT (p_primary_passenger_id = ANY(p_member_ids)) THEN
    RAISE EXCEPTION 'PRIMARY_NOT_MEMBER';
  END IF;

  SELECT COUNT(*)
  INTO passenger_count
  FROM public.departure_passengers dp
  WHERE dp.id = ANY(p_member_ids)
    AND dp.org_id = p_org_id
    AND dp.departure_id = group_row.departure_id;

  IF passenger_count <> array_length(p_member_ids, 1) THEN
    RAISE EXCEPTION 'INVALID_GROUP_PASSENGERS';
  END IF;

  SELECT COUNT(*)
  INTO conflicting_count
  FROM public.trip_passenger_group_members m
  JOIN public.trip_passenger_groups g ON g.id = m.group_id
  WHERE g.org_id = p_org_id
    AND g.departure_id = group_row.departure_id
    AND m.group_id <> p_group_id
    AND m.passenger_id = ANY(p_member_ids);

  IF conflicting_count > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_GROUP_MEMBERSHIP';
  END IF;

  SELECT dp.full_name
  INTO primary_name
  FROM public.departure_passengers dp
  WHERE dp.id = p_primary_passenger_id
    AND dp.org_id = p_org_id
    AND dp.departure_id = group_row.departure_id;

  DELETE FROM public.trip_passenger_group_members
  WHERE group_id = p_group_id;

  INSERT INTO public.trip_passenger_group_members (
    group_id,
    passenger_id,
    reservation_id,
    is_primary
  )
  SELECT
    p_group_id,
    dp.id,
    dp.reservation_id,
    dp.id = p_primary_passenger_id
  FROM public.departure_passengers dp
  WHERE dp.id = ANY(p_member_ids)
    AND dp.org_id = p_org_id
    AND dp.departure_id = group_row.departure_id;

  UPDATE public.trip_passenger_groups g
  SET
    primary_passenger_id = p_primary_passenger_id,
    primary_passenger_name = primary_name,
    updated_at = now()
  WHERE g.id = p_group_id
    AND g.org_id = p_org_id;

  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.color,
    g.org_id,
    g.departure_id,
    g.primary_passenger_id,
    g.primary_passenger_name,
    g.notes,
    g.seating_preference,
    g.accommodation_preference,
    g.locked,
    g.member_count,
    g.created_at,
    g.updated_at
  FROM public.trip_passenger_groups g
  WHERE g.id = p_group_id
    AND g.org_id = p_org_id;
END;
$$;

COMMENT ON FUNCTION public.replace_passenger_group_members(UUID, UUID, UUID[], UUID)
IS 'Atomically replaces a passenger group membership set and synchronizes the canonical primary passenger.';

REVOKE ALL ON FUNCTION public.replace_passenger_group_members(UUID, UUID, UUID[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_passenger_group_members(UUID, UUID, UUID[], UUID) FROM anon;
REVOKE ALL ON FUNCTION public.replace_passenger_group_members(UUID, UUID, UUID[], UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_passenger_group_members(UUID, UUID, UUID[], UUID) TO service_role;
