-- Disposable database only: synthetic objects, grants and policies roll back.
BEGIN;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
-- Reproduce the permissive production policies, even on a clean installation.
CREATE POLICY phase1_permissive_probe ON storage.objects FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
INSERT INTO storage.buckets(id,name,public) VALUES ('documents','documents',false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects(id,bucket_id,name)
  VALUES ('f1000000-0000-4000-8000-000000000001','documents','phase1-security-probe');
DO $$
DECLARE client text; affected integer;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='documents_api_only' AND permissive='RESTRICTIVE') THEN
    RAISE EXCEPTION 'API-only restrictive Storage policy missing';
  END IF;
  FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',client);
    IF EXISTS (SELECT FROM storage.objects WHERE bucket_id='documents') THEN
      RAISE EXCEPTION 'Client can read document metadata: %',client;
    END IF;
    UPDATE storage.objects SET name='changed' WHERE bucket_id='documents';
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'Client can update documents: %',client; END IF;
    DELETE FROM storage.objects WHERE bucket_id='documents';
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'Client can delete documents: %',client; END IF;
    BEGIN
      INSERT INTO storage.objects(id,bucket_id,name)
        VALUES (gen_random_uuid(),'documents','forbidden-upload');
      RAISE EXCEPTION 'Client can upload documents: %',client;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  SET LOCAL ROLE service_role;
  IF NOT EXISTS (SELECT FROM storage.objects WHERE id='f1000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'API service role cannot read documents';
  END IF;
  INSERT INTO storage.objects(id,bucket_id,name)
    VALUES ('f1000000-0000-4000-8000-000000000002','documents','api-upload');
  UPDATE storage.objects SET name='api-updated' WHERE id='f1000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'API update failed'; END IF;
  DELETE FROM storage.objects WHERE id='f1000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'API delete failed'; END IF;
  RESET ROLE;
  RAISE NOTICE 'Storage API-only boundary PASS';
END $$;
ROLLBACK;
