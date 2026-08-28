-- Cleanup stale policy names that can be introduced only during fresh replay of reconstructed
-- historical migrations. Production already has these policies absent, so this is a no-op there.

DROP POLICY IF EXISTS "trip_passenger_groups org isolation" ON public.trip_passenger_groups;
DROP POLICY IF EXISTS "acc_buildings org isolation" ON public.accommodation_buildings;
DROP POLICY IF EXISTS "acc_floors org isolation" ON public.accommodation_floors;
DROP POLICY IF EXISTS "acc_rooms org isolation" ON public.accommodation_rooms;
DROP POLICY IF EXISTS "acc_assignments org isolation" ON public.accommodation_assignments;
