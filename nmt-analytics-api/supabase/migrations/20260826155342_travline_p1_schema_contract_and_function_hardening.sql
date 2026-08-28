-- Restore live schema fields already expected by the application.
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(BTRIM(u.raw_user_meta_data->>'name'), ''),
  NULLIF(BTRIM(split_part(COALESCE(p.email, u.email, ''), '@', 1)), '')
)
FROM auth.users u
WHERE u.id = p.id
  AND (p.full_name IS NULL OR BTRIM(p.full_name) = '');

CREATE POLICY clients_tenant
ON public.clients
FOR ALL TO authenticated
USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));

CREATE POLICY tours_tenant
ON public.tours
FOR ALL TO authenticated
USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));

CREATE POLICY trip_passenger_groups_tenant
ON public.trip_passenger_groups
FOR ALL TO authenticated
USING (org_id = (SELECT public.get_my_org_id()))
WITH CHECK (org_id = (SELECT public.get_my_org_id()));

CREATE POLICY trip_passenger_group_members_tenant
ON public.trip_passenger_group_members
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trip_passenger_groups g
    WHERE g.id = group_id
      AND g.org_id = (SELECT public.get_my_org_id())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trip_passenger_groups g
    WHERE g.id = group_id
      AND g.org_id = (SELECT public.get_my_org_id())
  )
);

-- Pin search_path for all public functions that still inherit caller search_path.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp', r.fn);
  END LOOP;
END
$$;
