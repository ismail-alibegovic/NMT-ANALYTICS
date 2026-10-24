BEGIN;
CREATE FUNCTION pg_temp.expect_booking_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Expected % for %',expected,statement;
END; $$;
CREATE FUNCTION pg_temp.reject_test_booking_passenger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.full_name='Reject transaction passenger' THEN RAISE EXCEPTION 'TEST_PASSENGER_FAILURE'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER test_booking_passenger_failure BEFORE INSERT ON public.departure_passengers FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_booking_passenger();
DO $$
DECLARE
 org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 itinerary uuid:=gen_random_uuid(); version uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); departure uuid:=gen_random_uuid();
 q jsonb; failed_q jsonb; full_q jsonb; result jsonb; retry jsonb; payload jsonb; fingerprint text:=repeat('a',64);
 customer_count integer;
BEGIN
 INSERT INTO public.organizations(id,name,slug,timezone) VALUES(org,'Booking replay',org::text,'Europe/Sarajevo'),(other_org,'Other org',other_org::text,'UTC');
 INSERT INTO auth.users(id,email) VALUES(actor,'booking-replay@test.test');
 INSERT INTO public.profiles(id,org_id,role,email) VALUES(actor,org,'director','booking-replay@test.test') ON CONFLICT(id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role;
 INSERT INTO public.itineraries(id,org_id,title,travel_start,travel_end,travelers,currency) VALUES(itinerary,org,'Accepted trip','2027-04-10','2027-04-15',2,'EUR');
 INSERT INTO public.itinerary_versions(id,org_id,itinerary_id,version_number) VALUES(version,org,itinerary,1);
 INSERT INTO public.itinerary_items(org_id,itinerary_version_id,title,quantity,net_unit_price,markup_percent,currency)
 VALUES(org,version,'Quoted service',2,80,10,'EUR');
 INSERT INTO public.packages(id,org_id,itinerary_id,name,destination,base_price,currency,is_active)
 VALUES(product,org,itinerary,'Operational package','Vienna',999,'EUR',true);
 INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,status,booked)
 VALUES(departure,org,product,'2027-04-09T22:30:00Z','2027-04-14T22:30:00Z',4,'active',0);
 q:=public.create_quotation_snapshot_atomic(org,actor,jsonb_build_object('title','Booked quote','itinerary_id',itinerary,'itinerary_version_id',version));
 failed_q:=public.create_quotation_snapshot_atomic(org,actor,jsonb_build_object('title','Failure quote','itinerary_id',itinerary,'itinerary_version_id',version));
 full_q:=public.create_quotation_snapshot_atomic(org,actor,jsonb_build_object('title','Full quote','itinerary_id',itinerary,'itinerary_version_id',version));
 UPDATE public.quotations SET status='accepted' WHERE org_id=org;
 payload:=jsonb_build_object('departureId',departure,'customerName','Buyer','customerPhone','+38761111','passengers',jsonb_build_array(jsonb_build_object('full_name','First traveler'),jsonb_build_object('full_name','Second traveler')));
 IF jsonb_array_length(public.quotation_booking_departures(org,(q->>'id')::uuid))<>1 THEN RAISE EXCEPTION 'Matching departure missing'; END IF;
 UPDATE public.packages SET currency='BAM' WHERE id=product;
 IF jsonb_array_length(public.quotation_booking_departures(org,(q->>'id')::uuid))<>0 THEN RAISE EXCEPTION 'Mismatched currency offered'; END IF;
 UPDATE public.packages SET currency='EUR' WHERE id=product;
 UPDATE public.departures SET depart_at='2027-04-11T10:00:00Z' WHERE id=departure;
 IF jsonb_array_length(public.quotation_booking_departures(org,(q->>'id')::uuid))<>0 THEN RAISE EXCEPTION 'Mismatched date offered'; END IF;
 UPDATE public.departures SET depart_at='2027-04-09T22:30:00Z' WHERE id=departure;
 PERFORM pg_temp.expect_booking_error(format('SELECT public.book_quotation_atomic(%L,%L,%L,%L::jsonb,%L)',other_org,actor,q->>'id',payload,fingerprint),'QUOTATION_ACTOR_INVALID');
 result:=public.book_quotation_atomic(org,actor,(q->>'id')::uuid,payload,fingerprint);
 PERFORM pg_temp.expect_booking_error(format('SELECT public.edit_reservation_atomic(%L,%L,%L::jsonb,%L::jsonb)',org,result->'reservation'->>'id','{"total_amount":0}','[]'),'QUOTATION_BOOKING_LOCKED');
 retry:=public.book_quotation_atomic(org,actor,(q->>'id')::uuid,payload,fingerprint);
 IF NOT (result->>'created')::boolean OR (retry->>'created')::boolean OR result->'reservation'->>'id'<>retry->'reservation'->>'id' THEN RAISE EXCEPTION 'Booking retry duplicated reservation'; END IF;
 IF (result->'reservation'->>'total_amount')::numeric<>176 OR result->'reservation'->>'currency'<>'EUR'
    OR (SELECT count(*) FROM public.departure_passengers WHERE reservation_id=(result->'reservation'->>'id')::uuid)<>2 THEN RAISE EXCEPTION 'Approved price or traveler snapshot mismatch'; END IF;
 PERFORM pg_temp.expect_booking_error(format('SELECT public.book_quotation_atomic(%L,%L,%L,%L::jsonb,%L)',org,actor,q->>'id',payload,repeat('b',64)),'QUOTATION_ALREADY_BOOKED');
 PERFORM pg_temp.expect_booking_error(format('UPDATE public.reservations SET total_amount=1 WHERE id=%L',result->'reservation'->>'id'),'QUOTATION_BOOKING_LOCKED');
 PERFORM pg_temp.expect_booking_error(format('DELETE FROM public.reservations WHERE id=%L',result->'reservation'->>'id'),'QUOTATION_BOOKING_LOCKED');
 SELECT count(*) INTO customer_count FROM public.customers WHERE org_id=org;
 payload:=jsonb_set(payload,'{customerPhone}','"+38762222"'::jsonb);
 payload:=jsonb_set(payload,'{passengers,0,full_name}','"Reject transaction passenger"'::jsonb);
 PERFORM pg_temp.expect_booking_error(format('SELECT public.book_quotation_atomic(%L,%L,%L,%L::jsonb,%L)',org,actor,failed_q->>'id',payload,repeat('c',64)),'TEST_PASSENGER_FAILURE');
 IF (SELECT booked FROM public.departures WHERE id=departure)<>2 OR EXISTS(SELECT FROM public.reservations WHERE quotation_id=(failed_q->>'id')::uuid)
    OR (SELECT count(*) FROM public.customers WHERE org_id=org)<>customer_count THEN RAISE EXCEPTION 'Failed passenger left capacity/customer/reservation writes'; END IF;
 payload:=jsonb_set(payload,'{passengers,0,full_name}','"Valid traveler"'::jsonb);
 PERFORM public.book_quotation_atomic(org,actor,(failed_q->>'id')::uuid,payload,repeat('d',64));
 PERFORM pg_temp.expect_booking_error(format('SELECT public.book_quotation_atomic(%L,%L,%L,%L::jsonb,%L)',org,actor,full_q->>'id',payload,repeat('e',64)),'CAPACITY_FULL');
 IF (SELECT booked FROM public.departures WHERE id=departure)<>4 THEN RAISE EXCEPTION 'Capacity cache mismatch'; END IF;
 IF has_function_privilege('authenticated','public.book_quotation_atomic(uuid,uuid,uuid,jsonb,text)','execute')
    OR has_function_privilege('anon','public.quotation_booking_departures(uuid,uuid)','execute') THEN RAISE EXCEPTION 'Booking functions exposed to clients'; END IF;
 RAISE NOTICE 'Quotation booking atomicity PASS';
END; $$;
ROLLBACK;
