-- Fix invalid DEFAULT on trip_passenger_groups.accommodation_preference.
-- The original migration (20260822020000_passenger_groups.sql) set the column
-- DEFAULT to 'prefer_together', which is NOT a member of the column's own CHECK
-- constraint (allowed: same_room, adjacent_rooms, same_floor, nearby, no_preference).
-- Any INSERT that omitted accommodation_preference therefore hit CHECK violation
-- 23514 and failed with a 500. Realign the default to a valid value.

ALTER TABLE public.trip_passenger_groups
  ALTER COLUMN accommodation_preference SET DEFAULT 'no_preference';
