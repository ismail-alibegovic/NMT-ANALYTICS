BEGIN;

-- P5 ONBOARD-01: profile-level revocation timestamp for immediate JWT invalidation
-- and service-role staff provisioning inside an existing organization without
-- creating orphan tenants or weakening public signup metadata isolation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_org_revoked
  ON public.profiles (org_id, revoked_at);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org_id uuid := gen_random_uuid();
  v_staff_org_id uuid;
  v_staff_role text;
  v_org_name text;
  v_full_name text;
  v_slug_base text;
BEGIN
  IF TG_OP <> 'INSERT' OR TG_TABLE_SCHEMA <> 'auth' OR TG_TABLE_NAME <> 'users' THEN
    RAISE EXCEPTION 'INVALID_AUTH_BOOTSTRAP_CONTEXT';
  END IF;

  IF jsonb_typeof(NEW.raw_user_meta_data->'full_name') = 'string' THEN
    v_full_name := nullif(left(btrim(NEW.raw_user_meta_data->>'full_name'), 100), '');
  END IF;

  -- Service-role staff provisioning path: ONLY reads raw_app_meta_data (which
  -- public auth.signUp() cannot set). Never accepts super_admin or unknown orgs.
  IF jsonb_typeof(NEW.raw_app_meta_data->'travline_staff_org_id') = 'string' THEN
    BEGIN
      v_staff_org_id := (NEW.raw_app_meta_data->>'travline_staff_org_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_STAFF_ORG_ID';
    END;

    v_staff_role := btrim(coalesce(NEW.raw_app_meta_data->>'travline_staff_role', ''));
    IF v_staff_role NOT IN ('director', 'manager', 'agent', 'viewer') THEN
      RAISE EXCEPTION 'INVALID_STAFF_ROLE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_staff_org_id) THEN
      RAISE EXCEPTION 'STAFF_ORG_NOT_FOUND';
    END IF;

    INSERT INTO public.profiles(id, org_id, role, email, full_name)
    VALUES (NEW.id, v_staff_org_id, v_staff_role, NEW.email, v_full_name);

    RETURN NEW;
  END IF;

  -- Public self-service signup path (PR #164 contract preserved verbatim):
  -- always creates a fresh tenant + director profile; ignores raw_user_meta_data org_id/role.
  IF jsonb_typeof(NEW.raw_user_meta_data->'org_name') = 'string' THEN
    v_org_name := btrim(NEW.raw_user_meta_data->>'org_name');
  END IF;
  IF v_org_name IS NULL OR length(v_org_name) < 2 OR length(v_org_name) > 100 THEN
    v_org_name := left(coalesce(nullif(split_part(NEW.email, '@', 1), ''), 'My Organization'), 100);
  END IF;

  v_slug_base := trim(both '-' from lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug_base := coalesce(nullif(v_slug_base, ''), 'org');

  INSERT INTO public.organizations(id, name, slug)
  VALUES (v_org_id, v_org_name, v_slug_base || '-' || v_org_id::text);

  INSERT INTO public.profiles(id, org_id, role, email, full_name)
  VALUES (NEW.id, v_org_id, 'director', NEW.email, v_full_name);

  INSERT INTO public.org_modules(org_id, module_key, enabled)
  SELECT v_org_id, m.module_key, true
  FROM (VALUES ('travel_core'), ('analytics'), ('documents'), ('integrations')) AS m(module_key);

  INSERT INTO public.org_branding(org_id, display_name)
  VALUES (v_org_id, v_org_name);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Service-only atomic staff attachment RPC: handles GoTrue admin.createUser
-- implementations that insert auth.users before applying app_metadata.
CREATE OR REPLACE FUNCTION public.assign_staff_profile_atomic(
  p_user_id uuid,
  p_org_id uuid,
  p_role text,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_org_id uuid;
  v_clean_name text := nullif(left(btrim(coalesce(p_full_name, '')), 100), '');
  v_result jsonb;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('director', 'manager', 'agent', 'viewer') THEN
    RAISE EXCEPTION 'INVALID_STAFF_ROLE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'STAFF_ORG_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'STAFF_USER_NOT_FOUND';
  END IF;

  SELECT org_id INTO v_old_org_id
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_old_org_id IS NULL THEN
    INSERT INTO public.profiles(id, org_id, role, email, full_name, revoked_at)
    VALUES (p_user_id, p_org_id, p_role, p_email, v_clean_name, NULL);
  ELSE
    UPDATE public.profiles
       SET org_id = p_org_id,
           role = p_role,
           email = coalesce(p_email, email),
           full_name = coalesce(v_clean_name, full_name),
           revoked_at = NULL
     WHERE id = p_user_id;
  END IF;

  IF v_old_org_id IS NOT NULL AND v_old_org_id <> p_org_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE org_id = v_old_org_id)
       AND NOT EXISTS (SELECT 1 FROM public.packages WHERE org_id = v_old_org_id)
       AND NOT EXISTS (SELECT 1 FROM public.departures WHERE org_id = v_old_org_id)
       AND NOT EXISTS (SELECT 1 FROM public.reservations WHERE org_id = v_old_org_id)
       AND NOT EXISTS (SELECT 1 FROM public.customers WHERE org_id = v_old_org_id) THEN
      DELETE FROM public.organizations WHERE id = v_old_org_id;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id', id,
    'org_id', org_id,
    'email', email,
    'full_name', full_name,
    'role', role,
    'created_at', created_at,
    'revoked_at', revoked_at
  )
  INTO v_result
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_staff_profile_atomic(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_staff_profile_atomic(uuid, uuid, text, text, text) TO service_role;

COMMIT;
