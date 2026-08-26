-- P0: close direct Data API access to sensitive org-scoped tables,
-- restore tenant isolation, and remove direct client execution of privileged RPCs.

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

ALTER TABLE public.accommodation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_seat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.accommodation_assignments FROM anon;
REVOKE ALL ON TABLE public.accommodation_buildings FROM anon;
REVOKE ALL ON TABLE public.accommodation_floors FROM anon;
REVOKE ALL ON TABLE public.accommodation_rooms FROM anon;
REVOKE ALL ON TABLE public.bus_seat_categories FROM anon;
REVOKE ALL ON TABLE public.campaigns FROM anon;
REVOKE ALL ON TABLE public.communication_history FROM anon;
REVOKE ALL ON TABLE public.message_templates FROM anon;
REVOKE ALL ON TABLE public.payment_links FROM anon;
REVOKE ALL ON TABLE public.role_permissions FROM anon;

CREATE POLICY accommodation_assignments_tenant ON public.accommodation_assignments
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY accommodation_buildings_tenant ON public.accommodation_buildings
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY accommodation_floors_tenant ON public.accommodation_floors
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY accommodation_rooms_tenant ON public.accommodation_rooms
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY bus_seat_categories_tenant ON public.bus_seat_categories
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY campaigns_tenant ON public.campaigns
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY communication_history_tenant ON public.communication_history
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY message_templates_tenant ON public.message_templates
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));
CREATE POLICY payment_links_tenant ON public.payment_links
FOR ALL TO authenticated USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.role_permissions FROM authenticated;
GRANT SELECT ON TABLE public.role_permissions TO authenticated;
CREATE POLICY role_permissions_read_authenticated ON public.role_permissions
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow Insert for Authenticated" ON public.customers;
DROP POLICY IF EXISTS "Allow Insert for Authenticated" ON public.packages;
DROP POLICY IF EXISTS "Allow Insert for Authenticated" ON public.reservations;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
