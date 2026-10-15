-- Quotation creation is one API-only transaction. No historical context is invented.
ALTER TABLE public.quotations ADD COLUMN booking_context jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(booking_context) = 'object');

CREATE TABLE public.quotation_reference_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  last_number bigint NOT NULL CHECK (last_number > 0),
  PRIMARY KEY (org_id, year)
);
ALTER TABLE public.quotation_reference_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotation_reference_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.quotation_reference_counters TO service_role;
COMMENT ON TABLE public.quotation_reference_counters IS 'API-only org/year quotation sequence; never reuse a deleted reference.';

CREATE FUNCTION public.guard_quotation_booking_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.booking_context IS DISTINCT FROM OLD.booking_context THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_CONTEXT_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_quotation_booking_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_quotation_booking_context() TO service_role;
CREATE TRIGGER quotations_booking_context_guard BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_booking_context();

CREATE FUNCTION public.create_quotation_snapshot_atomic(p_org_id uuid, p_actor_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  itinerary public.itineraries;
  version public.itinerary_versions;
  inquiry public.inquiries;
  created public.quotations;
  itinerary_id uuid := nullif(p_payload->>'itinerary_id','')::uuid;
  version_id uuid := nullif(p_payload->>'itinerary_version_id','')::uuid;
  source_items jsonb;
  context jsonb;
  quote_currency text;
  quote_year integer := extract(year FROM statement_timestamp() AT TIME ZONE 'UTC')::integer;
  max_existing bigint;
  sequence_number bigint;
BEGIN
  IF NOT EXISTS(SELECT FROM public.profiles p WHERE p.id=p_actor_id AND p.org_id=p_org_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='QUOTATION_ACTOR_CONTEXT_INVALID';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR ((itinerary_id IS NULL) <> (version_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_INVALID_PAYLOAD';
  END IF;

  IF itinerary_id IS NOT NULL THEN
    SELECT * INTO itinerary FROM public.itineraries i WHERE i.id=itinerary_id AND i.org_id=p_org_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_SOURCE_NOT_FOUND'; END IF;
    SELECT * INTO version FROM public.itinerary_versions v
    WHERE v.id=version_id AND v.itinerary_id=itinerary.id AND v.org_id=p_org_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_SOURCE_NOT_FOUND'; END IF;
    quote_currency := itinerary.currency;
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.day_number,i.sort_order,i.id),'[]'::jsonb)
      INTO source_items FROM public.itinerary_items i WHERE i.itinerary_version_id=version.id AND i.org_id=p_org_id;
    IF itinerary.inquiry_id IS NOT NULL THEN
      SELECT * INTO inquiry FROM public.inquiries q WHERE q.id=itinerary.inquiry_id AND q.org_id=p_org_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_SOURCE_NOT_FOUND'; END IF;
    END IF;
    context := jsonb_build_object(
      'source','itinerary','itineraryId',itinerary.id,'itineraryVersionId',version.id,
      'versionNumber',version.version_number,'itineraryTitle',itinerary.title,
      'tripType',itinerary.trip_type,'destination',itinerary.destination,
      'travelStart',itinerary.travel_start,'travelEnd',itinerary.travel_end,
      'travelers',itinerary.travelers,'currency',quote_currency,'inquiryId',itinerary.inquiry_id,
      'contactName',inquiry.contact_name,'phone',inquiry.phone,'email',inquiry.email);
  ELSE
    source_items := coalesce(p_payload->'items','[]'::jsonb);
    IF jsonb_typeof(source_items) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_INVALID_PAYLOAD';
    END IF;
    quote_currency := coalesce(nullif(p_payload->>'currency',''),nullif(source_items->0->>'currency',''),'BAM');
    context := jsonb_build_object('source','standalone','currency',quote_currency);
  END IF;

  IF jsonb_array_length(source_items)>500 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_TOO_MANY_ITEMS';
  END IF;
  IF quote_currency !~ '^[A-Z]{3}$'
     OR EXISTS(SELECT FROM jsonb_array_elements(source_items) i
               WHERE coalesce(nullif(i->>'currency',''),quote_currency) <> quote_currency) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='QUOTATION_CURRENCY_MISMATCH';
  END IF;

  SELECT coalesce(max(CASE WHEN q.reference ~ ('^QTN-'||quote_year||'-[0-9]+$')
                          THEN split_part(q.reference,'-',3)::bigint ELSE 0 END),0)
    INTO max_existing FROM public.quotations q WHERE q.org_id=p_org_id;
  INSERT INTO public.quotation_reference_counters(org_id,year,last_number)
  VALUES(p_org_id,quote_year,max_existing+1)
  ON CONFLICT(org_id,year) DO UPDATE SET
    last_number=greatest(public.quotation_reference_counters.last_number,max_existing)+1
  RETURNING last_number INTO sequence_number;

  INSERT INTO public.quotations(org_id,itinerary_id,itinerary_version_id,title,reference,status,
    client_notes,internal_notes,valid_until,markup_strategy,global_markup_percent,currency,created_by,booking_context)
  VALUES(p_org_id,itinerary_id,version_id,p_payload->>'title',
    'QTN-'||quote_year||'-'||lpad(sequence_number::text,greatest(4,length(sequence_number::text)),'0'),'draft',
    p_payload->>'client_notes',p_payload->>'internal_notes',left(p_payload->>'valid_until',10)::date,
    coalesce(p_payload->>'markup_strategy','per_item'),coalesce((p_payload->>'global_markup_percent')::numeric,0),
    quote_currency,p_actor_id,context)
  RETURNING * INTO created;

  INSERT INTO public.quotation_items(org_id,quotation_id,title,description,location,category,day_number,sort_order,start_time,
    supplier_id,supplier_service_id,quantity,unit,net_unit_price,markup_percent,currency,included)
  SELECT p_org_id,created.id,i.title,i.description,i.location,coalesce(i.category,'other'),coalesce(i.day_number,1),
    coalesce(i.sort_order,0),i.start_time::time,i.supplier_id,i.supplier_service_id,
    coalesce(i.quantity,1),coalesce(i.unit,'fixed'),coalesce(i.net_unit_price,0),coalesce(i.markup_percent,0),
    coalesce(nullif(i.currency,''),quote_currency),coalesce(i.included,true)
  FROM jsonb_to_recordset(source_items) AS i(title text,description text,location text,category text,day_number integer,
    sort_order integer,start_time text,supplier_id uuid,supplier_service_id uuid,quantity numeric,unit text,
    net_unit_price numeric,markup_percent numeric,currency text,included boolean);

  UPDATE public.quotations q SET
    net_total=prices.net, sell_total=prices.sell, margin_total=prices.sell-prices.net
  FROM (
    SELECT round(coalesce(sum(i.quantity*i.net_unit_price),0),2) net,
           round(coalesce(sum(i.quantity*i.net_unit_price*
             (1+CASE WHEN created.markup_strategy='uniform' THEN created.global_markup_percent ELSE i.markup_percent END/100)),0),2) sell
    FROM public.quotation_items i WHERE i.quotation_id=created.id AND i.org_id=p_org_id
  ) prices WHERE q.id=created.id AND q.org_id=p_org_id RETURNING q.* INTO created;
  RETURN to_jsonb(created);
END;
$$;
REVOKE ALL ON FUNCTION public.create_quotation_snapshot_atomic(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_snapshot_atomic(uuid,uuid,jsonb) TO service_role;
COMMENT ON FUNCTION public.create_quotation_snapshot_atomic(uuid,uuid,jsonb) IS 'Service-only API boundary: org/year reference, context, persisted item prices and header commit atomically.';
