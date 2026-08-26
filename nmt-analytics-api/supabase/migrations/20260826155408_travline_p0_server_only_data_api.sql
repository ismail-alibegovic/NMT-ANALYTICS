-- Travline business data is accessed through the authenticated API layer using
-- service_role. Browser Supabase usage is Auth-only. Remove direct signed-in
-- table access to reduce PostgREST/GraphQL attack surface.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM authenticated', r.obj);
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_org_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;
