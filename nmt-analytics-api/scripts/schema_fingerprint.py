#!/usr/bin/env python3
"""
Schema fingerprint: fresh replay vs production (Travline).

Read-only. No row data, no secrets. Production is read through the Supabase
Management API; the fresh replay is read through local psql against the
disposable replay database.

Output: docs/migrations/fresh-vs-production-schema-diff.json
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "nmt-analytics-api", "docs", "migrations",
                   "fresh-vs-production-schema-diff.json")
EXPLANATIONS = os.path.join(ROOT, "nmt-analytics-api", "docs", "migrations",
                            "schema-diff-explanations.json")
MGT_TOKEN = os.environ.get("TRAVLINE_SUPABASE_MANAGEMENT_TOKEN", "")
REF = "hacutwknfgufrqlgdiia"
FRESH_DB = "travline_replay"

# Extension-owned functions/objects in public schema (platform, category C).
EXTENSION_PREFIXES = {
    "armor", "crypt", "dearmor", "decrypt", "decrypt_iv", "digest", "encrypt",
    "encrypt_iv", "gen_random_bytes", "gen_random_uuid", "gen_salt", "hmac",
    "pgp_", "uuid_generate_", "uuid_nil", "uuid_ns_",
}


def mgmt_query(sql):
    if not MGT_TOKEN:
        raise RuntimeError("TRAVLINE_SUPABASE_MANAGEMENT_TOKEN not set")
    fd, body = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    with open(body, "w") as f:
        json.dump({"query": sql}, f)
    url = f"https://api.supabase.com/v1/projects/{REF}/database/query"
    out = subprocess.run(
        ["curl", "-sf", "-H", f"Authorization: Bearer {MGT_TOKEN}",
         "-H", "Content-Type: application/json", "--data", f"@{body}", url],
        capture_output=True, text=True, timeout=90,
    )
    os.unlink(body)
    if out.returncode != 0:
        raise RuntimeError(f"mgmt_query failed: {out.stderr[:400]}")
    txt = out.stdout.strip()
    if not txt:
        return []
    return json.loads(txt)


def psql(sql):
    out = subprocess.run(
        ["su", "-", "postgres", "-c",
         f"psql -At -d {FRESH_DB} -c \"{sql}\""],
        capture_output=True, text=True, timeout=90,
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr[:400]}")
    txt = out.stdout.strip()
    if not txt or txt == "NULL":
        return []
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return []


def agg(cols):
    return ", ".join(cols)


def mgmt_json_array(sql):
    rows = mgmt_query(sql)
    return rows


# ---------------------------------------------------------------------------
# Collect production metadata
# ---------------------------------------------------------------------------
print("collecting production metadata...", file=sys.stderr) if False else None

def _p(sql):
    return mgmt_query(sql)


# Tables
PROD_TABLES = sorted(r["table_name"] for r in _p(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"))

# Columns
PROD_COLUMNS = _p(
    "SELECT table_name, column_name, data_type, is_nullable, column_default, "
    "is_generated, generation_expression, udt_name "
    "FROM information_schema.columns WHERE table_schema='public' "
    "ORDER BY table_name, ordinal_position")

# PK
PROD_PK = _p(
    "SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu "
    "ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
    "WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' "
    "ORDER BY kcu.table_name, kcu.ordinal_position")

# FK
PROD_FK = _p(
    "SELECT tc.table_name, kcu.column_name, ccu.table_name AS ftable, ccu.column_name AS fcolumn "
    "FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name "
    "JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name "
    "WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' "
    "ORDER BY tc.table_name, kcu.column_name")

# Unique
PROD_UNIQUE = _p(
    "SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name "
    "WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public' "
    "ORDER BY tc.table_name, kcu.ordinal_position")

# Check
PROD_CHECK = _p(
    "SELECT tc.table_name, cc.check_clause FROM information_schema.table_constraints tc "
    "JOIN information_schema.check_constraints cc ON tc.constraint_name=cc.constraint_name "
    "WHERE tc.constraint_type='CHECK' AND tc.table_schema='public' "
    "ORDER BY tc.table_name")

# Indexes (exclude constraint-backing indexes)
PROD_INDEXES = _p(
    "SELECT i.relname AS indexname, t.relname AS tablename, pg_get_indexdef(i.oid) AS indexdef "
    "FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid "
    "JOIN pg_class t ON t.oid=x.indrelid "
    "JOIN pg_namespace n ON n.oid=t.relnamespace "
    "WHERE n.nspname='public' AND NOT x.indisprimary AND NOT x.indisunique "
    "ORDER BY t.relname, i.relname")

# RLS
PROD_RLS = _p(
    "SELECT c.relname AS tablename, c.relrowsecurity AS rls, c.relforcerowsecurity AS force "
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")

# Policies
PROD_POLICIES = _p(
    "SELECT tablename, policyname, cmd, roles, qual AS using, with_check AS check "
    "FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname")

# Functions
PROD_FUNCTIONS = _p(
    "SELECT p.proname, pg_get_function_arguments(p.oid) AS args, "
    "pg_get_function_result(p.oid) AS ret, p.prosecdef AS secdef, "
    "p.provolatile AS volatility, COALESCE(p.proconfig::text,'') AS proconfig, "
    "md5(pg_get_functiondef(p.oid)) AS defhash "
    "FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid "
    "WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname, pg_get_function_arguments(p.oid)")

# Triggers
PROD_TRIGGERS = _p(
    "SELECT event_object_table AS tablename, trigger_name, "
    "action_statement AS def "
    "FROM information_schema.triggers WHERE trigger_schema='public' "
    "ORDER BY event_object_table, trigger_name")

# Views
PROD_VIEWS = _p(
    "SELECT table_name, view_definition FROM information_schema.views "
    "WHERE table_schema='public' ORDER BY table_name")

# Grants
PROD_GRANTS = _p(
    "SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants "
    "WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') "
    "ORDER BY table_name, grantee, privilege_type")

# ---------------------------------------------------------------------------
# Collect fresh replay metadata
# ---------------------------------------------------------------------------
print("collecting fresh replay metadata...", file=sys.stderr)

FRESH_TABLES = sorted(r["table_name"] for r in psql(
    "SELECT json_agg(row_to_json(t)) FROM (SELECT table_name FROM information_schema.tables "
    "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name) t"))

FRESH_COLUMNS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT table_name, column_name, data_type, is_nullable, "
    "column_default, is_generated, generation_expression, udt_name "
    "FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) r")

FRESH_PK = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT kcu.table_name, kcu.column_name "
    "FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu "
    "ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
    "WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' ORDER BY kcu.table_name, kcu.ordinal_position) r")

FRESH_FK = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name, kcu.column_name, "
    "ccu.table_name AS ftable, ccu.column_name AS fcolumn "
    "FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu "
    "ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu "
    "ON tc.constraint_name=ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' "
    "AND tc.table_schema='public' ORDER BY tc.table_name, kcu.column_name) r")

FRESH_UNIQUE = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name, kcu.column_name "
    "FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu "
    "ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='UNIQUE' "
    "AND tc.table_schema='public' ORDER BY tc.table_name, kcu.ordinal_position) r")

FRESH_CHECK = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT tc.table_name, cc.check_clause "
    "FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc "
    "ON tc.constraint_name=cc.constraint_name WHERE tc.constraint_type='CHECK' "
    "AND tc.table_schema='public' ORDER BY tc.table_name) r")

FRESH_INDEXES = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT i.relname AS indexname, t.relname AS tablename, "
    "pg_get_indexdef(i.oid) AS indexdef FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid "
    "JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace "
    "WHERE n.nspname='public' AND NOT x.indisprimary AND NOT x.indisunique "
    "ORDER BY t.relname, i.relname) r")

FRESH_RLS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT c.relname AS tablename, "
    "c.relrowsecurity AS rls, c.relforcerowsecurity AS force FROM pg_class c "
    "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' "
    "ORDER BY c.relname) r")

FRESH_POLICIES = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT tablename, policyname, cmd, roles, "
    "qual AS using, with_check AS check FROM pg_policies WHERE schemaname='public' "
    "ORDER BY tablename, policyname) r")

FRESH_FUNCTIONS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT p.proname, pg_get_function_arguments(p.oid) AS args, "
    "pg_get_function_result(p.oid) AS ret, p.prosecdef AS secdef, p.provolatile AS volatility, "
    "COALESCE(p.proconfig::text,'') AS proconfig, md5(pg_get_functiondef(p.oid)) AS defhash "
    "FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' "
    "AND p.prokind='f' ORDER BY p.proname, pg_get_function_arguments(p.oid)) r")

FRESH_TRIGGERS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT event_object_table AS tablename, trigger_name, "
    "action_statement AS def FROM information_schema.triggers WHERE trigger_schema='public' "
    "ORDER BY event_object_table, trigger_name) r")

FRESH_VIEWS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT table_name, view_definition "
    "FROM information_schema.views WHERE table_schema='public' ORDER BY table_name) r")

FRESH_GRANTS = psql(
    "SELECT json_agg(row_to_json(r)) FROM (SELECT table_name, grantee, privilege_type "
    "FROM information_schema.role_table_grants WHERE table_schema='public' "
    "AND grantee IN ('anon','authenticated','service_role') "
    "ORDER BY table_name, grantee, privilege_type) r")


def key_rows(rows, keys):
    return {(tuple(str(r.get(k)) for k in keys)): r for r in rows}


def diff_sets(prod, fresh, keys, label_key):
    pk = key_rows(prod, keys)
    fk = key_rows(fresh, keys)
    only_prod = [pk[k] for k in sorted(pk.keys() - fk.keys())]
    only_fresh = [fk[k] for k in sorted(fk.keys() - pk.keys())]
    return only_prod, only_fresh


def is_platform_function(name):
    return any(name.startswith(p) for p in EXTENSION_PREFIXES) or name == "pgrst_reload_schema"


# Build normalized diffs
print("building diff...", file=sys.stderr)

tables_only_prod = sorted(set(PROD_TABLES) - set(FRESH_TABLES))
tables_only_fresh = sorted(set(FRESH_TABLES) - set(PROD_TABLES))

# Columns: key = table|column
prod_col_keys = {(r["table_name"], r["column_name"]) for r in PROD_COLUMNS}
fresh_col_keys = {(r["table_name"], r["column_name"]) for r in FRESH_COLUMNS}
col_only_prod = sorted(prod_col_keys - fresh_col_keys)
col_only_fresh = sorted(fresh_col_keys - prod_col_keys)
col_changed = []
for k in prod_col_keys & fresh_col_keys:
    p = next(r for r in PROD_COLUMNS if (r["table_name"], r["column_name"]) == k)
    f = next(r for r in FRESH_COLUMNS if (r["table_name"], r["column_name"]) == k)
    pf = {x: (p.get(x)) for x in ("data_type", "is_nullable", "column_default", "is_generated", "generation_expression", "udt_name")}
    ff = {x: (f.get(x)) for x in ("data_type", "is_nullable", "column_default", "is_generated", "generation_expression", "udt_name")}
    if pf != ff:
        col_changed.append({"table": k[0], "column": k[1], "prod": pf, "fresh": ff})

# Constraints
def constraint_key(row, cols):
    return tuple(str(row.get(c)) for c in cols)

prod_pk_keys = {constraint_key(r, ("table_name", "column_name")) for r in PROD_PK}
fresh_pk_keys = {constraint_key(r, ("table_name", "column_name")) for r in FRESH_PK}
pk_only_prod = sorted(prod_pk_keys - fresh_pk_keys)
pk_only_fresh = sorted(fresh_pk_keys - prod_pk_keys)

prod_fk_keys = {constraint_key(r, ("table_name", "column_name", "ftable", "fcolumn")) for r in PROD_FK}
fresh_fk_keys = {constraint_key(r, ("table_name", "column_name", "ftable", "fcolumn")) for r in FRESH_FK}
fk_only_prod = sorted(prod_fk_keys - fresh_fk_keys)
fk_only_fresh = sorted(fresh_fk_keys - prod_fk_keys)

prod_uq_keys = {constraint_key(r, ("table_name", "column_name")) for r in PROD_UNIQUE}
fresh_uq_keys = {constraint_key(r, ("table_name", "column_name")) for r in FRESH_UNIQUE}
uq_only_prod = sorted(prod_uq_keys - fresh_uq_keys)
uq_only_fresh = sorted(fresh_uq_keys - prod_uq_keys)

prod_ck_keys = {constraint_key(r, ("table_name", "check_clause")) for r in PROD_CHECK}
fresh_ck_keys = {constraint_key(r, ("table_name", "check_clause")) for r in FRESH_CHECK}
ck_only_prod = sorted(prod_ck_keys - fresh_ck_keys)
ck_only_fresh = sorted(fresh_ck_keys - prod_ck_keys)

# Indexes: normalize by removing constraint-backed, compare by table + column def normalized
def norm_indexdef(d):
    return d.replace(" USING btree", "").strip()

prod_idx_keys = {(r["tablename"], norm_indexdef(r["indexdef"])) for r in PROD_INDEXES}
fresh_idx_keys = {(r["tablename"], norm_indexdef(r["indexdef"])) for r in FRESH_INDEXES}
idx_only_prod = sorted(prod_idx_keys - fresh_idx_keys)
idx_only_fresh = sorted(fresh_idx_keys - prod_idx_keys)

# RLS
prod_rls = {r["tablename"]: (r["rls"], r["force"]) for r in PROD_RLS}
fresh_rls = {r["tablename"]: (r["rls"], r["force"]) for r in FRESH_RLS}
rls_diff = []
for t in sorted(set(prod_rls) | set(fresh_rls)):
    if prod_rls.get(t) != fresh_rls.get(t):
        rls_diff.append({"table": t, "prod": prod_rls.get(t), "fresh": fresh_rls.get(t)})

# Policies: key = table|policy|cmd|using|check
def policy_key(r):
    return (r["tablename"], r["policyname"], r["cmd"], r["using"], r["check"])

prod_pol_keys = {policy_key(r) for r in PROD_POLICIES}
fresh_pol_keys = {policy_key(r) for r in FRESH_POLICIES}
pol_only_prod = sorted(prod_pol_keys - fresh_pol_keys)
pol_only_fresh = sorted(fresh_pol_keys - prod_pol_keys)

# Functions: key = name|args (full signature), compare defhash
def func_sig(r):
    return (r["proname"], r["args"])

prod_func = {func_sig(r): r for r in PROD_FUNCTIONS}
fresh_func = {func_sig(r): r for r in FRESH_FUNCTIONS}
func_only_prod = [s for s in sorted(prod_func.keys() - fresh_func.keys())
                  if not is_platform_function(s[0])]
func_only_fresh = [s for s in sorted(fresh_func.keys() - prod_func.keys())
                   if not is_platform_function(s[0])]
func_changed = []
for s in prod_func.keys() & fresh_func.keys():
    p = prod_func[s]
    f = fresh_func[s]
    if p.get("defhash") != f.get("defhash"):
        func_changed.append({"name": s[0], "args": s[1],
                             "prod_secdef": p.get("secdef"), "fresh_secdef": f.get("secdef"),
                             "prod_defhash": p.get("defhash"), "fresh_defhash": f.get("defhash")})

# Triggers: key = table|name
def trig_key(r):
    return (r["tablename"], r["trigger_name"])

prod_trig = {trig_key(r): r for r in PROD_TRIGGERS}
fresh_trig = {trig_key(r): r for r in FRESH_TRIGGERS}
trig_only_prod = sorted(prod_trig.keys() - fresh_trig.keys())
trig_only_fresh = sorted(fresh_trig.keys() - prod_trig.keys())

# Views
prod_views = {r["table_name"]: r["view_definition"] for r in PROD_VIEWS}
fresh_views = {r["table_name"]: r["view_definition"] for r in FRESH_VIEWS}
view_only_prod = sorted(set(prod_views) - set(fresh_views))
view_only_fresh = sorted(set(fresh_views) - set(prod_views))
view_changed = [{"view": t, "prod": prod_views[t], "fresh": fresh_views[t]}
                for t in sorted(set(prod_views) & set(fresh_views))
                if prod_views[t] != fresh_views[t]]

# Grants: key = table|role|priv
def grant_key(r):
    return (r["table_name"], r["grantee"], r["privilege_type"])

prod_grant = {grant_key(r) for r in PROD_GRANTS}
fresh_grant = {grant_key(r) for r in FRESH_GRANTS}
grant_only_prod = sorted(prod_grant - fresh_grant)
grant_only_fresh = sorted(fresh_grant - prod_grant)

result = {
    "summary": {
        "prod_tables": len(PROD_TABLES),
        "fresh_tables": len(FRESH_TABLES),
        "prod_functions": len(PROD_FUNCTIONS),
        "fresh_functions": len(FRESH_FUNCTIONS),
    },
    "differences": {
        "tables": {"only_prod": tables_only_prod, "only_fresh": tables_only_fresh},
        "columns": {"only_prod": col_only_prod, "only_fresh": col_only_fresh, "changed": col_changed},
        "constraints": {
            "pk_only_prod": pk_only_prod, "pk_only_fresh": pk_only_fresh,
            "fk_only_prod": fk_only_prod, "fk_only_fresh": fk_only_fresh,
            "unique_only_prod": uq_only_prod, "unique_only_fresh": uq_only_fresh,
            "check_only_prod": ck_only_prod, "check_only_fresh": ck_only_fresh,
        },
        "indexes": {"only_prod": idx_only_prod, "only_fresh": idx_only_fresh},
        "rls": rls_diff,
        "policies": {"only_prod": pol_only_prod, "only_fresh": pol_only_fresh},
        "functions": {"only_prod": func_only_prod, "only_fresh": func_only_fresh, "changed": func_changed},
        "triggers": {"only_prod": trig_only_prod, "only_fresh": trig_only_fresh},
        "views": {"only_prod": view_only_prod, "only_fresh": view_only_fresh, "changed": view_changed},
        "grants": {"only_prod": grant_only_prod, "only_fresh": grant_only_fresh},
    },
}

# ---------------------------------------------------------------------------
# Load explanation allowlist and compute unexplained differences
# ---------------------------------------------------------------------------
print("applying explanation allowlist...", file=sys.stderr)
explained = []
try:
    with open(EXPLANATIONS) as f:
        explanations = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    explanations = []

allow = {}
for e in explanations:
    allow[(e.get("category", ""), e.get("object_type", ""), e.get("object", ""))] = e

unexplained = []
for cat, only_prod in [
    ("tables", tables_only_prod),
]:
    for o in only_prod:
        key = ("D", "table", o)
        if key in allow:
            explained.append({"object": o, "category": "table", "note": allow[key].get("reason", "")})
        else:
            unexplained.append({"object": o, "category": "table"})

for sig in func_only_prod:
    key = ("D", "function", f"{sig[0]}({sig[1]})")
    if key in allow:
        explained.append({"object": f"{sig[0]}({sig[1]})", "category": "function", "note": allow[key].get("reason", "")})
    else:
        unexplained.append({"object": f"{sig[0]}({sig[1]})", "category": "function"})

for t in trig_only_prod:
    key = ("D", "trigger", f"{t[0]}.{t[1]}")
    if key in allow:
        explained.append({"object": f"{t[0]}.{t[1]}", "category": "trigger", "note": allow[key].get("reason", "")})
    else:
        unexplained.append({"object": f"{t[0]}.{t[1]}", "category": "trigger"})

result["explained_differences"] = explained
result["unexplained_differences"] = unexplained

with open(OUT, "w") as f:
    json.dump(result, f, indent=2, sort_keys=True)

print(f"written to {OUT}", file=sys.stderr)
print(f"unexplained_differences: {len(unexplained)}", file=sys.stderr)
