-- Disposable database regression only. All fixtures and temporary ACL changes
-- roll back. Run after the full migration history, never against production.
BEGIN;

DO $$
DECLARE fn record; client_role text; statement text;
BEGIN
  -- Audit every public SECURITY DEFINER, including future additions. Browser
  -- Supabase access is Auth-only; business data and helpers are API-only.
  FOR fn IN
    SELECT p.*, p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    IF NOT EXISTS (SELECT FROM unnest(COALESCE(fn.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'Unpinned SECURITY DEFINER: %', fn.signature;
    END IF;
    IF EXISTS (SELECT FROM aclexplode(COALESCE(fn.proacl, acldefault('f',fn.proowner))) a
               WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC can execute SECURITY DEFINER: %', fn.signature;
    END IF;
    IF has_function_privilege('anon',fn.oid,'EXECUTE') OR
       has_function_privilege('authenticated',fn.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Client can execute privileged function: %', fn.signature;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.recompute_group_member_count()','EXECUTE') THEN
    RAISE EXCEPTION 'Existing service-role privilege lost';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='public.trip_passenger_group_members'::regclass
      AND tgname='trg_group_member_count' AND tgenabled='O' AND tgtype=13
      AND tgfoid='public.recompute_group_member_count()'::regprocedure) THEN
    -- tgtype 13 = ROW (1) + INSERT (4) + DELETE (8), AFTER.
    RAISE EXCEPTION 'Member-count trigger definition changed';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_proc WHERE oid='public.prevent_supplier_confirmation_event_mutation()'::regprocedure
      AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public']) THEN
    RAISE EXCEPTION 'Supplier append-only guard security configuration changed';
  END IF;

  -- Actual SQL execution must fail with 42501, not merely the trigger-only
  -- runtime error 0A000 (which would hide an erroneously retained EXECUTE ACL).
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH statement IN ARRAY ARRAY[
      'SELECT public.recompute_group_member_count()',
      'SELECT public.get_my_org_id()',
      'SELECT public.get_my_role()',
      'SELECT public.prevent_supplier_confirmation_event_mutation()',
      'SELECT public.guard_reservation_financial_cache()',
      'SELECT public.replace_passenger_group_members(NULL::uuid,NULL::uuid,NULL::uuid[],NULL::uuid)',
      'SELECT public.delete_departure_passenger_safe(NULL::uuid,NULL::uuid)',
      'SELECT public.reserve_capacity_atomic(NULL::uuid,NULL::uuid,1)',
      'SELECT public.release_capacity_atomic(NULL::uuid,NULL::uuid,1)'
    ] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I',client_role);
        EXECUTE statement;
        RAISE EXCEPTION 'Unauthorized call succeeded: % / %',client_role,statement;
      EXCEPTION WHEN insufficient_privilege THEN
        -- The failed subtransaction restores the original role as well.
        NULL;
      END;
      RESET ROLE;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Database function ACL regression PASS';
END $$;

-- Prove trigger invocation does not require caller EXECUTE: temporarily revoke
-- even service_role inside this rollback-only test, then use real group tables.
REVOKE EXECUTE ON FUNCTION public.recompute_group_member_count() FROM service_role;
DO $$
DECLARE
  org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid();
  booking uuid:=gen_random_uuid(); first_pax uuid:=gen_random_uuid(); second_pax uuid:=gen_random_uuid(); third_pax uuid:=gen_random_uuid();
  grp uuid:=gen_random_uuid(); other_grp uuid:=gen_random_uuid();
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(org,'Function security regression',org::text),(other_org,'Other tenant',other_org::text);
  INSERT INTO public.packages(id,org_id,name,destination,base_price) VALUES(product,org,'Security test','Test',100);
  INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity) VALUES(trip,org,product,now(),now()+interval '1 day',10);
  INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount)
    VALUES(booking,org,trip,'Regression buyer',3,now(),300);
  INSERT INTO public.departure_passengers(id,org_id,reservation_id,departure_id,full_name)
    VALUES(first_pax,org,booking,trip,'First'),(second_pax,org,booking,trip,'Second'),(third_pax,org,booking,trip,'Third');
  INSERT INTO public.trip_passenger_groups(id,org_id,departure_id) VALUES(grp,org,trip);
  -- A second tenant gets its own valid departure, not an inconsistent fixture.
  INSERT INTO public.packages(id,org_id,name,destination,base_price) VALUES(other_grp,other_org,'Other package','Test',100);
  INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity) VALUES(other_grp,other_org,other_grp,now(),now()+interval '1 day',10);
  INSERT INTO public.trip_passenger_groups(id,org_id,departure_id) VALUES(other_grp,other_org,other_grp);

  SET LOCAL ROLE service_role;
  IF has_function_privilege(current_user,'public.recompute_group_member_count()','EXECUTE') THEN
    RAISE EXCEPTION 'Trigger regression caller still has direct EXECUTE';
  END IF;
  INSERT INTO public.trip_passenger_group_members(group_id,passenger_id,reservation_id,is_primary)
    VALUES(grp,first_pax,booking,true),(grp,second_pax,booking,false);
  IF (SELECT member_count FROM public.trip_passenger_groups WHERE id=grp) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'INSERT trigger lost count';
  END IF;
  UPDATE public.trip_passenger_groups SET member_count=99 WHERE id=grp;
  DELETE FROM public.trip_passenger_group_members WHERE passenger_id=second_pax;
  IF (SELECT member_count FROM public.trip_passenger_groups WHERE id=grp) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DELETE trigger failed to heal drift';
  END IF;
  PERFORM public.replace_passenger_group_members(org,grp,ARRAY[first_pax,second_pax,third_pax],first_pax);
  IF (SELECT member_count FROM public.trip_passenger_groups WHERE id=grp) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Atomic replacement lost count';
  END IF;
  BEGIN
    PERFORM public.replace_passenger_group_members(other_org,grp,ARRAY[first_pax],first_pax);
    RAISE EXCEPTION 'Cross-tenant replacement succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'GROUP_NOT_FOUND' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.delete_departure_passenger_safe(other_org,first_pax);
    RAISE EXCEPTION 'Cross-tenant removal succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'PASSENGER_NOT_FOUND' THEN RAISE; END IF;
  END;
  UPDATE public.trip_passenger_groups SET locked=true WHERE id=grp;
  BEGIN
    PERFORM public.delete_departure_passenger_safe(org,first_pax);
    RAISE EXCEPTION 'Locked passenger removed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'GROUP_LOCKED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.replace_passenger_group_members(org,grp,ARRAY[first_pax],first_pax);
    RAISE EXCEPTION 'Locked group replaced';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'GROUP_LOCKED' THEN RAISE; END IF;
  END;
  UPDATE public.trip_passenger_groups SET locked=false WHERE id=grp;
  PERFORM public.delete_departure_passenger_safe(org,first_pax);
  IF (SELECT member_count FROM public.trip_passenger_groups WHERE id=grp) IS DISTINCT FROM 2
     OR (SELECT primary_passenger_id FROM public.trip_passenger_groups WHERE id=grp) IS NULL
     OR (SELECT primary_passenger_id FROM public.trip_passenger_groups WHERE id=grp) NOT IN (second_pax,third_pax) THEN
    RAISE EXCEPTION 'Primary removal did not preserve group';
  END IF;
  PERFORM public.delete_departure_passenger_safe(org,second_pax);
  IF (SELECT member_count FROM public.trip_passenger_groups WHERE id=grp) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Cascade delete lost count';
  END IF;
  PERFORM public.delete_departure_passenger_safe(org,third_pax);
  IF EXISTS(SELECT FROM public.trip_passenger_groups WHERE id=grp) OR
     EXISTS(SELECT FROM public.trip_passenger_group_members WHERE group_id=grp) OR
     (SELECT member_count FROM public.trip_passenger_groups WHERE id=other_grp) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Last-member cleanup or tenant isolation failed';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'Passenger group trigger/workflow regression PASS';
END $$;
ROLLBACK;
