-- Disposable replay/acceptance contract for atomic allotment editing and bus vehicle integrity.
-- Every fixture rolls back. Never run against production.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  org_a UUID := 'c3c37871-5b1c-47d1-96e3-39ad8c3ee201';
  org_b UUID := 'c3c37871-5b1c-47d1-96e3-39ad8c3ee202';
  pkg_a UUID := gen_random_uuid();
  dep_a UUID := gen_random_uuid();
  hotel_a UUID := gen_random_uuid();
  alloc_a UUID := gen_random_uuid();
  res_active UUID := gen_random_uuid();
  res_cancelled UUID := gen_random_uuid();
  pax_a UUID := gen_random_uuid();
  slot3_id UUID;
  updated_alloc JSONB;
  veh_res JSONB;
BEGIN
  INSERT INTO public.organizations(id, name, slug, currency) VALUES
    (org_a, 'Synthetic Alloc Org A', 'synthetic-alloc-a', 'EUR'),
    (org_b, 'Synthetic Alloc Org B', 'synthetic-alloc-b', 'BAM');

  INSERT INTO public.packages(id, org_id, name, destination, base_price, transport_type)
  VALUES (pkg_a, org_a, 'Synthetic Bus Package', 'Sarajevo', 200, 'bus');

  INSERT INTO public.departures(id, org_id, package_id, depart_at, return_at, capacity, status, transport_type)
  VALUES (dep_a, org_a, pkg_a, '2042-07-01T08:00:00Z', '2042-07-05T18:00:00Z', 4, 'active', 'bus');

  INSERT INTO public.hotels(id, org_id, name, destination, total_rooms)
  VALUES (hotel_a, org_a, 'Synthetic Hotel A', 'Sarajevo', 10);

  INSERT INTO public.hotel_allocations(
    id, org_id, departure_id, hotel_id, room_type, room_label,
    rooms_reserved, template_rooms, capacity_per_room, check_in, check_out,
    price_per_night, net_price, sell_price
  ) VALUES (
    alloc_a, org_a, dep_a, hotel_a, 'double', 'Double',
    3, 3, 2, '2042-07-01', '2042-07-05', 80, 80, 110
  );

  -- Initial slot sync creates 3 slots.
  PERFORM public.sync_departure_room_slots_atomic(org_a, dep_a, alloc_a);
  IF (SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = alloc_a) <> 3 THEN
    RAISE EXCEPTION 'Expected 3 initial room slots';
  END IF;

  -- Active reservation (1 room) and cancelled reservation (5 rooms, must be ignored).
  INSERT INTO public.reservations(id, org_id, departure_id, customer_name, party_size, reservation_at, total_amount, status)
  VALUES
    (res_active, org_a, dep_a, 'Active Guest', 1, now(), 200, 'confirmed'),
    (res_cancelled, org_a, dep_a, 'Cancelled Guest', 1, now(), 200, 'cancelled');

  INSERT INTO public.reservation_accommodation_requirements(
    org_id, reservation_id, departure_id, hotel_allocation_id, hotel_id,
    room_type, room_label, room_count, guests_expected, capacity_per_room
  ) VALUES
    (org_a, res_active, dep_a, alloc_a, hotel_a, 'double', 'Double', 1, 1, 2),
    (org_a, res_cancelled, dep_a, alloc_a, hotel_a, 'double', 'Double', 5, 2, 2);

  INSERT INTO public.departure_passengers(id, org_id, reservation_id, departure_id, full_name)
  VALUES (pax_a, org_a, res_active, dep_a, 'Slot Three Guest');

  SELECT id INTO slot3_id
    FROM public.departure_room_slots
   WHERE hotel_allocation_id = alloc_a AND slot_number = 3;

  INSERT INTO public.departure_room_slot_assignments(
    org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name
  ) VALUES (
    org_a, dep_a, slot3_id, pax_a, res_active, 'Slot Three Guest'
  );

  -- 1) Reducing from 3 -> 1 must fail with ROOM_SLOT_OCCUPIED AND roll back rooms_reserved to 3.
  BEGIN
    PERFORM public.update_departure_accommodation_allotment_atomic(org_a, dep_a, alloc_a, 1);
    RAISE EXCEPTION 'Expected ROOM_SLOT_OCCUPIED was not raised';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ROOM_SLOT_OCCUPIED%' THEN RAISE; END IF;
  END;
  IF (SELECT rooms_reserved FROM public.hotel_allocations WHERE id = alloc_a) <> 3
     OR (SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = alloc_a) <> 3 THEN
    RAISE EXCEPTION 'Allotment rollback failed after ROOM_SLOT_OCCUPIED';
  END IF;

  -- Remove slot 3 assignment, then test ALLOTMENT_BELOW_RESERVED (0 < 1 active sold room).
  DELETE FROM public.departure_room_slot_assignments WHERE room_slot_id = slot3_id;
  BEGIN
    PERFORM public.update_departure_accommodation_allotment_atomic(org_a, dep_a, alloc_a, 0);
    RAISE EXCEPTION 'Expected ALLOTMENT_BELOW_RESERVED was not raised';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ALLOTMENT_BELOW_RESERVED%' THEN RAISE; END IF;
  END;
  IF (SELECT rooms_reserved FROM public.hotel_allocations WHERE id = alloc_a) <> 3 THEN
    RAISE EXCEPTION 'Allotment mutated despite ALLOTMENT_BELOW_RESERVED';
  END IF;

  -- 2) Valid reduction 3 -> 1 (cancelled reservation of 5 rooms ignored) and increase 1 -> 4.
  updated_alloc := public.update_departure_accommodation_allotment_atomic(org_a, dep_a, alloc_a, 1);
  IF (updated_alloc->>'rooms_reserved')::INTEGER <> 1
     OR (updated_alloc->>'sold_rooms')::INTEGER <> 1
     OR (SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = alloc_a) <> 1 THEN
    RAISE EXCEPTION 'Valid allotment shrink failed';
  END IF;

  updated_alloc := public.update_departure_accommodation_allotment_atomic(org_a, dep_a, alloc_a, 4);
  IF (updated_alloc->>'rooms_reserved')::INTEGER <> 4
     OR (SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = alloc_a) <> 4 THEN
    RAISE EXCEPTION 'Valid allotment expansion failed';
  END IF;

  -- 3) Cross-tenant and invalid room count denials.
  BEGIN
    PERFORM public.update_departure_accommodation_allotment_atomic(org_b, dep_a, alloc_a, 2);
    RAISE EXCEPTION 'Cross-tenant allotment update succeeded';
  EXCEPTION WHEN no_data_found THEN
    IF SQLERRM <> 'ALLOTMENT_NOT_FOUND' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.update_departure_accommodation_allotment_atomic(org_a, dep_a, alloc_a, 1001);
    RAISE EXCEPTION 'Over-bound allotment update succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'INVALID_ALLOTMENT_ROOM_COUNT' THEN RAISE; END IF;
  END;

  -- 4) Vehicle create -> edit -> clear registration -> omit registration -> shrink seats.
  veh_res := public.update_vehicle_atomic(org_a, dep_a, '  Sprinter One  ', ' A12-K-345 ', 6, 'standard_2_plus_2');
  IF veh_res->'vehicle'->>'vehicle_label' <> 'Sprinter One'
     OR veh_res->'vehicle'->>'registration_number' <> 'A12-K-345'
     OR jsonb_array_length(veh_res->'seats') <> 6 THEN
    RAISE EXCEPTION 'Vehicle create failed';
  END IF;

  -- Passing NULL for registration preserves existing plate.
  veh_res := public.update_vehicle_atomic(org_a, dep_a, 'Sprinter Renamed', NULL, 6, NULL);
  IF veh_res->'vehicle'->>'registration_number' <> 'A12-K-345' THEN
    RAISE EXCEPTION 'Omitted registration unexpectedly cleared';
  END IF;

  -- Passing empty string clears registration_number to NULL.
  veh_res := public.update_vehicle_atomic(org_a, dep_a, NULL, '', 4, NULL);
  IF (veh_res->'vehicle'->>'registration_number') IS NOT NULL
     OR (veh_res->'vehicle'->>'capacity')::INTEGER <> 4
     OR jsonb_array_length(veh_res->'seats') <> 4 THEN
    RAISE EXCEPTION 'Vehicle registration clear or capacity shrink failed';
  END IF;

  -- Blank label must be rejected.
  BEGIN
    PERFORM public.update_vehicle_atomic(org_a, dep_a, '   ', NULL, 4, NULL);
    RAISE EXCEPTION 'Blank vehicle label accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'INVALID_VEHICLE_INPUT' THEN RAISE; END IF;
  END;

  -- Cross-tenant vehicle update denied.
  BEGIN
    PERFORM public.update_vehicle_atomic(org_b, dep_a, 'Foreign', NULL, 4, NULL);
    RAISE EXCEPTION 'Cross-tenant vehicle update succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DEPARTURE_NOT_FOUND' THEN RAISE; END IF;
  END;

  -- 5) Privileged ACL checks.
  IF has_function_privilege('anon', 'public.update_departure_accommodation_allotment_atomic(uuid,uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_departure_accommodation_allotment_atomic(uuid,uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.update_departure_accommodation_allotment_atomic(uuid,uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_vehicle_atomic(uuid,uuid,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_vehicle_atomic(uuid,uuid,text,text,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.update_vehicle_atomic(uuid,uuid,text,text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Allotment/vehicle RPC ACL mismatch';
  END IF;

  RAISE NOTICE 'Allocation and vehicle integrity contract PASS';
END $$;

ROLLBACK;
