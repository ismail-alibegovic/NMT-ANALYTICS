#!/usr/bin/env bash
# Schema fingerprint: fresh replay vs production
# Reads production through Supabase Management API, fresh replay through local psql.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/migrations/fresh-vs-production-schema-diff.json"
MGT_TOKEN="${TRAVLINE_SUPABASE_MANAGEMENT_TOKEN:?missing TRAVLINE_SUPABASE_MANAGEMENT_TOKEN}"
REF="hacutwknfgufrqlgdiia"
FRESH_DB="travline_replay"

mgmt_query() {
  local q="$1"
  curl -sf -H "Authorization: Bearer ${MGT_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.supabase.com/v1/projects/${REF}/database/query" \
    -d "{\"query\": $(echo "$q" | jq -Rs .)}"
}

# Collect production metadata
echo "Fetching production metadata..." >&2

PROD_TABLES=$(mgmt_query "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name" | jq '[.[].table_name]')

PROD_COLUMNS=$(mgmt_query "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position" | jq '[.[] | {table: .table_name, column: .column_name, type: .data_type, nullable: .is_nullable, default: .column_default}]')

PROD_PK=$(mgmt_query "SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' ORDER BY kcu.table_name, kcu.ordinal_position" | jq '[.[] | {table: .table_name, column: .column_name}]')

PROD_FK=$(mgmt_query "SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' ORDER BY tc.table_name, kcu.column_name" | jq '[.[] | {table: .table_name, column: .column_name, ftable: .foreign_table, fcolumn: .foreign_column}]')

PROD_UNIQUE=$(mgmt_query "SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public' ORDER BY tc.table_name" | jq '[.[] | {table: .table_name, column: .column_name}]')

PROD_CHECK=$(mgmt_query "SELECT tc.table_name, cc.check_clause FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON tc.constraint_name=cc.constraint_name WHERE tc.constraint_type='CHECK' AND tc.table_schema='public' ORDER BY tc.table_name" | jq '[.[] | {table: .table_name, check: .check_clause}]')

PROD_INDEXES=$(mgmt_query "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname" | jq '[.[] | {table: .tablename, index: .indexname, def: .indexdef}]')

PROD_RLS=$(mgmt_query "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename" | jq '[.[] | {table: .tablename, rls: .rowsecurity, force: .forcerowsecurity}]')

PROD_POLICIES=$(mgmt_query "SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname" | jq '[.[] | {table: .tablename, policy: .policyname, cmd: .cmd, roles: .roles, using: .qual, check: .with_check}]')

PROD_FUNCTIONS=$(mgmt_query "SELECT p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, p.prosecdef, CASE WHEN p.prosecdef THEN pg_get_functiondef(p.oid) ELSE NULL END AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname" | jq '[.[] | {name: .proname, args: .args, ret: .ret, secdef: .prosecdef}]')

PROD_TRIGGERS=$(mgmt_query "SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table, trigger_name" | jq '[.[] | {table: .event_object_table, trigger: .trigger_name, def: .action_statement}]')

PROD_VIEWS=$(mgmt_query "SELECT table_name, view_definition FROM information_schema.views WHERE table_schema='public' ORDER BY table_name" | jq '[.[] | {view: .table_name, def: .view_definition}]')

PROD_GRANTS=$(mgmt_query "SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') ORDER BY table_name, grantee, privilege_type" | jq '[.[] | {table: .table_name, role: .grantee, priv: .privilege_type}]')

# Collect fresh replay metadata
echo "Fetching fresh replay metadata..." >&2

FRESH_TABLES=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(table_name) FROM (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name) t\"" 2>/dev/null)

FRESH_COLUMNS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT table_name AS table, column_name AS column, data_type AS type, is_nullable AS nullable, column_default AS default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) r\"" 2>/dev/null)

FRESH_PK=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT kcu.table_name AS table, kcu.column_name AS column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public') r\"" 2>/dev/null)

FRESH_FK=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name AS table, kcu.column_name AS column, ccu.table_name AS ftable, ccu.column_name AS fcolumn FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public') r\"" 2>/dev/null)

FRESH_UNIQUE=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name AS table, kcu.column_name AS column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public') r\"" 2>/dev/null)

FRESH_CHECK=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name AS table, cc.check_clause AS check FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON tc.constraint_name=cc.constraint_name WHERE tc.table_schema='public') r\"" 2>/dev/null)

FRESH_INDEXES=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tablename AS table, indexname AS index, indexdef AS def FROM pg_indexes WHERE schemaname='public') r\"" 2>/dev/null)

FRESH_RLS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tablename AS table, rowsecurity::text AS rls, forcerowsecurity::text AS force FROM pg_tables WHERE schemaname='public') r\"" 2>/dev/null)

FRESH_POLICIES=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT tablename AS table, policyname AS policy, cmd, roles, qual AS using, with_check AS check FROM pg_policies WHERE schemaname='public') r\"" 2>/dev/null)

FRESH_FUNCTIONS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT p.proname AS name, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, p.prosecdef AS secdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prokind='f') r\"" 2>/dev/null)

FRESH_TRIGGERS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT event_object_table AS table, trigger_name AS trigger, action_statement AS def FROM information_schema.triggers WHERE trigger_schema='public') r\"" 2>/dev/null)

FRESH_VIEWS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT table_name AS view, view_definition AS def FROM information_schema.views WHERE table_schema='public') r\"" 2>/dev/null)

FRESH_GRANTS=$(su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"SELECT json_agg(row_to_json(r)) FROM (SELECT table_name AS table, grantee AS role, privilege_type AS priv FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')) r\"" 2>/dev/null)

# Build comparison
echo "Building comparison..." >&2

jq -n --argjson prod_tables "${PROD_TABLES:-[]}" \
       --argjson fresh_tables "${FRESH_TABLES:-[]}" \
       --argjson prod_cols "${PROD_COLUMNS:-[]}" \
       --argjson fresh_cols "${FRESH_COLUMNS:-[]}" \
       --argjson prod_pk "${PROD_PK:-[]}" \
       --argjson fresh_pk "${FRESH_PK:-[]}" \
       --argjson prod_fk "${PROD_FK:-[]}" \
       --argjson fresh_fk "${FRESH_FK:-[]}" \
       --argjson prod_unique "${PROD_UNIQUE:-[]}" \
       --argjson fresh_unique "${FRESH_UNIQUE:-[]}" \
       --argjson prod_check "${PROD_CHECK:-[]}" \
       --argjson fresh_check "${FRESH_CHECK:-[]}" \
       --argjson prod_indexes "${PROD_INDEXES:-[]}" \
       --argjson fresh_indexes "${FRESH_INDEXES:-[]}" \
       --argjson prod_rls "${PROD_RLS:-[]}" \
       --argjson fresh_rls "${FRESH_RLS:-[]}" \
       --argjson prod_policies "${PROD_POLICIES:-[]}" \
       --argjson fresh_policies "${FRESH_POLICIES:-[]}" \
       --argjson prod_funcs "${PROD_FUNCTIONS:-[]}" \
       --argjson fresh_funcs "${FRESH_FUNCTIONS:-[]}" \
       --argjson prod_triggers "${PROD_TRIGGERS:-[]}" \
       --argjson fresh_triggers "${FRESH_TRIGGERS:-[]}" \
       --argjson prod_views "${PROD_VIEWS:-[]}" \
       --argjson fresh_views "${FRESH_VIEWS:-[]}" \
       --argjson prod_grants "${PROD_GRANTS:-[]}" \
       --argjson fresh_grants "${FRESH_GRANTS:-[]}" \
'{
  summary: {
    prod_tables: ($prod_tables | length),
    fresh_tables: ($fresh_tables | length),
    tables_only_prod: ($prod_tables - $fresh_tables),
    tables_only_fresh: ($fresh_tables - $prod_tables),
    tables_common: (($prod_tables - ($prod_tables - $fresh_tables)) | length)
  },
  columns: {
    prod_count: ($prod_cols | length),
    fresh_count: ($fresh_cols | length),
    diff_excluding_generated_names: "normalized below"
  },
  tables: {
    only_prod: ($prod_tables - $fresh_tables),
    only_fresh: ($fresh_tables - $prod_tables)
  },
  policies: {
    prod_count: ($prod_policies | length),
    fresh_count: ($fresh_policies | length),
    prod: $prod_policies,
    fresh: $fresh_policies
  },
  rls: {
    prod: $prod_rls,
    fresh: $fresh_rls
  },
  grants: {
    prod_count: ($prod_grants | length),
    fresh_count: ($fresh_grants | length),
    prod_summary: ($prod_grants | group_by(.role) | map({role: .[0].role, tables: map(.table) | unique | length, privileges: map(.priv) | unique})),
    fresh_summary: ($fresh_grants | group_by(.role) | map({role: .[0].role, tables: map(.table) | unique | length, privileges: map(.priv) | unique}))
  },
  functions: {
    prod_count: ($prod_funcs | length),
    fresh_count: ($fresh_funcs | length),
    only_prod: ($prod_funcs | map(.name) - ($fresh_funcs | map(.name))),
    only_fresh: ($fresh_funcs | map(.name) - ($prod_funcs | map(.name)))
  },
  triggers: {
    prod_count: ($prod_triggers | length),
    fresh_count: ($fresh_triggers | length)
  },
  views: {
    prod_count: ($prod_views | length),
    fresh_count: ($fresh_views | length)
  }
}' > "$OUT"

echo "Fingerprint written to $OUT" >&2
cat "$OUT" | jq '.summary, .tables, .policies | {prod: .prod_count, fresh: .fresh_count}, .functions | {prod: .prod_count, fresh: .fresh_count, only_prod: .only_prod, only_fresh: .only_fresh}'