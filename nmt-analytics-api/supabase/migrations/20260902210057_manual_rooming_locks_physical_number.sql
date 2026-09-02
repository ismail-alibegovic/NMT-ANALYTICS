ALTER TABLE public.departure_room_slot_assignments
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.departure_room_slot_assignments.is_manual
IS 'Marks assignments created through the manual rooming workspace; future automatic proposals may use false.';

COMMENT ON COLUMN public.departure_room_slot_assignments.locked
IS 'Prevents manual move/unassign changes until explicitly unlocked by a manager.';
