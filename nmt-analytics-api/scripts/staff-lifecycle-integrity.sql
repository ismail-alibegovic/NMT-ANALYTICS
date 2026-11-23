-- Disposable database only. Rollback-only contract for ONBOARD-01 staff provisioning and revocation.
BEGIN;
DO $$
DECLARE
  dir_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  bad_role_id uuid := gen_random_uuid();
  bad_org_id uuid := gen_random_uuid();
  org_id_dir uuid;
  orgs_before bigint;
  orgs_after bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'revoked_at'
  ) THEN
    RAISE EXCEPTION 'profiles.revoked_at column missing';
  END IF;

  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'handle_new_user exposed to browser roles';
  END IF;

  -- 1) Public signup creates a fresh tenant and director profile.
  INSERT INTO auth.users(id, email, raw_user_meta_data)
  VALUES (
    dir_id,
    dir_id::text || '@onboard.invalid',
    jsonb_build_object('org_name', 'Synthetic Agency Alpha', 'full_name', 'Director Alpha', 'role', 'super_admin', 'org_id', gen_random_uuid())
  );

  SELECT org_id INTO org_id_dir FROM public.profiles WHERE id = dir_id;
  IF org_id_dir IS NULL OR (SELECT role FROM public.profiles WHERE id = dir_id) <> 'director' THEN
    RAISE EXCEPTION 'Public director bootstrap failed';
  END IF;

  -- 2) Service-role raw_app_meta_data staff provisioning joins target org with ZERO orphan orgs.
  SELECT count(*) INTO orgs_before FROM public.organizations;
  INSERT INTO auth.users(id, email, raw_user_meta_data, raw_app_meta_data)
  VALUES (
    staff_id,
    staff_id::text || '@onboard.invalid',
    jsonb_build_object('full_name', 'Agent Alpha', 'role', 'super_admin', 'org_id', gen_random_uuid()),
    jsonb_build_object('travline_staff_org_id', org_id_dir::text, 'travline_staff_role', 'agent')
  );
  SELECT count(*) INTO orgs_after FROM public.organizations;

  IF orgs_after <> orgs_before THEN
    RAISE EXCEPTION 'Staff provisioning created an orphan organization (% vs %)', orgs_before, orgs_after;
  END IF;
  IF (SELECT org_id FROM public.profiles WHERE id = staff_id) <> org_id_dir
    OR (SELECT role FROM public.profiles WHERE id = staff_id) <> 'agent'
    OR (SELECT full_name FROM public.profiles WHERE id = staff_id) <> 'Agent Alpha'
    OR (SELECT revoked_at FROM public.profiles WHERE id = staff_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Staff profile fields mismatch';
  END IF;

  -- 3) super_admin role in raw_app_meta_data is strictly rejected and rolled back.
  BEGIN
    INSERT INTO auth.users(id, email, raw_app_meta_data)
    VALUES (
      bad_role_id,
      bad_role_id::text || '@onboard.invalid',
      jsonb_build_object('travline_staff_org_id', org_id_dir::text, 'travline_staff_role', 'super_admin')
    );
    RAISE EXCEPTION 'SUPER_ADMIN_SHOULD_HAVE_FAILED';
  EXCEPTION WHEN OTHERS THEN
    IF position('INVALID_STAFF_ROLE' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = bad_role_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = bad_role_id)
  THEN
    RAISE EXCEPTION 'Rejected super_admin staff insert survived';
  END IF;

  -- 4) Unknown organization in raw_app_meta_data is strictly rejected and rolled back.
  BEGIN
    INSERT INTO auth.users(id, email, raw_app_meta_data)
    VALUES (
      bad_org_id,
      bad_org_id::text || '@onboard.invalid',
      jsonb_build_object('travline_staff_org_id', gen_random_uuid()::text, 'travline_staff_role', 'manager')
    );
    RAISE EXCEPTION 'UNKNOWN_ORG_SHOULD_HAVE_FAILED';
  EXCEPTION WHEN OTHERS THEN
    IF position('STAFF_ORG_NOT_FOUND' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = bad_org_id) THEN
    RAISE EXCEPTION 'Rejected unknown-org staff insert survived';
  END IF;

  -- 5) GoTrue-order simulation (INSERT without raw_app_meta_data, then assign_staff_profile_atomic)
  DECLARE
    gotrue_staff_id uuid := gen_random_uuid();
    attached_json jsonb;
  BEGIN
    SELECT count(*) INTO orgs_before FROM public.organizations;
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      gotrue_staff_id,
      gotrue_staff_id::text || '@onboard.invalid',
      jsonb_build_object('full_name', 'GoTrue Manager')
    );

    attached_json := public.assign_staff_profile_atomic(
      gotrue_staff_id,
      org_id_dir,
      'manager',
      gotrue_staff_id::text || '@onboard.invalid',
      'GoTrue Manager'
    );
    SELECT count(*) INTO orgs_after FROM public.organizations;

    IF orgs_after <> orgs_before THEN
      RAISE EXCEPTION 'assign_staff_profile_atomic left an orphan organization (% vs %)', orgs_before, orgs_after;
    END IF;
    IF (attached_json->>'org_id')::uuid <> org_id_dir OR (attached_json->>'role') <> 'manager' THEN
      RAISE EXCEPTION 'assign_staff_profile_atomic returned unexpected profile payload';
    END IF;
  END;

  IF has_function_privilege('anon', 'public.assign_staff_profile_atomic(uuid,uuid,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.assign_staff_profile_atomic(uuid,uuid,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.assign_staff_profile_atomic(uuid,uuid,text,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'assign_staff_profile_atomic ACL mismatch';
  END IF;

  -- 6) Revocation timestamp persists cleanly on profile.
  UPDATE public.profiles SET revoked_at = now() WHERE id = staff_id AND org_id = org_id_dir;
  IF (SELECT revoked_at FROM public.profiles WHERE id = staff_id) IS NULL THEN
    RAISE EXCEPTION 'Revocation timestamp not persisted';
  END IF;
END $$;
ROLLBACK;
