-- Disposable replay/acceptance contract. Every fixture and fault trigger rolls back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.organizations(id,name,slug,currency) VALUES
 ('b2b27871-5b1c-47d1-96e3-39ad8c3ee101','Synthetic stock A','synthetic-stock-a','EUR'),
 ('b2b27871-5b1c-47d1-96e3-39ad8c3ee102','Synthetic stock B','synthetic-stock-b','BAM');
CREATE TEMP TABLE stock_contract_context(id integer);
CREATE FUNCTION pg_temp.fail_stock_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.org_id='b2b27871-5b1c-47d1-96e3-39ad8c3ee101'::uuid THEN
  IF TG_TABLE_NAME='hotel_rooms' THEN
   IF current_setting('travline.stock_fault',true)='default_child' AND NEW.room_type='double'
    OR current_setting('travline.stock_fault',true)='room_insert' THEN
    RAISE EXCEPTION 'SYNTHETIC_STOCK_FAULT';
   END IF;
  ELSIF current_setting('travline.stock_fault',true)='hotel_insert' AND TG_OP='INSERT'
   OR current_setting('travline.stock_fault',true)='parent_update' AND TG_OP='UPDATE' THEN
   RAISE EXCEPTION 'SYNTHETIC_STOCK_FAULT';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_test_room_failure BEFORE INSERT ON public.hotel_rooms FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_stock_write();
CREATE TRIGGER stock_test_hotel_failure BEFORE INSERT OR UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_stock_write();
DO $$
DECLARE
 a uuid := 'b2b27871-5b1c-47d1-96e3-39ad8c3ee101';
 b uuid := 'b2b27871-5b1c-47d1-96e3-39ad8c3ee102';
 h jsonb; r jsonb; fault text; quantity integer; hotels_before bigint; rooms_before bigint; invalid jsonb;
BEGIN
 FOREACH quantity IN ARRAY ARRAY[0,1,2,3,10] LOOP
  h := public.create_hotel_inventory(a,jsonb_build_object('name','Synthetic '||quantity,'destination','Synthetic','totalRooms',quantity,'amenities',jsonb_build_array()));
  IF (h->>'org_id')::uuid<>a OR (h->>'total_rooms')::integer<>quantity OR h->'amenities'<>'[]'::jsonb THEN RAISE EXCEPTION 'Hotel round-trip mismatch'; END IF;
  IF (SELECT coalesce(sum(total),0) FROM public.hotel_rooms WHERE hotel_id=(h->>'id')::uuid)<>0
   OR EXISTS(SELECT 1 FROM public.hotel_rooms WHERE hotel_id=(h->>'id')::uuid AND (available<>total OR capacity<1 OR currency<>'EUR'))
   OR (SELECT count(*) FROM public.hotel_rooms WHERE hotel_id=(h->>'id')::uuid)<>(CASE WHEN quantity=0 THEN 0 ELSE 4 END)
   THEN RAISE EXCEPTION 'Default stock exceeds or misrepresents hotel inventory'; END IF;
 END LOOP;
 SELECT count(*) INTO hotels_before FROM public.hotels WHERE org_id=a;
 SELECT count(*) INTO rooms_before FROM public.hotel_rooms WHERE org_id=a;
 FOREACH fault IN ARRAY ARRAY['hotel_insert','default_child'] LOOP
  PERFORM set_config('travline.stock_fault',fault,true);
  BEGIN
   PERFORM public.create_hotel_inventory(a,'{"name":"Must roll back","destination":"Synthetic","totalRooms":10}');
   RAISE EXCEPTION 'Expected dependent failure was not raised';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'SYNTHETIC_STOCK_FAULT' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.hotels WHERE org_id=a)<>hotels_before OR (SELECT count(*) FROM public.hotel_rooms WHERE org_id=a)<>rooms_before THEN RAISE EXCEPTION 'Partial hotel/default stock committed'; END IF;
 END LOOP;
 PERFORM set_config('travline.stock_fault','',true);
 h := public.create_hotel_inventory(a,'{"name":"Custom stock","destination":"Synthetic","totalRooms":0}');
 FOREACH fault IN ARRAY ARRAY['room_insert','parent_update'] LOOP
  PERFORM set_config('travline.stock_fault',fault,true);
  BEGIN
   PERFORM public.create_hotel_room_inventory(a,(h->>'id')::uuid,'{"roomType":"family","capacity":4,"quantity":3,"basePrice":123.45}');
   RAISE EXCEPTION 'Expected room failure was not raised';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'SYNTHETIC_STOCK_FAULT' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.hotel_rooms WHERE hotel_id=(h->>'id')::uuid)
   OR (SELECT total_rooms FROM public.hotels WHERE id=(h->>'id')::uuid)<>0 THEN RAISE EXCEPTION 'Partial room/parent total committed'; END IF;
 END LOOP;
 PERFORM set_config('travline.stock_fault','',true);
 r := public.create_hotel_room_inventory(a,(h->>'id')::uuid,'{"roomType":" family ","capacity":4,"quantity":3,"basePrice":123.45}');
 IF r->>'room_type'<>'family' OR (r->>'capacity')::integer<>4 OR (r->>'total')::integer<>3 OR (r->>'available')::integer<>3 OR r->>'currency'<>'EUR'
  OR (SELECT total_rooms FROM public.hotels WHERE id=(h->>'id')::uuid)<>3 THEN RAISE EXCEPTION 'Custom quantity/capacity/parent metadata mismatch'; END IF;
 BEGIN
  UPDATE public.hotels SET total_rooms=2 WHERE id=(h->>'id')::uuid;
  RAISE EXCEPTION 'Parent metadata silently discarded defined room stock';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.create_hotel_room_inventory(b,(h->>'id')::uuid,'{"roomType":"foreign","capacity":2}');
  RAISE EXCEPTION 'Foreign organization created room stock';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'HOTEL_NOT_FOUND' THEN RAISE; END IF;
 END;
 FOR invalid IN SELECT value FROM jsonb_array_elements('[
  {"capacity":0,"price":0,"available":1,"total":1},
  {"capacity":2,"price":-1,"available":1,"total":1},
  {"capacity":2,"price":0,"available":-1,"total":1},
  {"capacity":2,"price":0,"available":2,"total":1},
  {"capacity":2,"price":0,"available":0,"total":-1}
 ]'::jsonb) LOOP
  BEGIN
   INSERT INTO public.hotel_rooms(org_id,hotel_id,room_type,capacity,base_price,available,total)
   VALUES(a,(h->>'id')::uuid,'invalid',(invalid->>'capacity')::integer,(invalid->>'price')::numeric,(invalid->>'available')::integer,(invalid->>'total')::integer);
   RAISE EXCEPTION 'New invalid stock passed NOT VALID guard';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;

 IF has_function_privilege('anon','public.create_hotel_inventory(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.create_hotel_inventory(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.create_hotel_room_inventory(uuid,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','public.create_hotel_room_inventory(uuid,uuid,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.create_hotel_inventory(uuid,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.create_hotel_room_inventory(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Hotel inventory RPC ACL mismatch'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conname IN('hotel_rooms_stock_integrity','hotel_rooms_type_nonempty','hotels_total_rooms_nonnegative') AND NOT convalidated)<>3 THEN RAISE EXCEPTION 'Legacy inventory was implicitly validated'; END IF;
END $$;
ROLLBACK;
