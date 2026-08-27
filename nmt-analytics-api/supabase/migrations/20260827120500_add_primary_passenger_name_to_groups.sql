-- Add the denormalized primary_passenger_name column that application code
-- already reads and writes but which was never created in the schema.
--   * reservations.ts (auto-group-on-sale) INSERTs primary_passenger_name
--   * departures.ts (manifest/groups enrichment) SELECTs primary_passenger_name
-- Without the column both paths hit undefined-column 42703: the auto-group was
-- silently skipped on sale, and the Grupe enrichment fell back to empty. Add the
-- column and backfill it from each group's primary member.

ALTER TABLE public.trip_passenger_groups
  ADD COLUMN IF NOT EXISTS primary_passenger_name TEXT;

UPDATE public.trip_passenger_groups g
SET primary_passenger_name = dp.full_name
FROM public.trip_passenger_group_members m
JOIN public.departure_passengers dp ON dp.id = m.passenger_id
WHERE m.group_id = g.id
  AND m.is_primary = true
  AND g.primary_passenger_name IS NULL;
