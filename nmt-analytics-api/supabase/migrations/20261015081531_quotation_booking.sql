-- One immutable approved quotation can create one existing-model reservation.
ALTER TABLE public.reservations ADD COLUMN quotation_id uuid;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_quotation_org_fk
  FOREIGN KEY(quotation_id,org_id) REFERENCES public.quotations(id,org_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX reservations_org_quotation_unique
  ON public.reservations(org_id,quotation_id) WHERE quotation_id IS NOT NULL;

CREATE FUNCTION public.guard_quotation_reservation_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.quotation_id IS NOT NULL AND current_user IN ('anon','authenticated') THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='QUOTATION_BOOKING_API_REQUIRED';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.quotation_id IS NOT NULL THEN
    IF TG_OP='DELETE' OR current_user IN ('anon','authenticated') THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_BOOKING_LOCKED';
    END IF;
    IF NEW.quotation_id IS DISTINCT FROM OLD.quotation_id OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.creation_fingerprint IS DISTINCT FROM OLD.creation_fingerprint
       OR NEW.options->'quotation_snapshot' IS DISTINCT FROM OLD.options->'quotation_snapshot' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_BOOKING_LOCKED';
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.quotation_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_BOOKING_LOCKED';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_quotation_reservation_terms() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_quotation_reservation_terms() TO service_role;
CREATE TRIGGER reservations_quotation_terms_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_reservation_terms();

CREATE FUNCTION public.quotation_booking_departures(p_org_id uuid,p_quotation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE q public.quotations; tz text; result jsonb;
BEGIN
  SELECT * INTO q FROM public.quotations WHERE id=p_quotation_id AND org_id=p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTATION_NOT_FOUND'; END IF;
  IF q.status<>'accepted' THEN RAISE EXCEPTION 'QUOTATION_NOT_ACCEPTED'; END IF;
  IF q.booking_context->>'source' IS DISTINCT FROM 'itinerary'
     OR q.booking_context->>'travelStart' IS NULL OR q.booking_context->>'travelEnd' IS NULL
     OR coalesce((q.booking_context->>'travelers')::integer,0) < 1 THEN RAISE EXCEPTION 'QUOTATION_CONTEXT_REQUIRED'; END IF;
  SELECT coalesce(nullif(timezone,''),'UTC') INTO tz FROM public.organizations WHERE id=p_org_id;
  IF NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=tz) THEN RAISE EXCEPTION 'QUOTATION_TIMEZONE_INVALID'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'packageName',p.name,
    'departAt',d.depart_at,'returnAt',d.return_at,'capacity',d.capacity) ORDER BY d.depart_at,d.id),'[]'::jsonb)
  INTO result FROM public.departures d JOIN public.packages p ON p.id=d.package_id AND p.org_id=d.org_id
  WHERE d.org_id=p_org_id AND p.org_id=p_org_id AND p.itinerary_id=q.itinerary_id AND p.currency=q.currency
    AND d.status='active' AND p.active=true
    AND (d.depart_at AT TIME ZONE tz)::date=(q.booking_context->>'travelStart')::date
    AND (d.return_at AT TIME ZONE tz)::date=(q.booking_context->>'travelEnd')::date;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.quotation_booking_departures(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quotation_booking_departures(uuid,uuid) TO service_role;

CREATE FUNCTION public.book_quotation_atomic(p_org_id uuid,p_actor_id uuid,p_quotation_id uuid,p_payload jsonb,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  q public.quotations; r public.reservations;
  target_departure uuid := (p_payload->>'departureId')::uuid;
  customer uuid; party integer; options jsonb; lines jsonb; choices jsonb;
BEGIN
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND org_id=p_org_id)
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'QUOTATION_ACTOR_INVALID'; END IF;
  SELECT * INTO q FROM public.quotations WHERE id=p_quotation_id AND org_id=p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTATION_NOT_FOUND'; END IF;
  SELECT * INTO r FROM public.reservations WHERE quotation_id=q.id AND org_id=p_org_id;
  IF FOUND THEN
    IF r.creation_fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'QUOTATION_ALREADY_BOOKED'; END IF;
    RETURN jsonb_build_object('created',false,'reservation',to_jsonb(r));
  END IF;

  choices := public.quotation_booking_departures(p_org_id,q.id);
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(choices) c WHERE c->>'id'=target_departure::text) THEN
    RAISE EXCEPTION 'QUOTATION_DEPARTURE_INCOMPATIBLE';
  END IF;
  -- Keep the selected departure/package context stable through capacity reservation.
  PERFORM 1 FROM public.departures d JOIN public.packages p ON p.id=d.package_id AND p.org_id=d.org_id
  WHERE d.id=target_departure AND d.org_id=p_org_id AND p.org_id=p_org_id FOR UPDATE OF d FOR SHARE OF p;
  choices := public.quotation_booking_departures(p_org_id,q.id);
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(choices) c WHERE c->>'id'=target_departure::text) THEN
    RAISE EXCEPTION 'QUOTATION_DEPARTURE_INCOMPATIBLE';
  END IF;
  party := (q.booking_context->>'travelers')::integer;
  IF jsonb_typeof(p_payload->'passengers') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'passengers')<>party
     OR EXISTS(SELECT FROM jsonb_array_elements(p_payload->'passengers') p WHERE nullif(trim(p->>'full_name'),'') IS NULL)
     OR nullif(trim(p_payload->>'customerName'),'') IS NULL OR nullif(trim(p_payload->>'customerPhone'),'') IS NULL THEN
    RAISE EXCEPTION 'QUOTATION_TRAVELERS_INVALID';
  END IF;
  IF NOT EXISTS(SELECT FROM public.quotation_items WHERE quotation_id=q.id AND org_id=p_org_id) THEN
    RAISE EXCEPTION 'QUOTATION_CONTEXT_REQUIRED';
  END IF;
  PERFORM public.reserve_capacity_atomic(target_departure,p_org_id,party);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':quote-customer:'||trim(p_payload->>'customerPhone'),0));
  SELECT id INTO customer FROM public.customers WHERE org_id=p_org_id AND phone=trim(p_payload->>'customerPhone')
    ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.customers(org_id,full_name,phone,email,status)
      VALUES(p_org_id,trim(p_payload->>'customerName'),trim(p_payload->>'customerPhone'),nullif(p_payload->>'customerEmail',''),'active')
      RETURNING id INTO customer;
  END IF;
  SELECT jsonb_agg(to_jsonb(i) ORDER BY day_number,sort_order,id) INTO lines FROM public.quotation_items i
    WHERE quotation_id=q.id AND org_id=p_org_id;
  options := jsonb_build_object(
    'quotation_snapshot',jsonb_build_object('id',q.id,'reference',q.reference,'bookingContext',q.booking_context,
      'netTotal',q.net_total,'sellTotal',q.sell_total,'marginTotal',q.margin_total,'currency',q.currency,'items',lines),
    'booking_snapshot',jsonb_build_object('version',1,'captured_at',clock_timestamp(),'quotation_id',q.id,
      'quotation_reference',q.reference,'currency',q.currency,'total_at_booking',q.sell_total,'services',
      (SELECT jsonb_agg(jsonb_build_object('id',i.id,'type',i.category,'provider',i.title,'description',i.description,
         'unitPrice',round(i.net_unit_price*(1+CASE WHEN q.markup_strategy='uniform' THEN q.global_markup_percent ELSE i.markup_percent END/100),2),
         'quantity',i.quantity,'totalPrice',round(i.net_unit_price*i.quantity*(1+CASE WHEN q.markup_strategy='uniform' THEN q.global_markup_percent ELSE i.markup_percent END/100),2),
         'currency',i.currency,'isOptional',NOT i.included) ORDER BY i.day_number,i.sort_order,i.id)
       FROM public.quotation_items i WHERE i.quotation_id=q.id AND i.org_id=p_org_id),
       'accommodation','[]'::jsonb));
  INSERT INTO public.reservations(org_id,quotation_id,departure_id,customer_id,customer_name,customer_phone,
    party_size,reservation_at,status,total_amount,currency,source,assigned_to,options,creation_fingerprint,creation_state,creation_error_stage)
  VALUES(p_org_id,q.id,target_departure,customer,trim(p_payload->>'customerName'),trim(p_payload->>'customerPhone'),
    party,clock_timestamp(),'confirmed',q.sell_total,q.currency,'agent',p_actor_id,options,p_fingerprint,'completed',NULL)
  RETURNING * INTO r;
  INSERT INTO public.departure_passengers(org_id,departure_id,reservation_id,full_name)
    SELECT p_org_id,target_departure,r.id,trim(p->>'full_name') FROM jsonb_array_elements(p_payload->'passengers') p;
  SELECT * INTO r FROM public.reservations WHERE id=r.id AND org_id=p_org_id;
  RETURN jsonb_build_object('created',true,'reservation',to_jsonb(r));
END;
$$;
REVOKE ALL ON FUNCTION public.book_quotation_atomic(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_quotation_atomic(uuid,uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
