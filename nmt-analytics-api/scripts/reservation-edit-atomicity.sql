-- Disposable replay/acceptance databases only. All synthetic fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.expect_edit_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF position(expected in SQLERRM)>0 THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected edit rejection: %',expected;
END $$;
DO $$
DECLARE
  org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
  trip uuid:=gen_random_uuid(); other_trip uuid:=gen_random_uuid(); booking uuid:=gen_random_uuid(); standalone uuid:=gen_random_uuid();
  hotel uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid(); foreign_customer uuid:=gen_random_uuid();
  result jsonb; before_row jsonb; before_requirements jsonb; before_booked integer; role_name text;
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(org,'Atomic edit',org::text),(other_org,'Foreign edit',other_org::text);
  INSERT INTO public.packages(id,org_id,name,destination,base_price,currency) VALUES(product,org,'Synthetic package','Synthetic',100,'EUR');
  INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,booked)
    VALUES(trip,org,product,now(),now()+interval '1 day',4,2),(other_trip,org,product,now()+interval '2 days',now()+interval '3 days',4,0);
  INSERT INTO public.customers(id,org_id,full_name,phone) VALUES(foreign_customer,other_org,'Foreign buyer','+00000');
  INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount,currency)
    VALUES(booking,org,trip,'Original buyer',2,now(),200,'EUR'),(standalone,org,NULL,'Standalone',1,now(),100,'EUR');
  INSERT INTO public.hotels(id,org_id,name,destination,slug) VALUES(hotel,org,'Synthetic hotel','Synthetic',hotel::text);
  INSERT INTO public.hotel_allocations(id,org_id,departure_id,hotel_id,room_type,rooms_reserved,capacity_per_room,check_in,check_out,sell_price)
    VALUES(allocation,org,trip,hotel,'triple',2,3,current_date,current_date+1,100);

  result:=public.edit_reservation_atomic(org,booking,'{"party_size":3,"customer_name":"Combined buyer"}',
    jsonb_build_array(jsonb_build_object('hotel_allocation_id',allocation,'room_count',1,'guests_expected',3,'passenger_ids','[]'::jsonb)));
  IF result->>'customer_name'<>'Combined buyer' OR (result->>'party_size')::integer<>3
     OR (SELECT booked FROM public.departures WHERE id=trip)<>3
     OR (SELECT sum(guests_expected) FROM public.reservation_accommodation_requirements WHERE reservation_id=booking)<>3
  THEN RAISE EXCEPTION 'Combined save did not persist all parts'; END IF;
  DROP TABLE pg_temp.tmp_reservation_accommodation_requirements;
  SELECT to_jsonb(r) INTO before_row FROM public.reservations r WHERE id=booking;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY id) INTO before_requirements FROM public.reservation_accommodation_requirements a WHERE reservation_id=booking;
  SELECT booked INTO before_booked FROM public.departures WHERE id=trip;

  -- Core and +1 capacity execute first; accommodation coverage then rejects.
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,
    '{"party_size":4,"customer_name":"Must roll back"}',jsonb_build_array(jsonb_build_object('hotel_allocation_id',allocation,'room_count',1,'guests_expected',3))),
    'ACCOMMODATION_COVERAGE_MISMATCH');
  IF (SELECT to_jsonb(r) FROM public.reservations r WHERE id=booking) IS DISTINCT FROM before_row
     OR (SELECT booked FROM public.departures WHERE id=trip)<>before_booked
     OR (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.reservation_accommodation_requirements a WHERE reservation_id=booking) IS DISTINCT FROM before_requirements
  THEN RAISE EXCEPTION 'Failed accommodation edit leaked core/capacity/requirement mutation'; END IF;

  -- A departure move must also roll back release+reserve if its allocation fails.
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,
    jsonb_build_object('departure_id',other_trip),jsonb_build_array(jsonb_build_object('hotel_allocation_id',allocation,'room_count',1,'guests_expected',3))),
    'ALLOTMENT_WRONG_DEPARTURE');
  IF (SELECT departure_id FROM public.reservations WHERE id=booking)<>trip
     OR (SELECT booked FROM public.departures WHERE id=trip)<>before_booked
     OR (SELECT booked FROM public.departures WHERE id=other_trip)<>0
  THEN RAISE EXCEPTION 'Failed move leaked capacity'; END IF;

  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,'{"party_size":5}','[]'),'CAPACITY_FULL');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',other_org,booking,'{"customer_name":"Foreign"}','[]'),'RESERVATION_NOT_FOUND');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,jsonb_build_object('customer_id',foreign_customer),'[]'),'CUSTOMER_NOT_FOUND');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,'{"paid_amount":1}','[]'),'INVALID_RESERVATION_UPDATE');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,booking,'{"currency":"BAM"}','[]'),'RESERVATION_DEPARTURE_CURRENCY_MISMATCH');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,NULL)',org,booking,'{}'),'INVALID_ACCOMMODATION_INTENT');

  SET LOCAL ROLE service_role;
  result:=public.edit_reservation_atomic(org,standalone,'{"customer_name":"Standalone saved"}','[]');
  RESET ROLE;
  IF result->>'customer_name'<>'Standalone saved' THEN RAISE EXCEPTION 'Standalone empty save failed'; END IF;
  INSERT INTO public.payment_links(org_id,reservation_id,code,amount,currency,expires_at)
    VALUES(org,standalone,standalone::text,10,'EUR',now()+interval '1 day');
  PERFORM pg_temp.expect_edit_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,standalone,'{"currency":"BAM"}','[]'),'RESERVATION_CURRENCY_LOCKED');

  result:=public.edit_reservation_atomic(org,booking,'{"status":"cancelled"}',NULL);
  IF result->>'status'<>'cancelled' OR (SELECT booked FROM public.departures WHERE id=trip)<>0
     OR (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.reservation_accommodation_requirements a WHERE reservation_id=booking) IS DISTINCT FROM before_requirements
  THEN RAISE EXCEPTION 'Cancellation failed to release capacity/preserve history'; END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.edit_reservation_atomic(uuid,uuid,jsonb,jsonb)','EXECUTE')
    THEN RAISE EXCEPTION 'Browser can execute combined edit'; END IF;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I',role_name);
      PERFORM public.edit_reservation_atomic(org,booking,'{}','[]');
      RAISE EXCEPTION 'Unauthorized edit executed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.edit_reservation_atomic(uuid,uuid,jsonb,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Service edit privilege missing'; END IF;
  RAISE NOTICE 'PASS atomic reservation edit: success, rollback, capacity/move, tenant/customer/currency/ledger and browser ACL';
END $$;
ROLLBACK;
