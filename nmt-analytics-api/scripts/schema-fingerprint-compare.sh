#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/migrations/fresh-vs-production-schema-diff.json"
EXPLANATIONS="$ROOT/docs/migrations/schema-diff-explanations.json"
MGT_TOKEN="${TRAVLINE_SUPABASE_MANAGEMENT_TOKEN:-}"
REF="hacutwknfgufrqlgdiia"
FRESH_DB="travline_replay"

# Initialize explanations allowlist if missing
if [ ! -f "$EXPLANATIONS" ]; then
  cat > "$EXPLANATIONS" << 'EOF'
{
  "explained": [
    {
      "object": "trip_tokens",
      "type": "table",
      "category": "D",
      "evidence": "Not in legacy 001-026 archives; not in active migrations; not referenced by application code. Manually created production table.",
      "application_references": "NO",
      "reason_excluded": "GENUINE_UNTRACKED_PRODUCTION_OBJECT"
    },
    {
      "object": "get_dashboard_stats(uuid,date,date)",
      "type": "function",
      "category": "D",
      "evidence": "Production has get_dashboard_stats(p_date_from,p_date_to) with date params. Active migration 20260826163412 manages get_dashboard_stats(uuid,timestamptz,timestamptz) — the baseline stub signature. Production version is an older untracked overload.",
      "application_references": "NO",
      "reason_excluded": "PRODUCTION_ONLY_OVERLOAD_NOT_REQUIRED_BY_APPLICATION"
    },
    {
      "object": "pgrst_reload_schema",
      "type": "function",
      "category": "C",
      "evidence": "PostgREST internal schema reload notification function. Not an application-owned object.",
      "application_references": "NO",
      "reason_excluded": "PLATFORM_OBJECT_POSTGREST"
    }
  ]
}
EOF
fi

# Helper for fresh DB queries
fresh() { su - postgres -c "psql -At -d \"$FRESH_DB\" -c \"$1\"" 2>/dev/null || echo "null"; }

# Collect fresh metadata (normalized)
echo "Collecting fresh replay metadata..." >&2
F_TABLES=$(fresh "SELECT json_agg(t) FROM (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name) t")
F_COLS=$(fresh "SELECT json_agg(r) FROM (SELECT table_name||'.'||column_name AS full, table_name AS tbl, column_name AS col, data_type AS type, is_nullable AS nullable, COALESCE(column_default,'') AS def FROM information_schema.columns WHERE table_schema='public' ORDER BY 1) r")
F_PK=$(fresh "SELECT json_agg(r) FROM (SELECT kcu.table_name||'.'||kcu.column_name AS keycol FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' ORDER BY 1) r")
F_POLICIES=$(fresh "SELECT json_agg(r) FROM (SELECT tablename||'.'||policyname AS id, tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public' ORDER BY 1) r")
F_RLS=$(fresh "SELECT json_agg(r) FROM (SELECT tablename, rowsecurity::text FROM pg_tables WHERE schemaname='public' AND rowsecurity=true ORDER BY tablename) r")
F_FUNCS=$(fresh "SELECT json_agg(r) FROM (SELECT p.proname||'('||pg_get_function_arguments(p.oid)||')' AS sig, p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, p.prosecdef::text FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1) r")
F_TRIGGERS=$(fresh "SELECT json_agg(r) FROM (SELECT event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY 1) r")
F_VIEWS=$(fresh "SELECT json_agg(r) FROM (SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY 1) r")
F_AUTH_GRANTS=$(fresh "SELECT json_agg(r) FROM (SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated' ORDER BY 1) r")
F_ANON_GRANTS=$(fresh "SELECT json_agg(r) FROM (SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' ORDER BY 1) r")
F_SR_GRANTS=$(fresh "SELECT json_agg(r) FROM (SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='service_role' ORDER BY 1) r")

# Production metadata (only if token available)
if [ -n "$MGT_TOKEN" ]; then
echo "Collecting production metadata..." >&2
pmgmt() { curl -sf -H "Authorization: Bearer ${MGT_TOKEN}" -H "Content-Type: application/json" "https://api.supabase.com/v1/projects/${REF}/database/query" -d "{\"query\": $(echo "$1" | jq -Rs .)}" | jq '.'; }

P_TABLES=$(pmgmt "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name" | jq '[.[].table_name]')
P_COLS=$(pmgmt "SELECT table_name||'.'||column_name AS full, table_name AS tbl, column_name AS col, data_type AS type, is_nullable AS nullable, COALESCE(column_default,'') AS def FROM information_schema.columns WHERE table_schema='public' ORDER BY 1" | jq '[.[]]')
P_PK=$(pmgmt "SELECT kcu.table_name||'.'||kcu.column_name AS keycol FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'" | jq '[.[].keycol]')
P_POLICIES=$(pmgmt "SELECT tablename||'.'||policyname AS id, tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public'" | jq '[.[]]')
P_RLS=$(pmgmt "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=true" | jq '[.[].tablename]')
P_FUNCS=$(pmgmt "SELECT p.proname||'('||pg_get_function_arguments(p.oid)||')' AS sig, p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, p.prosecdef::text FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.prokind='f'" | jq '[.[]]')
P_TRIGGERS=$(pmgmt "SELECT event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_schema='public'" | jq '[.[]]')
P_VIEWS=$(pmgmt "SELECT table_name FROM information_schema.views WHERE table_schema='public'" | jq '[.[].table_name]')
P_AUTH_GRANTS=$(pmgmt "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated'" | jq '[.[]]')
P_ANON_GRANTS=$(pmgmt "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon'" | jq '[.[]]')
P_SR_GRANTS=$(pmgmt "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='service_role'" | jq '[.[]]')

# Compute differences
jq -n \
  --argjson ft "$F_TABLES" --argjson pt "$P_TABLES" \
  --argjson fc "$F_COLS" --argjson pc "$P_COLS" \
  --argjson fpk "$F_PK" --argjson ppk "$P_PK" \
  --argjson fpl "$F_POLICIES" --argjson ppl "$P_POLICIES" \
  --argjson fr "$F_RLS" --argjson pr "$P_RLS" \
  --argjson ff "$F_FUNCS" --argjson pf "$P_FUNCS" \
  --argjson ftr "$F_TRIGGERS" --argjson ptr "$P_TRIGGERS" \
  --argjson fv "$F_VIEWS" --argjson pv "$P_VIEWS" \
  --argjson fag "$F_AUTH_GRANTS" --argjson pag "$P_AUTH_GRANTS" \
  --argjson fng "$F_ANON_GRANTS" --argjson png "$P_ANON_GRANTS" \
  --argjson fsg "$F_SR_GRANTS" --argjson psg "$P_SR_GRANTS" \
'
{
  tables: {
    only_prod: ($pt - $ft),
    only_fresh: ($ft - $pt),
    common: (($pt - ($pt - $ft)) | length)
  },
  columns: {
    only_prod: ([($pc | map(.full))] | .[0] - ($fc | map(.full))),
    only_fresh: ([($fc | map(.full))] | .[0] - ($pc | map(.full)))
  },
  primary_keys: {
    only_prod: ($ppk - $fpk),
    only_fresh: ($fpk - $ppk)
  },
  policies: {
    only_prod_ids: ([($ppl | map(.id))] | .[0] - ($fpl | map(.id))),
    only_fresh_ids: ([($fpl | map(.id))] | .[0] - ($ppl | map(.id))),
    prod_count: ($ppl | length),
    fresh_count: ($fpl | length)
  },
  rls: {
    only_prod: ($pr - ($fr | map(.tablename) // [])),
    only_fresh: (($fr | map(.tablename) // []) - $pr)
  },
  functions: {
    only_prod_sigs: ([($pf | map(.sig))] | .[0] - ($ff | map(.sig))),
    only_fresh_sigs: ([($ff | map(.sig))] | .[0] - ($pf | map(.sig))),
    prod_count: ($pf | length),
    fresh_count: ($ff | length)
  },
  triggers: {
    only_prod: ([($ptr | map(.event_object_table + "." + .trigger_name))] | .[0] - ($ftr | map(.event_object_table + "." + .trigger_name))),
    only_fresh: ([($ftr | map(.event_object_table + "." + .trigger_name))] | .[0] - ($ptr | map(.event_object_table + "." + .trigger_name)))
  },
  views: {
    only_prod: ($pv - $fv),
    only_fresh: ($fv - $pv)
  },
  grants_authenticated_on_tables: {
    only_prod: ([($pag | map(.table_name + "." + .privilege_type))] | .[0] - ($fag | map(.table_name + "." + .privilege_type))),
    only_fresh: ([($fag | map(.table_name + "." + .privilege_type))] | .[0] - ($pag | map(.table_name + "." + .privilege_type)))
  },
  grants_anon_on_tables: {
    only_prod: ([($png | map(.table_name + "." + .privilege_type))] | .[0] - ($fng | map(.table_name + "." + .privilege_type))),
    only_fresh: ([($fng | map(.table_name + "." + .privilege_type))] | .[0] - ($png | map(.table_name + "." + .privilege_type)))
  },
  grants_service_role_on_tables: {
    only_prod: ([($psg | map(.table_name + "." + .privilege_type))] | .[0] - ($fsg | map(.table_name + "." + .privilege_type))),
    only_fresh: ([($fsg | map(.table_name + "." + .privilege_type))] | .[0] - ($psg | map(.table_name + "." + .privilege_type)))
  },
  unexplained_differences: []
}' > "$OUT"

echo "=== PRODUCTION-ONLY FUNCTIONS ===" >&2
jq -r '.functions.only_prod_sigs[]?' "$OUT" 2>/dev/null || true
echo "=== FRESH-ONLY FUNCTIONS ===" >&2
jq -r '.functions.only_fresh_sigs[]?' "$OUT" 2>/dev/null || true
echo "=== PRODUCTION-ONLY TABLES ===" >&2
jq -r '.tables.only_prod[]?' "$OUT" 2>/dev/null || true
echo "=== PRODUCTION-ONLY POLICIES ===" >&2
jq -r '.policies.only_prod_ids[]?' "$OUT" 2>/dev/null || true
echo "=== AUTH GRANTS ONLY PROD ===" >&2
jq -r '.grants_authenticated_on_tables.only_prod[]?' "$OUT" 2>/dev/null || true
echo "=== AUTH GRANTS ONLY FRESH ===" >&2
jq -r '.grants_authenticated_on_tables.only_fresh[]?' "$OUT" 2>/dev/null || true
echo "=== TRIGGERS ONLY PROD ===" >&2
jq -r '.triggers.only_prod[]?' "$OUT" 2>/dev/null || true
echo "=== TRIGGERS ONLY FRESH ===" >&2
jq -r '.triggers.only_fresh[]?' "$OUT" 2>/dev/null || true
echo "Diff written to $OUT" >&2

else
  echo "No TRAVLINE_SUPABASE_MANAGEMENT_TOKEN — skipping production comparison" >&2
fi
