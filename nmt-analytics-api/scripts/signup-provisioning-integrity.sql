-- Disposable database only. This contract is rollback-only and never repairs users.
BEGIN;
CREATE FUNCTION pg_temp.fail_bootstrap_stage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('travline.test_bootstrap_failure',true)=TG_TABLE_NAME THEN
   RAISE EXCEPTION 'TEST_BOOTSTRAP_FAILURE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_bootstrap_org_failure BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_bootstrap_stage();
CREATE TRIGGER zz_bootstrap_profile_failure BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_bootstrap_stage();
CREATE TRIGGER zz_bootstrap_module_failure BEFORE INSERT ON public.org_modules FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_bootstrap_stage();
CREATE TRIGGER zz_bootstrap_branding_failure BEFORE INSERT ON public.org_branding FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_bootstrap_stage();
DO $$
DECLARE stage text; actor uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); org_a uuid; org_b uuid;
 before_orgs bigint; before_profiles bigint; before_modules bigint; before_branding bigint;
BEGIN
 -- Failures at every bootstrap write must abort the identity INSERT as well.
 FOREACH stage IN ARRAY ARRAY['organizations','profiles','org_modules','org_branding'] LOOP
  actor:=gen_random_uuid();
  SELECT count(*) INTO before_orgs FROM public.organizations;
  SELECT count(*) INTO before_profiles FROM public.profiles;
  SELECT count(*) INTO before_modules FROM public.org_modules;
  SELECT count(*) INTO before_branding FROM public.org_branding;
  PERFORM set_config('travline.test_bootstrap_failure',stage,true);
  BEGIN
   INSERT INTO auth.users(id,email,raw_user_meta_data)
   VALUES(actor,actor::text||'@bootstrap.invalid','{"org_name":"Synthetic agency"}'::jsonb);
   RAISE EXCEPTION 'BOOTSTRAP_SHOULD_HAVE_FAILED';
  EXCEPTION WHEN OTHERS THEN
   IF position('TEST_BOOTSTRAP_FAILURE' in SQLERRM)=0 THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT FROM auth.users WHERE id=actor)
   OR (SELECT count(*) FROM public.organizations)<>before_orgs
   OR (SELECT count(*) FROM public.profiles)<>before_profiles
   OR (SELECT count(*) FROM public.org_modules)<>before_modules
   OR (SELECT count(*) FROM public.org_branding)<>before_branding
  THEN RAISE EXCEPTION 'Identity/tenant partial creation survived % failure',stage; END IF;
 END LOOP;
 PERFORM set_config('travline.test_bootstrap_failure','',true);
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (a,a::text||'@bootstrap.invalid',jsonb_build_object('org_name','  Synthetic agency  ','full_name','  Synthetic director  ', 'org_id',gen_random_uuid(),'role','super_admin','plan','enterprise')),
 (b,b::text||'@bootstrap.invalid',jsonb_build_object('org_name','Synthetic agency'));
 SELECT org_id INTO org_a FROM public.profiles WHERE id=a;
 SELECT org_id INTO org_b FROM public.profiles WHERE id=b;
 IF org_a IS NULL OR org_b IS NULL OR org_a=org_b
 OR (SELECT count(*) FROM public.organizations WHERE id IN(org_a,org_b) AND name='Synthetic agency')<>2
 OR (SELECT count(DISTINCT slug) FROM public.organizations WHERE id IN(org_a,org_b))<>2
 OR (SELECT role FROM public.profiles WHERE id=a)<>'director'
 OR (SELECT full_name FROM public.profiles WHERE id=a)<>'Synthetic director'
 OR (SELECT count(*) FROM public.org_modules WHERE org_id=org_a AND enabled)<>4
 OR (SELECT display_name FROM public.org_branding WHERE org_id=org_a)<>'Synthetic agency'
 THEN RAISE EXCEPTION 'Fresh tenant/name/role/settings isolation contract failed'; END IF;
 UPDATE auth.users SET raw_user_meta_data=jsonb_build_object('org_name','Unauthorized rename','org_id',org_b,'role','super_admin') WHERE id=a;
 IF (SELECT name FROM public.organizations WHERE id=org_a)<>'Synthetic agency'
 OR (SELECT display_name FROM public.org_branding WHERE org_id=org_a)<>'Synthetic agency'
 OR (SELECT org_id FROM public.profiles WHERE id=a)<>org_a
 OR (SELECT role FROM public.profiles WHERE id=a)<>'director'
 THEN RAISE EXCEPTION 'Existing identity metadata changed a tenant or role'; END IF;
 IF has_function_privilege('anon','public.handle_new_user()','EXECUTE')
 OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')
 THEN RAISE EXCEPTION 'Bootstrap trigger function exposed to browser roles'; END IF;
END $$;
ROLLBACK;
