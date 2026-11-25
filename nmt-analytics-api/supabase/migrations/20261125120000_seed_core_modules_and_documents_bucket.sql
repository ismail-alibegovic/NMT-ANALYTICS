BEGIN;

-- Travline V1 UAT: ensure newly created and existing organizations receive all
-- core V1 modules granted by their plan tier, and reproducibly ensure the
-- private 'documents' storage bucket exists in every environment.

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

  -- Seed all core V1 modules granted to the default 'trial' plan.
  INSERT INTO public.org_modules(org_id, module_key, enabled)
  SELECT v_org_id, m.module_key, true
  FROM (
    SELECT module_key FROM public.plan_module_map WHERE plan = 'trial' AND enabled = true
    UNION
    SELECT module_key FROM (VALUES
      ('dashboard'),
      ('travel_core'),
      ('analytics'),
      ('documents'),
      ('integrations'),
      ('customers'),
      ('packages'),
      ('departures'),
      ('reservations'),
      ('payments'),
      ('transactions'),
      ('reports'),
      ('settings')
    ) AS core_defaults(module_key)
  ) AS m
  ON CONFLICT (org_id, module_key) DO NOTHING;

  INSERT INTO public.org_branding(org_id, display_name)
  VALUES (v_org_id, v_org_name);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Backfill missing plan-entitled module rows for existing organizations without
-- overwriting any explicitly disabled local override (enabled = false).
INSERT INTO public.org_modules (org_id, module_key, enabled)
SELECT o.id, m.module_key, m.enabled
FROM public.organizations o
JOIN public.plan_module_map m ON m.plan = o.plan AND m.enabled = true
ON CONFLICT (org_id, module_key) DO NOTHING;

-- Reproducibly provision the private 'documents' storage bucket across fresh
-- staging/production environments (never public).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('documents', 'documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;
END $$;

COMMIT;
