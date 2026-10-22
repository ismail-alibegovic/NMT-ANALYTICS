-- SELECT-only aggregate preflight. Does not certify backup readiness or authorize writes.
SELECT jsonb_build_object(
 'versions', (SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
 'waiver_columns', (SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='waiver_tokens'),
 'waiver_rows', (SELECT count(*) FROM public.waiver_tokens),
 'legacy_unsigned_links', (SELECT count(*) FROM public.waiver_tokens WHERE consumed_at IS NULL AND revoked_at IS NULL),
 'waiver_passenger_org_violations', (SELECT count(*) FROM public.waiver_tokens w WHERE NOT EXISTS (SELECT FROM public.excursion_passengers p WHERE p.id=w.passenger_id AND p.org_id=w.org_id)),
 'documents_public', (SELECT public FROM storage.buckets WHERE id='documents'),
 'documents_restrictive_policy', EXISTS(SELECT FROM pg_policies WHERE schemaname='storage' AND policyname='documents_api_only'),
 'consent_sync_function', to_regprocedure('public.sync_waiver_passenger_consent()') IS NOT NULL,
 'unvalidated_constraints', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated),
 'tables_without_rls', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity)
) AS migration_preflight;
SELECT p.oid::regprocedure::text AS function, p.prosecdef, p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.prosecdef OR p.proname='prevent_supplier_confirmation_event_mutation');
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
 AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'));
