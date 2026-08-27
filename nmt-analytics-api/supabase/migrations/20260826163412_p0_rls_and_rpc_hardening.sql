-- ⚠️ RESTORED FROM LIVE: This version was recorded in supabase_migrations.schema_migrations
-- as 20260826163412 (vs the repository 20260826155105). The logical migration content is
-- identical — only the application timestamp differs.
--
-- This file documents the live migration history. On a fresh database, 20260826155105
-- applies the actual changes first; this migration is idempotent and safely re-asserts
-- the same state without errors.

-- Re-assert helper functions (CREATE OR REPLACE is safe).
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.org_id INTO v_org_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
  RETURN v_role;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- Re-assert RLS (idempotent).
ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_seat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departure_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departure_passenger_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.communication_history FROM anon;
REVOKE ALL ON TABLE public.message_templates FROM anon;
REVOKE ALL ON TABLE public.campaigns FROM anon;

-- Re-assert RLS policies idempotently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'communication_history_tenant' AND tablename = 'communication_history') THEN
    CREATE POLICY communication_history_tenant ON public.communication_history
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'message_templates_tenant' AND tablename = 'message_templates') THEN
    CREATE POLICY message_templates_tenant ON public.message_templates
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaigns_tenant' AND tablename = 'campaigns') THEN
    CREATE POLICY campaigns_tenant ON public.campaigns
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'accommodation_buildings_tenant' AND tablename = 'accommodation_buildings') THEN
    CREATE POLICY accommodation_buildings_tenant ON public.accommodation_buildings
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bus_seat_categories_tenant' AND tablename = 'bus_seat_categories') THEN
    CREATE POLICY bus_seat_categories_tenant ON public.bus_seat_categories
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'departure_passengers_tenant' AND tablename = 'departure_passengers') THEN
    CREATE POLICY departure_passengers_tenant ON public.departure_passengers
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'departure_passenger_groups_tenant' AND tablename = 'departure_passenger_groups') THEN
    CREATE POLICY departure_passenger_groups_tenant ON public.departure_passenger_groups
    FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
    WITH CHECK (org_id = (SELECT public.get_my_org_id()));
  END IF;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
