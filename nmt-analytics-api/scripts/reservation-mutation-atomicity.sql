-- Disposable replay/acceptance only. Every fixture, test trigger and write rolls back.
BEGIN;
CREATE FUNCTION pg_temp.expect_mutation_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'Expected mutation rejection: %',expected;
END $$;
CREATE FUNCTION pg_temp.fail_reservation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('travline.test_fail_mutation',true)='on' THEN RAISE EXCEPTION 'TEST_RESERVATION_WRITE_FAILURE'; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER test_reservation_mutation_failure AFTER UPDATE OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_reservation_mutation();
DO $$
DECLARE
  org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid(); other_trip uuid:=gen_random_uuid(); booking uuid:=gen_random_uuid(); companion uuid:=gen_random_uuid(); legacy_booking uuid:=gen_random_uuid();
  hotel uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid(); pax1 uuid:=gen_random_uuid(); pax2 uuid:=gen_random_uuid();
  before_row jsonb; before_requirements jsonb; before_passengers jsonb; result jsonb; command text; fn text; actor text;
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(org,'Mutation contract',org::text),(other_org,'Foreign contract',other_org::text);
  INSERT INTO public.packages(id,org_id,name,destination,base_price,currency) VALUES(product,org,'Synthetic','Synthetic',100,'EUR');
  INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,booked) VALUES(trip,org,product,now(),now()+interval '1 day',8,2),(other_trip,org,product,now()+interval '2 days',now()+interval '3 days',8,0);
  INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount,currency)
    VALUES(booking,org,trip,'Synthetic buyer',2,now(),200,'EUR');
  INSERT INTO public.departure_passengers(id,org_id,reservation_id,departure_id,full_name)
    VALUES(pax1,org,booking,trip,'Synthetic first'),(pax2,org,booking,trip,'Synthetic second');
  INSERT INTO public.hotels(id,org_id,name,destination,slug) VALUES(hotel,org,'Synthetic','Synthetic',hotel::text);
  INSERT INTO public.hotel_allocations(id,org_id,departure_id,hotel_id,room_type,rooms_reserved,capacity_per_room,check_in,check_out)
    VALUES(allocation,org,trip,hotel,'double',2,2,current_date,current_date+1);
  PERFORM public.edit_reservation_atomic(org,booking,'{}',jsonb_build_array(jsonb_build_object(
    'hotel_allocation_id',allocation,'room_count',1,'guests_expected',2,'passenger_ids',jsonb_build_array(pax1,pax2))));
  DROP TABLE pg_temp.tmp_reservation_accommodation_requirements;
  SELECT to_jsonb(r) INTO before_row FROM public.reservations r WHERE id=booking;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_requirements FROM public.reservation_accommodation_requirements r WHERE reservation_id=booking;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO before_passengers FROM public.departure_passengers p WHERE reservation_id=booking;

  PERFORM set_config('travline.test_fail_mutation','on',true);
  FOREACH command IN ARRAY ARRAY[
    format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"party_size":3,"customer_name":"Rejected"}'),
    format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"status":"cancelled"}'),
    format('SELECT public.delete_reservation_atomic(%L,%L)',org,booking)
  ] LOOP
    PERFORM pg_temp.expect_mutation_error(command,'TEST_RESERVATION_WRITE_FAILURE');
    IF (SELECT to_jsonb(r) FROM public.reservations r WHERE id=booking) IS DISTINCT FROM before_row
      OR (SELECT booked FROM public.departures WHERE id=trip)<>2
      OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reservation_accommodation_requirements r WHERE reservation_id=booking) IS DISTINCT FROM before_requirements
      OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.departure_passengers p WHERE reservation_id=booking) IS DISTINCT FROM before_passengers
    THEN RAISE EXCEPTION 'Failed mutation leaked row/capacity/traveler/accommodation changes'; END IF;
  END LOOP;
  PERFORM set_config('travline.test_fail_mutation','off',true);

  PERFORM pg_temp.expect_mutation_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',other_org,booking,'{}'),'RESERVATION_NOT_FOUND');
  PERFORM pg_temp.expect_mutation_error(format('SELECT public.delete_reservation_atomic(%L,%L)',other_org,booking),'RESERVATION_NOT_FOUND');
  PERFORM pg_temp.expect_mutation_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,jsonb_build_object('departure_id',other_trip)), 'departure_passengers_reservation_departure_org_fk');
  IF (SELECT departure_id FROM public.reservations WHERE id=booking)<>trip
    OR (SELECT booked FROM public.departures WHERE id=trip)<>2 OR (SELECT booked FROM public.departures WHERE id=other_trip)<>0
  THEN RAISE EXCEPTION 'Rejected traveler-linked move leaked capacity'; END IF;
  UPDATE public.hotel_allocations SET sell_price=999,net_price=777 WHERE id=allocation;
  SET LOCAL ROLE service_role;
  result:=public.update_reservation_core_atomic(org,booking,'{"customer_name":"Saved buyer"}');
  RESET ROLE;
  IF result->>'customer_name'<>'Saved buyer'
    OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reservation_accommodation_requirements r WHERE reservation_id=booking) IS DISTINCT FROM before_requirements
    OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.departure_passengers p WHERE reservation_id=booking) IS DISTINCT FROM before_passengers
  THEN RAISE EXCEPTION 'Core-only edit changed canonical accommodation/travelers'; END IF;
  result:=public.update_reservation_core_atomic(org,booking,'{"status":"cancelled"}');
  IF (SELECT booked FROM public.departures WHERE id=trip)<>0 THEN RAISE EXCEPTION 'Cancellation did not release capacity'; END IF;
  -- Another booking can consume the rooms while this reservation is cancelled.
  INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount,currency)
    VALUES(companion,org,trip,'Synthetic competing buyer',4,now(),400,'EUR');
  UPDATE public.departures SET booked=4 WHERE id=trip;
  PERFORM public.edit_reservation_atomic(org,companion,'{}',jsonb_build_array(jsonb_build_object(
    'hotel_allocation_id',allocation,'room_count',2,'guests_expected',4,'passenger_ids','[]'::jsonb)));
  DROP TABLE pg_temp.tmp_reservation_accommodation_requirements;
  PERFORM pg_temp.expect_mutation_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"status":"confirmed"}'),'ACCOMMODATION_OVERBOOKED');
  IF (SELECT status FROM public.reservations WHERE id=booking)<>'cancelled' OR (SELECT booked FROM public.departures WHERE id=trip)<>4
  THEN RAISE EXCEPTION 'Room-conflicted reactivation leaked status/capacity'; END IF;
  PERFORM public.delete_reservation_atomic(org,companion);
  result:=public.update_reservation_core_atomic(org,booking,'{"status":"confirmed"}');
  IF (SELECT booked FROM public.departures WHERE id=trip)<>2 THEN RAISE EXCEPTION 'Reactivation did not reserve capacity'; END IF;

  INSERT INTO public.payment_links(org_id,reservation_id,code,amount,currency,expires_at) VALUES(org,booking,booking::text,10,'EUR',now()+interval '1 day');
  PERFORM pg_temp.expect_mutation_error(format('SELECT public.delete_reservation_atomic(%L,%L)',org,booking),'RESERVATION_FINANCIAL_HISTORY_LOCKED');
  IF (SELECT booked FROM public.departures WHERE id=trip)<>2 OR NOT EXISTS(SELECT FROM public.reservations WHERE id=booking)
  THEN RAISE EXCEPTION 'Financially locked delete changed state'; END IF;
  -- Only remove this transaction's synthetic link to prove no-history deletion.
  DELETE FROM public.payment_links WHERE org_id=org AND reservation_id=booking;
  -- Test-only historical fixture. Temporarily suspend the immutable statement
  -- trigger solely inside this rollback transaction, then immediately restore it.
  INSERT INTO public.reservations(id,org_id,customer_name,party_size,reservation_at,total_amount,currency)
    VALUES(legacy_booking,org,'Synthetic historical buyer',1,now(),100,'EUR');
  ALTER TABLE public.transactions DISABLE TRIGGER legacy_transactions_read_only;
  INSERT INTO public.transactions(org_id,reservation_id,amount,type,currency,occurred_at)
    VALUES(org,legacy_booking,20,'payment','EUR',now());
  ALTER TABLE public.transactions ENABLE TRIGGER legacy_transactions_read_only;
  PERFORM pg_temp.expect_mutation_error(format('SELECT public.delete_reservation_atomic(%L,%L)',org,legacy_booking),'RESERVATION_FINANCIAL_HISTORY_LOCKED');
  PERFORM pg_temp.expect_mutation_error(format('DELETE FROM public.transactions WHERE reservation_id=%L',legacy_booking),'LEGACY_TRANSACTIONS_READ_ONLY');
  IF NOT EXISTS(SELECT FROM public.transactions WHERE org_id=org AND reservation_id=legacy_booking)
    OR NOT EXISTS(SELECT FROM public.reservations WHERE id=legacy_booking)
  THEN RAISE EXCEPTION 'Legacy history deletion guard failed'; END IF;
  result:=public.delete_reservation_atomic(org,booking);
  IF result->>'id'<>booking::text OR EXISTS(SELECT FROM public.reservations WHERE id=booking)
     OR (SELECT booked FROM public.departures WHERE id=trip)<>0
  THEN RAISE EXCEPTION 'Successful deletion did not commit row and capacity together'; END IF;

  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I',actor);
      PERFORM public.update_reservation_core_atomic(org,booking,'{}');
      RAISE EXCEPTION 'Unauthorized core mutation executed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I',actor);
      PERFORM public.delete_reservation_atomic(org,booking);
      RAISE EXCEPTION 'Unauthorized deletion executed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['public.update_reservation_core_atomic(uuid,uuid,jsonb)','public.delete_reservation_atomic(uuid,uuid)'] LOOP
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(actor,fn,'EXECUTE') THEN RAISE EXCEPTION 'Browser can execute mutation RPC'; END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'Service mutation privilege missing'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS core/status/delete rollback, capacity, tenant, accommodation/traveler preservation, financial history and RPC ACL';
END $$;
ROLLBACK;
