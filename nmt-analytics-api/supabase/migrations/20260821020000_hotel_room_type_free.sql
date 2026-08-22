-- 20260821020000_hotel_room_type_free.sql
-- Remove rigid room_type check and add optional bed configuration
-- Allows free-form accommodation names e.g. 2-bed, 3-bed, twin

ALTER TABLE hotel_rooms DROP CONSTRAINT IF EXISTS hotel_rooms_room_type_check;

ALTER TABLE hotel_rooms
  ALTER COLUMN room_type TYPE TEXT,
  ADD COLUMN IF NOT EXISTS bed_config JSONB,
  ADD COLUMN IF NOT EXISTS beds_count INT;

COMMENT ON COLUMN hotel_rooms.bed_config IS 'Optional JSON describing bed composition e.g. {"king":1} or {"single":2}';
COMMENT ON COLUMN hotel_rooms.beds_count IS 'Total number of beds in this accommodation type';

-- Ensure existing data remains valid
UPDATE hotel_rooms SET beds_count = COALESCE(capacity, 1) WHERE beds_count IS NULL;
