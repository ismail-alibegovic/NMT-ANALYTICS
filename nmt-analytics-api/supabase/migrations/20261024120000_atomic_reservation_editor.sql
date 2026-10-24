-- Combined editor saves must commit core, capacity and accommodation together.
-- Existing standalone PATCH clients remain compatible. API service role only.
CREATE FUNCTION public.edit_reservation_atomic(
  p_org_id uuid, p_reservation_id uuid, p_updates jsonb, p_requirements jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  previous public.reservations%ROWTYPE;
  updated public.reservations%ROWTYPE;
  old_currency text;
  target_currency text;
  delta integer;
  old_consumes boolean;
  new_consumes boolean;
BEGIN
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT FROM jsonb_object_keys(p_updates) k WHERE k NOT IN (
      'status','departure_id','customer_id','total_amount','reservation_at',
      'party_size','customer_name','customer_phone','currency','source'
    )
  ) THEN RAISE EXCEPTION 'INVALID_RESERVATION_UPDATE'; END IF;

  SELECT * INTO previous FROM public.reservations
    WHERE id=p_reservation_id AND org_id=p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  SELECT * INTO updated FROM jsonb_populate_record(previous,p_updates);
  IF updated.party_size IS NULL OR updated.party_size < 1 OR updated.customer_name IS NULL
     OR length(updated.customer_name)=0 OR updated.total_amount IS NULL OR updated.total_amount < 0
     OR updated.status IS NULL OR updated.status NOT IN ('pending','confirmed','completed','cancelled')
     OR updated.currency IS NULL OR length(updated.currency)=0
  THEN RAISE EXCEPTION 'INVALID_RESERVATION_UPDATE'; END IF;

  IF previous.quotation_id IS NOT NULL AND
     (updated.total_amount IS DISTINCT FROM previous.total_amount OR updated.currency IS DISTINCT FROM previous.currency)
  THEN RAISE EXCEPTION 'QUOTATION_BOOKING_LOCKED'; END IF;

  IF updated.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.customers WHERE id=updated.customer_id AND org_id=p_org_id
  ) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  -- Stable ordering serializes edits across both departures. Existing capacity
  -- helpers retain canonical passenger occupancy and outstanding hold floors.
  PERFORM 1 FROM public.departures d WHERE d.org_id=p_org_id
    AND d.id IN (previous.departure_id,updated.departure_id) ORDER BY d.id FOR UPDATE;
  IF previous.departure_id IS NOT NULL THEN
    SELECT p.currency INTO old_currency FROM public.departures d
      JOIN public.packages p ON p.id=d.package_id AND p.org_id=p_org_id
      WHERE d.id=previous.departure_id AND d.org_id=p_org_id FOR SHARE OF p;
    IF NOT FOUND OR old_currency IS NULL THEN RAISE EXCEPTION 'DEPARTURE_PACKAGE_NOT_FOUND'; END IF;
  END IF;
  IF updated.departure_id IS NOT NULL THEN
    SELECT p.currency INTO target_currency FROM public.departures d
      JOIN public.packages p ON p.id=d.package_id AND p.org_id=p_org_id
      WHERE d.id=updated.departure_id AND d.org_id=p_org_id FOR SHARE OF p;
    IF NOT FOUND OR target_currency IS NULL THEN RAISE EXCEPTION 'DEPARTURE_NOT_FOUND'; END IF;
    IF updated.currency IS DISTINCT FROM target_currency OR
       (old_currency IS NOT NULL AND old_currency IS DISTINCT FROM target_currency)
    THEN RAISE EXCEPTION 'RESERVATION_DEPARTURE_CURRENCY_MISMATCH'; END IF;
  END IF;
  IF updated.currency IS DISTINCT FROM previous.currency THEN
    IF previous.departure_id IS NOT NULL OR updated.departure_id IS NOT NULL
    THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
    IF EXISTS (SELECT FROM public.payments WHERE org_id=p_org_id AND reservation_id=p_reservation_id)
       OR EXISTS (SELECT FROM public.payment_links WHERE org_id=p_org_id AND reservation_id=p_reservation_id)
       OR EXISTS (SELECT FROM public.contracts WHERE org_id=p_org_id AND reservation_id=p_reservation_id)
       OR EXISTS (SELECT FROM public.receipts WHERE org_id=p_org_id AND reservation_id=p_reservation_id)
    THEN RAISE EXCEPTION 'RESERVATION_CURRENCY_LOCKED'; END IF;
  END IF;

  old_consumes := previous.status <> 'cancelled';
  new_consumes := updated.status <> 'cancelled';
  IF previous.departure_id IS NOT DISTINCT FROM updated.departure_id THEN
    IF updated.departure_id IS NOT NULL THEN
      delta := (CASE WHEN new_consumes THEN updated.party_size ELSE 0 END)
             - (CASE WHEN old_consumes THEN previous.party_size ELSE 0 END);
      IF delta > 0 THEN PERFORM public.reserve_capacity_atomic(updated.departure_id,p_org_id,delta);
      ELSIF delta < 0 THEN PERFORM public.release_capacity_atomic(updated.departure_id,p_org_id,-delta); END IF;
    END IF;
  ELSE
    IF previous.departure_id IS NOT NULL AND old_consumes THEN
      PERFORM public.release_capacity_atomic(previous.departure_id,p_org_id,previous.party_size);
    END IF;
    IF updated.departure_id IS NOT NULL AND new_consumes THEN
      PERFORM public.reserve_capacity_atomic(updated.departure_id,p_org_id,updated.party_size);
    END IF;
  END IF;

  UPDATE public.reservations SET
    status=updated.status,departure_id=updated.departure_id,customer_id=updated.customer_id,
    total_amount=updated.total_amount,reservation_at=updated.reservation_at,party_size=updated.party_size,
    customer_name=updated.customer_name,customer_phone=updated.customer_phone,currency=updated.currency,source=updated.source
    WHERE id=p_reservation_id AND org_id=p_org_id RETURNING * INTO updated;

  -- Cancel retains accommodation history instead of trying to reassign a
  -- cancelled reservation. Null is deliberately limited to this intent.
  IF p_requirements IS NULL OR p_requirements='null'::jsonb THEN
    IF updated.status <> 'cancelled' THEN RAISE EXCEPTION 'INVALID_ACCOMMODATION_INTENT'; END IF;
  ELSIF jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_REQUIREMENTS_PAYLOAD';
  ELSIF p_requirements <> '[]'::jsonb OR EXISTS (
    SELECT FROM public.reservation_accommodation_requirements WHERE org_id=p_org_id AND reservation_id=p_reservation_id
  ) THEN
    -- Same transaction: any allocation/mapping/rooming error rolls back the
    -- UPDATE and both capacity changes above. No post-commit read is required.
    PERFORM public.replace_reservation_accommodation_requirements_atomic(p_org_id,p_reservation_id,p_requirements);
  END IF;
  RETURN to_jsonb(updated);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_reservation_atomic(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_reservation_atomic(uuid,uuid,jsonb,jsonb) TO service_role;
