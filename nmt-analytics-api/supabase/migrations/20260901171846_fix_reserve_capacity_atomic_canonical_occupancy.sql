CREATE OR REPLACE FUNCTION public.reserve_capacity_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_party_size INT
)
RETURNS TABLE (booked_after INT, capacity INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_limit INT;
  v_booked_floor INT;
  v_current_booked INT;
  v_effective_booked INT;
BEGIN
  IF p_party_size IS NULL OR p_party_size < 1 THEN
    RAISE EXCEPTION 'INVALID_PARTY_SIZE';
  END IF;

  SELECT d.booked, d.capacity
  INTO v_booked_floor, v_capacity_limit
  FROM public.departures d
  WHERE d.id = p_departure_id
    AND d.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN reservation_passenger_counts.passenger_count > 0 THEN reservation_passenger_counts.passenger_count
        ELSE reservation_rows.party_size
      END
    ), 0)
  INTO v_current_booked
  FROM (
    SELECT
      r.id,
      COALESCE(r.party_size, 0) AS party_size
    FROM public.reservations r
    WHERE r.org_id = p_org_id
      AND r.departure_id = p_departure_id
      AND r.status <> 'cancelled'
  ) AS reservation_rows
  LEFT JOIN (
    SELECT
      p.reservation_id,
      COUNT(*)::INT AS passenger_count
    FROM public.departure_passengers p
    WHERE p.org_id = p_org_id
      AND p.departure_id = p_departure_id
    GROUP BY p.reservation_id
  ) AS reservation_passenger_counts
    ON reservation_passenger_counts.reservation_id = reservation_rows.id;

  v_effective_booked := GREATEST(COALESCE(v_booked_floor, 0), COALESCE(v_current_booked, 0));

  IF v_effective_booked + p_party_size > v_capacity_limit THEN
    RAISE EXCEPTION 'CAPACITY_FULL';
  END IF;

  UPDATE public.departures d
  SET booked = v_effective_booked + p_party_size
  WHERE d.id = p_departure_id
    AND d.org_id = p_org_id
  RETURNING d.booked, d.capacity INTO booked_after, capacity;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_capacity_atomic(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_capacity_atomic(UUID, UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_capacity_atomic(UUID, UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_atomic(UUID, UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.release_capacity_atomic(
  p_departure_id UUID,
  p_org_id UUID,
  p_party_size INT
)
RETURNS TABLE (booked_after INT, capacity INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity_limit INT;
  v_booked_floor INT;
  v_current_booked INT;
  v_effective_booked INT;
BEGIN
  IF p_party_size IS NULL OR p_party_size < 1 THEN
    RAISE EXCEPTION 'INVALID_PARTY_SIZE';
  END IF;

  SELECT d.booked, d.capacity
  INTO v_booked_floor, v_capacity_limit
  FROM public.departures d
  WHERE d.id = p_departure_id
    AND d.org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN reservation_passenger_counts.passenger_count > 0 THEN reservation_passenger_counts.passenger_count
        ELSE reservation_rows.party_size
      END
    ), 0)
  INTO v_current_booked
  FROM (
    SELECT
      r.id,
      COALESCE(r.party_size, 0) AS party_size
    FROM public.reservations r
    WHERE r.org_id = p_org_id
      AND r.departure_id = p_departure_id
      AND r.status <> 'cancelled'
  ) AS reservation_rows
  LEFT JOIN (
    SELECT
      p.reservation_id,
      COUNT(*)::INT AS passenger_count
    FROM public.departure_passengers p
    WHERE p.org_id = p_org_id
      AND p.departure_id = p_departure_id
    GROUP BY p.reservation_id
  ) AS reservation_passenger_counts
    ON reservation_passenger_counts.reservation_id = reservation_rows.id;

  v_effective_booked := GREATEST(COALESCE(v_booked_floor, 0), COALESCE(v_current_booked, 0));

  UPDATE public.departures d
  SET booked = GREATEST(0, v_effective_booked - p_party_size)
  WHERE d.id = p_departure_id
    AND d.org_id = p_org_id
  RETURNING d.booked, d.capacity INTO booked_after, capacity;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) TO service_role;

COMMENT ON FUNCTION public.reserve_capacity_atomic(UUID, UUID, INT)
IS 'Locks the departure row, derives canonical occupancy from departure passengers plus passengerless active reservations, uses departures.booked as a compatibility floor for in-flight reservation capacity holds, then reserves additional capacity.';

COMMENT ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT)
IS 'Locks the departure row, derives canonical occupancy from departure passengers plus passengerless active reservations, uses departures.booked as a compatibility floor for in-flight reservation capacity holds, then releases previously reserved capacity.';
