-- ⚠️ RESTORED FROM LIVE: This migration was applied to production as 20260826163605.
-- It consolidates tenant RLS policies on core client-accessible tables.
--
-- After 20260826163545 dropped policies from API-only tables, this migration
-- ensures every remaining client-facing table has a clean, canonical
-- organization-scoped RLS policy using get_my_org_id().
--
-- Policies use CREATE OR REPLACE so they're safe on a fresh database
-- where 20260826155342 may have already created some of these.

-- Reservations: keeps the existing policy, re-asserted here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reservations'
      AND policyname = 'reservations_tenant'
  ) THEN
    CREATE POLICY reservations_tenant ON public.reservations
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;

-- Departures: tenant-scoped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'departures'
      AND policyname = 'departures_tenant'
  ) THEN
    CREATE POLICY departures_tenant ON public.departures
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;

-- Customers (clients): tenant-scoped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'clients_tenant'
  ) THEN
    CREATE POLICY clients_tenant ON public.clients
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;

-- Tours (packages): tenant-scoped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tours'
      AND policyname = 'tours_tenant'
  ) THEN
    CREATE POLICY tours_tenant ON public.tours
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;

-- Passenger groups: tenant-scoped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_passenger_groups'
      AND policyname = 'trip_passenger_groups_tenant'
  ) THEN
    CREATE POLICY trip_passenger_groups_tenant ON public.trip_passenger_groups
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;
