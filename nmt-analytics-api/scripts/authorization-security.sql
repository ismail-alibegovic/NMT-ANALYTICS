-- Disposable database only; this script performs no durable writes.
BEGIN;
DO $$
DECLARE obj record; client text; verb text; attempts text;
BEGIN
  FOR obj IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
  LOOP
    FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH verb IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(client,obj.oid,verb) THEN
          RAISE EXCEPTION 'Direct browser table privilege: % / % / %',client,obj.relname,verb;
        END IF;
      END LOOP;
      FOREACH verb IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        IF has_any_column_privilege(client,obj.oid,verb) THEN
          RAISE EXCEPTION 'Direct browser column privilege: % / % / %',client,obj.relname,verb;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Execute actual bypass attempts, not just metadata assertions.
  FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH attempts IN ARRAY ARRAY[
      'SELECT role,org_id FROM public.profiles',
      'UPDATE public.profiles SET role=''director''',
      'UPDATE public.profiles SET org_id=NULL',
      'UPDATE public.payments SET amount=0',
      'DELETE FROM public.documents',
      'SELECT * FROM public.org_email_settings'
    ] LOOP
      -- Some deployments name settings differently; the table-wide ACL audit
      -- above remains authoritative for every existing table.
      IF attempts LIKE '%org_email_settings%' AND to_regclass('public.org_email_settings') IS NULL THEN CONTINUE; END IF;
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I',client);
        EXECUTE attempts;
        RAISE EXCEPTION 'Unauthorized direct statement succeeded: %',attempts;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.profiles','SELECT,UPDATE') OR
     NOT has_table_privilege('service_role','public.payments','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'API service-role privileges lost';
  END IF;
  RAISE NOTICE 'Authorization table/column ACL audit PASS';
END $$;
ROLLBACK;
