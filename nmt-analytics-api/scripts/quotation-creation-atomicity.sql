-- Disposable replay transaction; no synthetic records survive.
BEGIN;
CREATE FUNCTION pg_temp.expect_atomic_quote_error(statement text, expected_state text, expected_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected_state AND (expected_message IS NULL OR SQLERRM=expected_message) THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected quotation transaction error for %',statement;
END;
$$;
DO $$
DECLARE
  org uuid := gen_random_uuid(); other_org uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid();
  inquiry uuid := gen_random_uuid(); itinerary uuid := gen_random_uuid(); version uuid := gen_random_uuid();
  quote_year integer := extract(year FROM now() AT TIME ZONE 'UTC')::integer;
  quote jsonb; second jsonb; third jsonb; other jsonb;
  count_before integer; counter_before bigint;
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(org,'Atomic quote',org::text),(other_org,'Other quote',other_org::text);
  INSERT INTO auth.users(id,email) VALUES(actor,'quote-actor@replay.test'),(other_actor,'quote-other@replay.test');
  INSERT INTO public.profiles(id,org_id,email,role) VALUES(actor,org,'quote-actor@replay.test','director'),(other_actor,other_org,'quote-other@replay.test','director')
    ON CONFLICT(id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role;
  INSERT INTO public.inquiries(id,org_id,contact_name,phone,email) VALUES(inquiry,org,'Original contact','+38761000001','original@replay.test');
  INSERT INTO public.itineraries(id,org_id,inquiry_id,title,destination,travel_start,travel_end,travelers,currency)
    VALUES(itinerary,org,inquiry,'Original plan','Vienna','2027-04-10','2027-04-15',4,'EUR');
  INSERT INTO public.itinerary_versions(id,org_id,itinerary_id,version_number) VALUES(version,org,itinerary,1);
  INSERT INTO public.itinerary_items(org_id,itinerary_version_id,title,quantity,net_unit_price,markup_percent,currency)
    VALUES(org,version,'Original service',1.25,10.01,10,'EUR');
  INSERT INTO public.quotations(org_id,title,reference,currency) VALUES(org,'Existing reference','QTN-'||quote_year||'-0040','EUR');
  quote := public.create_quotation_snapshot_atomic(org,actor,jsonb_build_object(
    'title','Fixed source','itinerary_id',itinerary,'itinerary_version_id',version,'currency','BAM'));
  IF quote->>'reference' <> 'QTN-'||quote_year||'-0041' OR (quote->>'net_total')::numeric<>12.51 OR (quote->>'sell_total')::numeric<>13.76 THEN
    RAISE EXCEPTION 'Reference or persisted pricing mismatch: %',quote;
  END IF;
  IF quote->>'currency'<>'EUR' OR quote->'booking_context'->>'contactName'<>'Original contact'
     OR quote->'booking_context'->>'travelStart'<>'2027-04-10'
     OR quote->'booking_context'->>'travelers'<>'4' THEN RAISE EXCEPTION 'Source context not preserved'; END IF;
  UPDATE public.itineraries SET title='Changed plan',travel_start='2027-05-01',travelers=9 WHERE id=itinerary;
  UPDATE public.inquiries SET contact_name='Changed contact' WHERE id=inquiry;
  IF (SELECT booking_context FROM public.quotations WHERE id=(quote->>'id')::uuid) IS DISTINCT FROM quote->'booking_context' THEN
    RAISE EXCEPTION 'Later source edits changed context';
  END IF;
  PERFORM pg_temp.expect_atomic_quote_error(format('UPDATE public.quotations SET booking_context=''{}''::jsonb WHERE id=%L',quote->>'id'),'P0001','QUOTATION_CONTEXT_LOCKED');

  second := public.create_quotation_snapshot_atomic(org,actor,'{"title":"Manual","currency":"EUR","items":[{"title":"Inherited currency","quantity":1,"net_unit_price":5}]}'::jsonb);
  IF second->>'reference'<>'QTN-'||quote_year||'-0042' OR second->>'currency'<>'EUR' THEN RAISE EXCEPTION 'Manual quote mismatch'; END IF;
  DELETE FROM public.quotations WHERE id=(second->>'id')::uuid;
  third := public.create_quotation_snapshot_atomic(org,actor,'{"title":"After delete","currency":"EUR"}'::jsonb);
  IF third->>'reference'<>'QTN-'||quote_year||'-0043' THEN RAISE EXCEPTION 'Deleted reference reused'; END IF;
  other := public.create_quotation_snapshot_atomic(other_org,other_actor,'{"title":"Other organization"}'::jsonb);
  IF other->>'reference'<>'QTN-'||quote_year||'-0001' THEN RAISE EXCEPTION 'Counter not org-scoped'; END IF;

  SELECT count(*) INTO count_before FROM public.quotations WHERE org_id=org;
  SELECT last_number INTO counter_before FROM public.quotation_reference_counters WHERE org_id=org AND quotation_reference_counters.year=quote_year;
  PERFORM pg_temp.expect_atomic_quote_error(format(
    'SELECT public.create_quotation_snapshot_atomic(%L,%L,%L::jsonb)',org,actor,
    jsonb_build_object('title','Invalid supplier','currency','EUR','items',jsonb_build_array(jsonb_build_object('title','Bad supplier','supplier_id',gen_random_uuid(),'currency','EUR')))),
    '23503');
  PERFORM pg_temp.expect_atomic_quote_error(format(
    'SELECT public.create_quotation_snapshot_atomic(%L,%L,%L::jsonb)',org,actor,
    '{"title":"Mixed","currency":"EUR","items":[{"title":"Wrong currency","currency":"BAM"}]}'),'P0001','QUOTATION_CURRENCY_MISMATCH');
  PERFORM pg_temp.expect_atomic_quote_error(format(
    'SELECT public.create_quotation_snapshot_atomic(%L,%L,%L::jsonb)',org,actor,
    jsonb_build_object('title','Bad version','itinerary_id',itinerary,'itinerary_version_id',gen_random_uuid())),'P0001','QUOTATION_SOURCE_NOT_FOUND');
  PERFORM pg_temp.expect_atomic_quote_error(format(
    'SELECT public.create_quotation_snapshot_atomic(%L,%L,%L::jsonb)',other_org,actor,'{"title":"Wrong actor"}'),'42501','QUOTATION_ACTOR_CONTEXT_INVALID');
  IF (SELECT count(*) FROM public.quotations WHERE org_id=org) <> count_before
     OR (SELECT last_number FROM public.quotation_reference_counters WHERE org_id=org AND quotation_reference_counters.year=quote_year) <> counter_before THEN
    RAISE EXCEPTION 'Failed item/source write leaked quotation or consumed reference';
  END IF;
  UPDATE public.quotations SET status='accepted' WHERE id=(quote->>'id')::uuid;
  PERFORM pg_temp.expect_atomic_quote_error(format('UPDATE public.quotations SET booking_context=''{}''::jsonb WHERE id=%L',quote->>'id'),'P0001','QUOTATION_LOCKED');
  IF has_function_privilege('authenticated','public.create_quotation_snapshot_atomic(uuid,uuid,jsonb)','execute')
     OR has_function_privilege('anon','public.create_quotation_snapshot_atomic(uuid,uuid,jsonb)','execute')
     OR has_table_privilege('authenticated','public.quotation_reference_counters','select')
     OR has_table_privilege('anon','public.quotation_reference_counters','insert')
     OR has_table_privilege('authenticated','public.quotations','update')
     OR has_table_privilege('authenticated','public.quotation_items','insert') THEN
    RAISE EXCEPTION 'Atomic quote resources accessible to clients';
  END IF;
  IF NOT EXISTS(SELECT FROM pg_class WHERE oid='public.quotation_reference_counters'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Counter RLS missing';
  END IF;
  RAISE NOTICE 'Atomic quotation creation PASS';
END;
$$;
ROLLBACK;
