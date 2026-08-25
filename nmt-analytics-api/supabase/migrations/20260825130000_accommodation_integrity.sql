-- ============================================================================
-- Phase 12 Step 10B — Accommodation Canonical Identity & Assignment Integrity
-- ============================================================================
-- Live data is clean (0 assignments). Safe to apply strict constraints.
-- ============================================================================

-- 1. Require canonical passenger identity
--    First drop the existing permissive unique, then add the strict one.
ALTER TABLE accommodation_assignments
  DROP CONSTRAINT IF EXISTS accommodation_assignments_room_id_passenger_id_key;

-- Make passenger_id NOT NULL before adding UNIQUE (Postgres needs NOT NULL for uniqueness)
ALTER TABLE accommodation_assignments
  ALTER COLUMN passenger_id SET NOT NULL;

-- Add FK to departure_passengers
ALTER TABLE accommodation_assignments
  ADD CONSTRAINT fk_aa_passenger
    FOREIGN KEY (passenger_id) REFERENCES departure_passengers(id) ON DELETE CASCADE;

-- One passenger = exactly one active accommodation assignment
ALTER TABLE accommodation_assignments
  ADD CONSTRAINT uq_aa_passenger UNIQUE (passenger_id);

-- 2. Index to support efficient assign/move validation
CREATE INDEX IF NOT EXISTS idx_aa_passenger_assign
  ON accommodation_assignments(passenger_id)
  WHERE passenger_id IS NOT NULL;

-- ============================================================================
-- 3. Atomic room-capacity check RPC for manual assignment
--    Verifies: passenger exists, room exists, same departure, same org,
--              passenger not already assigned, room not at capacity.
--    Returns the assignment row on success; throws on failure.
-- ============================================================================
CREATE OR REPLACE FUNCTION assign_passenger_to_room(
  p_passenger_id UUID,
  p_room_id UUID,
  p_org_id UUID,
  p_user_id UUID,
  p_bed_label TEXT DEFAULT NULL
) RETURNS accommodation_assignments AS $$
DECLARE
  v_passenger record;
  v_room record;
  v_building record;
  v_existing UUID;
  v_occupied INT;
  v_assignment accommodation_assignments;
BEGIN
  -- Verify passenger exists and fetch departure_id + name
  SELECT dp.id, dp.departure_id, dp.reservation_id, 
         CONCAT(dp.first_name, ' ', dp.last_name) AS full_name
  INTO v_passenger
  FROM departure_passengers dp
  WHERE dp.id = p_passenger_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Passenger not found (%)', p_passenger_id;
  END IF;

  -- Verify room exists and resolve departure chain
  SELECT r.*, f.building_id
  INTO v_room
  FROM accommodation_rooms r
  JOIN accommodation_floors f ON f.id = r.floor_id
  WHERE r.id = p_room_id
    AND r.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found in this organization (%)', p_room_id;
  END IF;

  -- Fetch building to get departure_id
  SELECT * INTO v_building
  FROM accommodation_buildings
  WHERE id = v_room.building_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building not found';
  END IF;

  -- Cross-departure check
  IF v_passenger.departure_id != v_building.departure_id THEN
    RAISE EXCEPTION 'Cross-departure assignment: passenger departure (%) ≠ building departure (%)',
      v_passenger.departure_id, v_building.departure_id;
  END IF;

  -- Duplicate assignment check
  SELECT id INTO v_existing
  FROM accommodation_assignments
  WHERE passenger_id = p_passenger_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Passenger already assigned to room (%)', v_existing;
  END IF;

  -- Capacity check (count + verify)
  SELECT COUNT(*) INTO v_occupied
  FROM accommodation_assignments
  WHERE room_id = p_room_id;

  IF v_occupied >= v_room.capacity THEN
    RAISE EXCEPTION 'Room at capacity (%/%)', v_occupied, v_room.capacity;
  END IF;

  -- Insert assignment
  INSERT INTO accommodation_assignments (
    org_id, room_id, passenger_id, reservation_id,
    passenger_name, bed_label, assigned_by
  ) VALUES (
    p_org_id, p_room_id, p_passenger_id, v_passenger.reservation_id,
    v_passenger.full_name, p_bed_label, p_user_id
  )
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Atomic passenger MOVE between rooms
--    Unassigns from current room, assigns to destination — in one transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION move_passenger_room(
  p_passenger_id UUID,
  p_dest_room_id UUID,
  p_org_id UUID,
  p_user_id UUID,
  p_bed_label TEXT DEFAULT NULL
) RETURNS accommodation_assignments AS $$
DECLARE
  v_existing_id UUID;
  v_assignment accommodation_assignments;
BEGIN
  -- Find and delete existing assignment (if any)
  DELETE FROM accommodation_assignments
  WHERE passenger_id = p_passenger_id
  RETURNING id INTO v_existing_id;

  -- Now assign to new room (reuses the atomic assign function)
  v_assignment := assign_passenger_to_room(
    p_passenger_id, p_dest_room_id, p_org_id, p_user_id, p_bed_label
  );

  RETURN v_assignment;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
