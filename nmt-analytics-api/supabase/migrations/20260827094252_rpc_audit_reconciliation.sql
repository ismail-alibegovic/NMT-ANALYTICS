-- Restored from live Supabase migration history for project hacutwknfgufrqlgdiia.
-- Do not replay manually in production; this version is already recorded as applied.

CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
  p_org_id uuid,
  p_departure_id uuid,
  p_customer_data jsonb,
  p_party_size integer,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booked INT;
  v_capacity INT;
  v_reservation_id UUID;
  v_result JSONB;
BEGIN
  IF p_departure_id IS NOT NULL THEN
    SELECT booked, capacity INTO v_booked, v_capacity
    FROM departures
    WHERE id = p_departure_id AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
    END IF;

    IF p_status = 'confirmed' THEN
      IF v_booked + p_party_size > v_capacity THEN
        RAISE EXCEPTION 'CAPACITY_FULL';
      END IF;

      UPDATE departures
      SET booked = booked + p_party_size
      WHERE id = p_departure_id;
    END IF;
  END IF;

  INSERT INTO reservations (
    org_id,
    departure_id,
    customer_id,
    customer_name,
    customer_phone,
    party_size,
    reservation_at,
    status,
    total_amount,
    currency,
    source,
    assigned_to
  ) VALUES (
    p_org_id,
    p_departure_id,
    (p_customer_data->>'customerId')::UUID,
    p_customer_data->>'customerName',
    p_customer_data->>'customerPhone',
    p_party_size,
    COALESCE((p_customer_data->>'reservationAt')::TIMESTAMPTZ, NOW()),
    p_status,
    (COALESCE(p_customer_data->>'totalAmount', '0'))::NUMERIC,
    COALESCE(p_customer_data->>'currency', 'BAM'),
    p_customer_data->>'source',
    (p_customer_data->>'assignedTo')::UUID
  )
  RETURNING id INTO v_reservation_id;

  SELECT row_to_json(r)::jsonb INTO v_result
  FROM reservations r
  WHERE r.id = v_reservation_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_upcoming_departures()
RETURNS TABLE(notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  rec RECORD;
  nid UUID;
BEGIN
  FOR rec IN
    SELECT d.id AS departure_id, d.depart_at, p.name AS package_name, d.org_id
    FROM departures d
    JOIN packages p ON p.id = d.package_id
    WHERE d.depart_at::date = (CURRENT_DATE + 1)
      AND d.status = 'active'
      AND d.booked > 0
  LOOP
    INSERT INTO notifications (org_id, user_id, type, title, body, data)
    VALUES (
      rec.org_id,
      NULL,
      'departure_reminder',
      'Podsjetnik: Polazak sutra',
      rec.package_name || ' polazi sutra u ' || to_char(rec.depart_at, 'HH24:MI'),
      jsonb_build_object(
        'departure_id', rec.departure_id,
        'package_name', rec.package_name,
        'departure_date', rec.depart_at::text
      )
    )
    RETURNING id INTO nid;

    notification_id := nid;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_accommodation_assignments_atomic(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_accommodation_assignments_atomic(uuid, uuid, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.batch_update_seats_atomic(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_seats_atomic(uuid, uuid, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_reservation_atomic(uuid, uuid, jsonb, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation_atomic(uuid, uuid, jsonb, integer, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_upcoming_departures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_upcoming_departures() TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_capacity_atomic(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_atomic(uuid, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_public_form(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_form(text, jsonb) TO service_role;
