#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${MIGRATION_REPLAY_DB:-travline_replay}"
PSQL_BASE=(psql -v ON_ERROR_STOP=1 -d "$DB_NAME")
"${PSQL_BASE[@]}" -f "$ROOT/scripts/migration-test-bootstrap.sql"
count=0
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "replay: $(basename "$migration")"
  "${PSQL_BASE[@]}" -f "$migration" >/dev/null
  count=$((count + 1))
done
"${PSQL_BASE[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.reservations') IS NULL THEN RAISE EXCEPTION 'reservations missing'; END IF;
  IF to_regclass('public.communication_history') IS NULL THEN RAISE EXCEPTION 'communication_history missing'; END IF;
  IF to_regclass('public.trip_passenger_groups') IS NULL THEN RAISE EXCEPTION 'trip_passenger_groups missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trip_passenger_groups' AND column_name='primary_passenger_name') THEN RAISE EXCEPTION 'primary_passenger_name missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='trip_passenger_groups' AND column_name='accommodation_preference' AND column_default LIKE '%no_preference%') THEN RAISE EXCEPTION 'accommodation_preference default mismatch'; END IF;
  IF to_regprocedure('public.batch_update_seats_atomic(uuid,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'batch_update_seats_atomic missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='communication_history' AND c.relrowsecurity) THEN RAISE EXCEPTION 'communication_history RLS disabled'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='communication_history') THEN RAISE EXCEPTION 'communication_history should have zero policies'; END IF;
  IF has_table_privilege('authenticated', 'public.communication_history', 'select') OR has_table_privilege('authenticated', 'public.communication_history', 'insert') OR has_table_privilege('authenticated', 'public.communication_history', 'update') OR has_table_privilege('authenticated', 'public.communication_history', 'delete') THEN RAISE EXCEPTION 'authenticated has communication_history privileges'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='tenant_customers') THEN RAISE EXCEPTION 'tenant_customers missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='packages' AND policyname='tenant_packages') THEN RAISE EXCEPTION 'tenant_packages missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='departures' AND policyname='tenant_departures') THEN RAISE EXCEPTION 'tenant_departures missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reservations' AND policyname='tenant_reservations') THEN RAISE EXCEPTION 'tenant_reservations missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='transactions' AND policyname='tenant_transactions') THEN RAISE EXCEPTION 'tenant_transactions missing'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='audit_logs'
      AND column_name IN ('org_id','user_id','action','entity','entity_id','details')
    GROUP BY table_name
    HAVING COUNT(*) = 6
  ) THEN RAISE EXCEPTION 'audit_logs application contract columns missing'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='organizations'
      AND column_name IN ('phone','email','address','currency','timezone')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN RAISE EXCEPTION 'organizations legacy/settings columns missing'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='org_settings'
      AND column_name IN ('id','org_id','key','value')
    GROUP BY table_name
    HAVING COUNT(*) = 4
  ) THEN RAISE EXCEPTION 'org_settings key/value application contract columns missing'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.org_settings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (org_id, key)'
  ) THEN RAISE EXCEPTION 'org_settings org_id/key unique contract missing'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='sub_agents'
      AND column_name IN ('portal_token_hash','portal_token_expires_at','portal_last_seen_at')
    GROUP BY table_name
    HAVING COUNT(*) = 3
  ) THEN RAISE EXCEPTION 'sub_agents portal application contract columns missing'; END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='hotel_rooms'
      AND column_name IN ('bed_config','beds_count')
  ) THEN RAISE EXCEPTION 'hotel_rooms obsolete fresh-only columns still present'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='documents'
      AND column_name IN ('name','type','size','storage_path','uploaded_by')
    GROUP BY table_name
    HAVING COUNT(*) = 5
  ) THEN RAISE EXCEPTION 'documents legacy upload columns missing'; END IF;
END $$;

BEGIN;
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Replay Contract Org', 'replay-contract-org');
INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  NULL,
  'CREATE',
  'customer',
  '00000000-0000-4000-8000-000000000002',
  '{"metadata":{"source":"migration-replay"}}'::jsonb
);
ROLLBACK;
SQL
echo "Migration Replay PASS: $count migrations executed"
