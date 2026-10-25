BEGIN;

-- Naming belongs exclusively to a newly created tenant, never to a public
-- post-signup service-role update of the identity returned by Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_org_id uuid := gen_random_uuid();
 v_org_name text;
 v_full_name text;
 v_slug_base text;
BEGIN
 IF TG_OP <> 'INSERT' OR TG_TABLE_SCHEMA <> 'auth' OR TG_TABLE_NAME <> 'users' THEN
  RAISE EXCEPTION 'INVALID_AUTH_BOOTSTRAP_CONTEXT';
 END IF;
 IF jsonb_typeof(NEW.raw_user_meta_data->'org_name') = 'string' THEN
  v_org_name := btrim(NEW.raw_user_meta_data->>'org_name');
 END IF;
 IF v_org_name IS NULL OR length(v_org_name) < 2 OR length(v_org_name) > 100 THEN
  v_org_name := left(coalesce(nullif(split_part(NEW.email,'@',1),''),'My Organization'),100);
 END IF;
 IF jsonb_typeof(NEW.raw_user_meta_data->'full_name') = 'string' THEN
  v_full_name := nullif(left(btrim(NEW.raw_user_meta_data->>'full_name'),100),'');
 END IF;
 -- Avoid the former check-then-insert slug race for equal agency names.
 v_slug_base := trim(both '-' from lower(regexp_replace(v_org_name,'[^a-zA-Z0-9]+','-','g')));
 v_slug_base := coalesce(nullif(v_slug_base,''),'org');
 INSERT INTO public.organizations(id,name,slug)
 VALUES(v_org_id,v_org_name,v_slug_base||'-'||v_org_id::text);
 -- Never upsert/move an existing profile or accept role/org IDs from metadata.
 INSERT INTO public.profiles(id,org_id,role,email,full_name)
 VALUES(NEW.id,v_org_id,'director',NEW.email,v_full_name);
 INSERT INTO public.org_modules(org_id,module_key,enabled)
 SELECT v_org_id,m.module_key,true
 FROM (VALUES('travel_core'),('analytics'),('documents'),('integrations')) AS m(module_key);
 INSERT INTO public.org_branding(org_id,display_name) VALUES(v_org_id,v_org_name);
 -- No catch-and-return: any dependency failure rolls back the Auth INSERT and
 -- every tenant write in the same transaction. No partial success is reported.
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

COMMIT;
