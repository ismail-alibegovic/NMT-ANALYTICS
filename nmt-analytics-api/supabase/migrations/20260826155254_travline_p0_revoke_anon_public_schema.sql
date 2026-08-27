-- Public Travline flows are served by the API service-role client.
-- Browser anon must not have direct CRUD access to public business objects.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM anon', r.obj);
  END LOOP;
END
$$;

ALTER VIEW public.eturista_submissions_view SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.eturista_submissions_view FROM anon;
