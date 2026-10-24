-- Disposable database only. Live-resource release retains traveler/commercial
-- history, respects manager locks, and rolls back with the reservation mutation.
BEGIN;
CREATE FUNCTION pg_temp.expect_cancel_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)>0 THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Expected cancellation rejection: %',expected;
END $$;
CREATE FUNCTION pg_temp.fail_cancel_after_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('travline.test_cancel_failure',true)='on' THEN RAISE EXCEPTION 'TEST_CANCEL_AFTER_RELEASE'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER zz_test_cancel_rollback AFTER UPDATE OF status ON public.reservations FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_cancel_after_release();
DO $$
DECLARE org uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid(); booking uuid:=gen_random_uuid(); pax uuid:=gen_random_uuid(); second uuid:=gen_random_uuid();
 hotel uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid(); slot uuid:=gen_random_uuid(); next_booking uuid:=gen_random_uuid(); next_pax uuid:=gen_random_uuid();
 before_requirements jsonb; before_passengers jsonb; before_rooms jsonb;
BEGIN
 INSERT INTO public.organizations(id,name,slug) VALUES(org,'Cancellation contract',org::text);
 INSERT INTO public.packages(id,org_id,name,destination,base_price,currency,transport_type) VALUES(product,org,'Synthetic bus','Synthetic',100,'EUR','bus');
 INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,booked,transport_type) VALUES(trip,org,product,now(),now()+interval '1 day',8,2,'bus');
 INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount,currency) VALUES(booking,org,trip,'Synthetic buyer',2,now(),200,'EUR');
 INSERT INTO public.departure_passengers(id,org_id,reservation_id,departure_id,full_name) VALUES(pax,org,booking,trip,'First traveler'),(second,org,booking,trip,'Second traveler');
 INSERT INTO public.hotels(id,org_id,name,destination,slug) VALUES(hotel,org,'Synthetic','Synthetic',hotel::text);
 INSERT INTO public.hotel_allocations(id,org_id,departure_id,hotel_id,room_type,rooms_reserved,capacity_per_room,check_in,check_out)
 VALUES(allocation,org,trip,hotel,'double',2,2,current_date,current_date+1);
 PERFORM public.edit_reservation_atomic(org,booking,'{}',jsonb_build_array(jsonb_build_object('hotel_allocation_id',allocation,'room_count',1,'guests_expected',2,'passenger_ids',jsonb_build_array(pax,second))));
 DROP TABLE pg_temp.tmp_reservation_accommodation_requirements;
 INSERT INTO public.departure_room_slots(id,org_id,departure_id,hotel_allocation_id,hotel_id,room_type,slot_number,display_label,capacity)
 VALUES(slot,org,trip,allocation,hotel,'double',1,'Synthetic double',2);
 INSERT INTO public.departure_room_slot_assignments(org_id,departure_id,room_slot_id,passenger_id,reservation_id,passenger_name)
 VALUES(org,trip,slot,pax,booking,'First traveler'),(org,trip,slot,second,booking,'Second traveler');
 PERFORM public.update_vehicle_atomic(org,trip,'Synthetic bus',NULL,8,'standard_2_plus_2');
 PERFORM public.manual_seat_assign(org,pax,1);
 UPDATE public.departure_passengers SET seat_locked=true WHERE id=pax;
 PERFORM pg_temp.expect_cancel_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"status":"cancelled"}'),'RESERVATION_OPERATIONAL_ASSIGNMENTS_LOCKED');
 IF (SELECT booked FROM public.departures WHERE id=trip)<>2 OR (SELECT status FROM public.reservations WHERE id=booking)='cancelled' THEN RAISE EXCEPTION 'Seat lock refusal leaked changes'; END IF;
 UPDATE public.departure_passengers SET seat_locked=false WHERE id=pax;
 UPDATE public.departure_room_slot_assignments SET locked=true WHERE passenger_id=pax;
 PERFORM pg_temp.expect_cancel_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"status":"cancelled"}'),'RESERVATION_OPERATIONAL_ASSIGNMENTS_LOCKED');
 UPDATE public.departure_room_slot_assignments SET locked=false WHERE passenger_id=pax;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_requirements FROM public.reservation_accommodation_requirements r WHERE reservation_id=booking;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO before_passengers FROM public.departure_passengers p WHERE reservation_id=booking;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY id) INTO before_rooms FROM public.departure_room_slot_assignments a WHERE reservation_id=booking;
 PERFORM set_config('travline.test_cancel_failure','on',true);
 PERFORM pg_temp.expect_cancel_error(format('SELECT public.update_reservation_core_atomic(%L,%L,%L::jsonb)',org,booking,'{"status":"cancelled"}'),'TEST_CANCEL_AFTER_RELEASE');
 IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.departure_passengers p WHERE reservation_id=booking) IS DISTINCT FROM before_passengers
 OR (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.departure_room_slot_assignments a WHERE reservation_id=booking) IS DISTINCT FROM before_rooms
 OR EXISTS(SELECT FROM public.audit_logs WHERE org_id=org AND action='cancel_resource_release')
 THEN RAISE EXCEPTION 'Failed cancellation leaked resource/audit changes'; END IF;
 PERFORM set_config('travline.test_cancel_failure','off',true);
 PERFORM public.update_reservation_core_atomic(org,booking,'{"status":"cancelled"}');
 IF (SELECT booked FROM public.departures WHERE id=trip)<>0
 OR EXISTS(SELECT FROM public.departure_passengers WHERE reservation_id=booking AND (seat_number IS NOT NULL OR seat_locked OR seat_is_manual))
 OR EXISTS(SELECT FROM public.departure_room_slot_assignments WHERE reservation_id=booking)
 OR (SELECT count(*) FROM public.departure_passengers WHERE reservation_id=booking)<>2
 OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reservation_accommodation_requirements r WHERE reservation_id=booking) IS DISTINCT FROM before_requirements
 OR (SELECT count(*) FROM public.audit_logs WHERE org_id=org AND action='cancel_resource_release' AND details->'metadata'->>'reason'='reservation_cancelled')<>1
 THEN RAISE EXCEPTION 'Cancellation resource/history/audit contract failed'; END IF;
 PERFORM pg_temp.expect_cancel_error(format('SELECT public.manual_seat_assign(%L,%L,1)',org,pax),'RESERVATION_CANCELLED');
 PERFORM pg_temp.expect_cancel_error(format('INSERT INTO public.departure_room_slot_assignments(org_id,departure_id,room_slot_id,passenger_id,reservation_id,passenger_name) VALUES(%L,%L,%L,%L,%L,%L)',org,trip,slot,pax,booking,'Cancelled traveler'),'RESERVATION_CANCELLED');
 -- Another active traveler can take the released seat and room. Reactivation
 -- retains history but never steals/reinstates those physical assignments.
 INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount,currency) VALUES(next_booking,org,trip,'Next buyer',1,now(),100,'EUR');
 INSERT INTO public.departure_passengers(id,org_id,reservation_id,departure_id,full_name) VALUES(next_pax,org,next_booking,trip,'Next traveler');
 UPDATE public.departures SET booked=1 WHERE id=trip;
 PERFORM public.edit_reservation_atomic(org,next_booking,'{}',jsonb_build_array(jsonb_build_object('hotel_allocation_id',allocation,'room_count',1,'guests_expected',1,'passenger_ids',jsonb_build_array(next_pax))));
 DROP TABLE pg_temp.tmp_reservation_accommodation_requirements;
 PERFORM public.manual_seat_assign(org,next_pax,1);
 INSERT INTO public.departure_room_slot_assignments(org_id,departure_id,room_slot_id,passenger_id,reservation_id,passenger_name) VALUES(org,trip,slot,next_pax,next_booking,'Next traveler');
 PERFORM public.update_reservation_core_atomic(org,booking,'{"status":"confirmed"}');
 IF (SELECT seat_number FROM public.departure_passengers WHERE id=next_pax)<>1
 OR EXISTS(SELECT FROM public.departure_passengers WHERE reservation_id=booking AND seat_number IS NOT NULL)
 OR EXISTS(SELECT FROM public.departure_room_slot_assignments WHERE reservation_id=booking)
 THEN RAISE EXCEPTION 'Reactivation stole or restored released assignments'; END IF;
 RAISE NOTICE 'PASS cancellation releases unlocked seats/rooms, protects locks, rejects inactive assignments, preserves history, audits and rolls back failures';
END $$;
ROLLBACK;
