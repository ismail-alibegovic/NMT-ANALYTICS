BEGIN;
-- All business data is served through authenticated tenant-scoped Express APIs.
-- This closes direct Data API bypasses of role checks, financial guards and audit.
-- Preserve every service_role grant, policy, row and function. No data is deleted.
DO $$
DECLARE obj record; col record;
BEGIN
  FOR obj IN
    SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',obj.nspname,obj.relname);
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=obj.oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE %I.%I FROM PUBLIC, anon, authenticated',col.attname,obj.nspname,obj.relname);
    END LOOP;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Download/upload/delete for private documents also go through the API. A
-- restrictive policy wins even if another permissive Storage policy is added.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $policy$ CREATE POLICY documents_api_only ON storage.objects AS RESTRICTIVE
      FOR ALL TO anon, authenticated USING (bucket_id <> 'documents') WITH CHECK (bucket_id <> 'documents') $policy$;
  END IF;
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE 'UPDATE storage.buckets SET public=false WHERE id=''documents'' AND public=true';
  END IF;
END $$;
COMMIT;
