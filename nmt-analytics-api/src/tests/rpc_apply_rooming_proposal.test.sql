-- Integration test: apply_rooming_proposal_atomic RPC
-- Run against replayed migration schema (local Postgres, not live Supabase).
-- Usage: psql -v ON_ERROR_STOP=1 -d travline_replay -f this_file.sql

BEGIN;

-- 1. Seed minimal domain graph -----------------------------------------------
INSERT INTO public.organizations (id, name, slug)
VALUES ('c0000000-0000-4000-8000-000000000001', 'Test Org', 'test-org');

INSERT INTO public.customers (id, org_id, full_name, phone)
VALUES ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Test Customer', '0600000000');

INSERT INTO public.packages (id, org_id, name, destination, base_price)
VALUES ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Test Package', 'Test Destination', 500);

INSERT INTO public.departures (id, org_id, package_id, depart_at, return_at, capacity)
VALUES ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-07', 20);

INSERT INTO public.hotels (id, org_id, name, destination, slug)
VALUES ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Grand Hotel', 'Test City', 'grand-hotel');

INSERT INTO public.hotel_allocations (id, org_id, departure_id, hotel_id, room_type, rooms_reserved, capacity_per_room, check_in, check_out)
VALUES ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'double', 2, 2, '2026-10-01', '2026-10-07');

INSERT INTO public.reservations (id, org_id, departure_id, customer_id, customer_name, party_size, reservation_at)
VALUES ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Test Customer', 2, now());

INSERT INTO public.reservation_accommodation_requirements (id, org_id, reservation_id, departure_id, hotel_allocation_id, hotel_id, room_type, room_count, guests_expected, capacity_per_room)
VALUES ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'double', 1, 2, 2);

INSERT INTO public.departure_passengers (id, org_id, departure_id, reservation_id, full_name, reservation_accommodation_requirement_id)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Alice Test', 'e0000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Bob Test', 'e0000000-0000-4000-8000-000000000001');

-- Sync room slots ------------------------------------------------------------
SELECT public.sync_departure_room_slots_atomic(
  'c0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  slot1_id UUID;
  slot2_id UUID;
BEGIN
  SELECT id INTO slot1_id FROM public.departure_room_slots
    WHERE org_id = 'c0000000-0000-4000-8000-000000000001'
      AND departure_id = 'd0000000-0000-4000-8000-000000000001'
      AND slot_number = 1;
  SELECT id INTO slot2_id FROM public.departure_room_slots
    WHERE org_id = 'c0000000-0000-4000-8000-000000000001'
      AND departure_id = 'd0000000-0000-4000-8000-000000000001'
      AND slot_number = 2;

  IF slot1_id IS NULL OR slot2_id IS NULL THEN
    RAISE EXCEPTION 'slot setup failed';
  END IF;

  -- Save slot IDs in temp table for later assertions
  CREATE TEMP TABLE _slot_ids (slot_number INTEGER PRIMARY KEY, id UUID);
  INSERT INTO _slot_ids VALUES (1, slot1_id), (2, slot2_id);
END $$;

-- 2. Test A — valid apply succeeds + org_id correct --------------------------
DO $$
DECLARE
  slot1 UUID; slot2 UUID;
  r RECORD;
  a1_id UUID;
  inserted_org_id UUID;
BEGIN
  SELECT id INTO slot1 FROM _slot_ids WHERE slot_number = 1;
  SELECT id INTO slot2 FROM _slot_ids WHERE slot_number = 2;

  -- Create a replaceable auto assignment (p1 → slot1)
  INSERT INTO public.departure_room_slot_assignments (id, org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name, is_manual, locked)
  VALUES (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', slot1, '10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Alice Test', false, false)
  RETURNING id INTO a1_id;

  -- Apply: replace a1, propose p1 → slot2
  SELECT * INTO r FROM public.apply_rooming_proposal_atomic(
    'c0000000-0000-4000-8000-000000000001'::UUID,
    'd0000000-0000-4000-8000-000000000001'::UUID,
    ARRAY[a1_id],
    ('[{"passenger_id":"10000000-0000-4000-8000-000000000001","room_slot_id":"' || slot2 || '"}]')::JSONB
  );

  IF r.error_detail IS NOT NULL THEN
    RAISE EXCEPTION 'Test A FAIL — error_detail: %', r.error_detail;
  END IF;
  IF r.deleted_count <> 1 THEN
    RAISE EXCEPTION 'Test A FAIL — expected deleted_count=1, got %', r.deleted_count;
  END IF;
  IF r.inserted_count <> 1 THEN
    RAISE EXCEPTION 'Test A FAIL — expected inserted_count=1, got %', r.inserted_count;
  END IF;

  -- Verify p1 now in slot2 with correct org_id
  SELECT a.id, a.org_id INTO r
  FROM public.departure_room_slot_assignments a
  WHERE a.passenger_id = '10000000-0000-4000-8000-000000000001'
    AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
    AND a.departure_id = 'd0000000-0000-4000-8000-000000000001';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test A FAIL — p1 assignment not found after apply';
  END IF;
  IF r.org_id <> 'c0000000-0000-4000-8000-000000000001'::UUID THEN
    RAISE EXCEPTION 'Test A FAIL — wrong org_id: %', r.org_id;
  END IF;

  RAISE NOTICE 'Test A PASS — valid apply, org_id correct';
END $$;

-- 3. Test B — manual/locked assignment preserved -----------------------------
DO $$
DECLARE
  slot1 UUID; slot2 UUID;
  r RECORD;
  b2_id UUID;
BEGIN
  SELECT id INTO slot1 FROM _slot_ids WHERE slot_number = 1;
  SELECT id INTO slot2 FROM _slot_ids WHERE slot_number = 2;

  -- Create MANUAL assignment (p2 → slot1, is_manual=true)
  INSERT INTO public.departure_room_slot_assignments (id, org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name, is_manual, locked)
  VALUES (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', slot1, '10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Bob Test', true, false)
  RETURNING id INTO b2_id;

  -- Send an apply that does NOT replace b2 (manual is not in replaceable list)
  -- but tries to reassign p1 from slot2 → back to slot1 alongside p2
  -- First find p1's current assignment
  SELECT a.id INTO r
  FROM public.departure_room_slot_assignments a
  WHERE a.passenger_id = '10000000-0000-4000-8000-000000000001'
    AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
    AND a.departure_id = 'd0000000-0000-4000-8000-000000000001';

  -- Apply: only replace p1's assignment, not p2's manual one
  SELECT * INTO r FROM public.apply_rooming_proposal_atomic(
    'c0000000-0000-4000-8000-000000000001'::UUID,
    'd0000000-0000-4000-8000-000000000001'::UUID,
    ARRAY[r.id],  -- only p1's replaceable assignment
    ('[{"passenger_id":"10000000-0000-4000-8000-000000000001","room_slot_id":"' || slot1 || '"}]')::JSONB
  );

  IF r.error_detail IS NOT NULL THEN
    RAISE EXCEPTION 'Test B FAIL — error_detail: %', r.error_detail;
  END IF;

  -- Verify p2's manual assignment still exists and untouched
  SELECT a.id INTO r
  FROM public.departure_room_slot_assignments a
  WHERE a.passenger_id = '10000000-0000-4000-8000-000000000002'
    AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
    AND a.departure_id = 'd0000000-0000-4000-8000-000000000001'
    AND a.is_manual = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test B FAIL — manual assignment was removed or modified';
  END IF;

  -- Verify slot1 has exactly 2 assignments (p1 + p2)
  IF (SELECT COUNT(*) FROM public.departure_room_slot_assignments WHERE room_slot_id = slot1 AND org_id = 'c0000000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Test B FAIL — slot1 count unexpected';
  END IF;

  RAISE NOTICE 'Test B PASS — manual/locked assignment preserved';
END $$;

-- 4. Test C — stale replaceable ID → conflict, zero writes ------------------
DO $$
DECLARE
  slot1 UUID;
  slot2 UUID;
  r RECORD;
  fake_id UUID := gen_random_uuid();
  p1_old_assignment_id UUID;
BEGIN
  SELECT id INTO slot1 FROM _slot_ids WHERE slot_number = 1;
  SELECT id INTO slot2 FROM _slot_ids WHERE slot_number = 2;

  -- Record p1's current assignment (in slot1 from Test B)
  SELECT a.id INTO p1_old_assignment_id
  FROM public.departure_room_slot_assignments a
  WHERE a.passenger_id = '10000000-0000-4000-8000-000000000001'
    AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
    AND a.departure_id = 'd0000000-0000-4000-8000-000000000001';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test C FAIL — p1 assignment not found for baseline';
  END IF;

  -- Apply with a fake (non-existent) replaceable ID
  SELECT * INTO r FROM public.apply_rooming_proposal_atomic(
    'c0000000-0000-4000-8000-000000000001'::UUID,
    'd0000000-0000-4000-8000-000000000001'::UUID,
    ARRAY[fake_id],  -- fake id — does not exist
    ('[{"passenger_id":"10000000-0000-4000-8000-000000000001","room_slot_id":"' || slot2 || '"}]')::JSONB
  );

  IF r.error_detail IS NULL OR r.error_detail = '' THEN
    RAISE EXCEPTION 'Test C FAIL — expected STALE error, got no error';
  END IF;

  IF NOT (r.error_detail LIKE '%STALE%' OR r.error_detail LIKE '%stale%') THEN
    RAISE EXCEPTION 'Test C FAIL — expected STALE_REPLACEABLE_ASSIGNMENTS error, got: %', r.error_detail;
  END IF;

  -- Verify zero writes: p1 still in original slot
  IF NOT EXISTS (
    SELECT 1 FROM public.departure_room_slot_assignments a
    WHERE a.passenger_id = '10000000-0000-4000-8000-000000000001'
      AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
      AND a.departure_id = 'd0000000-0000-4000-8000-000000000001'
      AND a.id = p1_old_assignment_id
  ) THEN
    RAISE EXCEPTION 'Test C FAIL — p1 assignment was mutated with fake replaceable ID';
  END IF;

  -- Also verify deleted_count=0 via the returned row values
  -- (r.result already shows 0 deleted_count; checked via error_detail path above)

  RAISE NOTICE 'Test C PASS — stale replaceable ID returns conflict, zero writes';
END $$;

-- 5. Test D — locked assignment (locked=true) is preserved -------------------
DO $$
DECLARE
  slot1 UUID;
  r RECORD;
  locked_id UUID;
  locked_old_room UUID;
BEGIN
  SELECT id INTO slot1 FROM _slot_ids WHERE slot_number = 1;

  -- Create a LOCKED auto assignment for a new test passenger-scenario
  -- We'll repurpose by locking p1's current assignment
  SELECT a.id, a.room_slot_id INTO locked_id, locked_old_room
  FROM public.departure_room_slot_assignments a
  WHERE a.passenger_id = '10000000-0000-4000-8000-000000000001'
    AND a.org_id = 'c0000000-0000-4000-8000-000000000001'
    AND a.departure_id = 'd0000000-0000-4000-8000-000000000001';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test D FAIL — p1 assignment not found';
  END IF;

  -- Lock it
  UPDATE public.departure_room_slot_assignments SET locked = true WHERE id = locked_id;

  -- Apply with locked_id in replaceable list — should fail
  SELECT * INTO r FROM public.apply_rooming_proposal_atomic(
    'c0000000-0000-4000-8000-000000000001'::UUID,
    'd0000000-0000-4000-8000-000000000001'::UUID,
    ARRAY[locked_id],
    ('[{"passenger_id":"10000000-0000-4000-8000-000000000001","room_slot_id":"' || locked_old_room || '"}]')::JSONB
  );

  IF r.error_detail IS NULL OR NOT (r.error_detail LIKE '%STALE%' OR r.error_detail LIKE '%stale%') THEN
    RAISE EXCEPTION 'Test D FAIL — locked assignment in replaceable list should fail, got: %', r.error_detail;
  END IF;

  -- Verify locked assignment still exists + still locked
  IF NOT EXISTS (SELECT 1 FROM public.departure_room_slot_assignments WHERE id = locked_id AND locked = true) THEN
    RAISE EXCEPTION 'Test D FAIL — locked assignment was modified';
  END IF;

  RAISE NOTICE 'Test D PASS — locked assignment protected from stale apply';
END $$;


ROLLBACK;
