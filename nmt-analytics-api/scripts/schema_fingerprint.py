#!/usr/bin/env python3
"""
Schema fingerprint: fresh replay vs production (Travline).

Read-only. No row data, no secrets. Production is read through the Supabase
Management API; the fresh replay is read through local psql against the
disposable replay database.

Every raw difference (table, column, constraint, index, RLS, policy, function,
trigger, view, grant) is normalized into a common record and passed through the
explanation allowlist. The script fails non-zero if:

  * any raw difference is left unexplained, or
  * the completeness invariant (raw == explained + unexplained) is violated.

Output: docs/migrations/fresh-vs-production-schema-diff.json
"""
import json
import os
import re
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


def _p(sql):
    return mgmt_query(sql)


# ---------------------------------------------------------------------------
# Collect production metadata
# ---------------------------------------------------------------------------
print("collecting production metadata...", file=sys.stderr)

PROD_TABLES = sorted(r["table_name"] for r in _p(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"))

PROD_COLUMNS = _p(
    "SELECT table_name, column_name, data_type, is_nullable, column_default, "
    "is_generated, generation_expression, udt_name "
    "FROM information_schema.columns WHERE table_schema='public' "
    "ORDER BY table_name, ordinal_position")

PROD_PK = _p(
    "SELECT kcu.table_name, kcu.column_name FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu "
    "ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema "
    "WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' "
    "ORDER BY kcu.table_name, kcu.ordinal_position")

PROD_FK = _p(
    "SELECT tc.table_name, kcu.column_name, ccu.table_name AS ftable, ccu.column_name AS fcolumn "
    "FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name "
    "JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name "
    "WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' "
    "ORDER BY tc.table_name, kcu.column_name")

PROD_UNIQUE = _p(
    "SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name "
    "WHERE tc.constraint_type='UNIQUE' AND tc.table_schema='public' "
    "ORDER BY tc.table_name, kcu.ordinal_position")

PROD_CHECK = _p(
    "SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid, true) AS check_clause "
    "FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid "
    "JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='public' AND con.contype='c' "
    "AND con.conname NOT LIKE '%_not_null' "
    "ORDER BY c.relname, con.conname")

PROD_INDEXES = _p(
    "SELECT i.relname AS indexname, t.relname AS tablename, pg_get_indexdef(i.oid) AS indexdef "
    "FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid "
    "JOIN pg_class t ON t.oid=x.indrelid "
    "JOIN pg_namespace n ON n.oid=t.relnamespace "
    "WHERE n.nspname='public' AND NOT x.indisprimary AND NOT x.indisunique "
    "ORDER BY t.relname, i.relname")

PROD_RLS = _p(
    "SELECT c.relname AS tablename, c.relrowsecurity AS rls, c.relforcerowsecurity AS force "
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")

PROD_POLICIES = _p(
    "SELECT tablename, policyname, cmd, roles, qual AS using, with_check AS check "
    "FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname")

PROD_FUNCTIONS = _p(
    "SELECT p.proname, pg_get_function_arguments(p.oid) AS args, "
    "pg_get_function_result(p.oid) AS ret, p.prosecdef AS secdef, "
    "p.provolatile AS volatility, COALESCE(p.proconfig::text,'') AS proconfig, "
    "pg_get_functiondef(p.oid) AS definition, e.extname AS extension_name "
    "FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid "
    "LEFT JOIN pg_depend d ON d.objid=p.oid AND d.deptype='e' "
    "LEFT JOIN pg_extension e ON e.oid=d.refobjid "
    "WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname, pg_get_function_arguments(p.oid)")

PROD_TRIGGERS = _p(
    "SELECT event_object_table AS tablename, trigger_name, "
    "action_statement AS def "
    "FROM information_schema.triggers WHERE trigger_schema='public' "
    "ORDER BY event_object_table, trigger_name")

PROD_VIEWS = _p(
    "SELECT table_name, view_definition FROM information_schema.views "
    "WHERE table_schema='public' ORDER BY table_name")

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
    "SELECT json_agg(row_to_json(r)) FROM (SELECT c.relname AS table_name, con.conname, "
    "pg_get_constraintdef(con.oid, true) AS check_clause "
    "FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid "
    "JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE n.nspname='public' AND con.contype='c' "
    "AND con.conname NOT LIKE '%_not_null' "
    "ORDER BY c.relname, con.conname) r")

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
    "COALESCE(p.proconfig::text,'') AS proconfig, pg_get_functiondef(p.oid) AS definition, "
    "e.extname AS extension_name "
    "FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid "
    "LEFT JOIN pg_depend d ON d.objid=p.oid AND d.deptype='e' "
    "LEFT JOIN pg_extension e ON e.oid=d.refobjid "
    "WHERE n.nspname='public' "
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


# ---------------------------------------------------------------------------
# Normalized diff building. Every difference becomes a flat record:
#   {"object_type", "direction", "object", "details"}
# ---------------------------------------------------------------------------
print("building diff...", file=sys.stderr)


def norm_sql(s):
    if s is None:
        return ""
    s = s.strip()
    s = re.sub(r"\bpublic\.", "", s)
    s = re.sub(r"::(text|uuid|jsonb|numeric|integer|bigint|timestamp with time zone|date|boolean)\b", "", s)
    s = re.sub(r"\bARRAY\[([^\]]+)\]", r"ARRAY[\1]", s)
    s = re.sub(r"\s+", " ", s)
    previous = None
    while previous != s:
        previous = s
        s = re.sub(r"\(\(([^()]+)\)\)", r"(\1)", s)
    return s


def norm_indexdef(d):
    s = norm_sql(d)
    s = re.sub(r"^CREATE\s+(UNIQUE\s+)?INDEX\s+\S+\s+ON\s+", r"CREATE \1INDEX ON ", s, flags=re.I)
    s = s.replace(" USING btree ", " ")
    return s.strip()


def norm_check_clause(s):
    return norm_sql(s)


def norm_func_def(s):
    s = norm_sql(s)
    s = re.sub(r"\s*--.*", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def col_fingerprint(r):
    fp = {x: r.get(x) for x in
            ("data_type", "is_nullable", "column_default", "is_generated",
             "generation_expression", "udt_name")}
    fp["column_default"] = norm_sql(fp.get("column_default"))
    fp["generation_expression"] = norm_sql(fp.get("generation_expression"))
    return fp


RAW = []  # list of normalized diff records


def emit(object_type, direction, obj, details=None):
    RAW.append({"object_type": object_type, "direction": direction,
                "object": obj, "details": details or {}})


# --- tables
tables_only_prod = sorted(set(PROD_TABLES) - set(FRESH_TABLES))
tables_only_fresh = sorted(set(FRESH_TABLES) - set(PROD_TABLES))
for t in tables_only_prod:
    emit("table", "only_prod", t)
for t in tables_only_fresh:
    emit("table", "only_fresh", t)

# --- columns
prod_col = {(r["table_name"], r["column_name"]): r for r in PROD_COLUMNS}
fresh_col = {(r["table_name"], r["column_name"]): r for r in FRESH_COLUMNS}
for k in sorted(set(prod_col) - set(fresh_col)):
    emit("column", "only_prod", f"{k[0]}.{k[1]}")
for k in sorted(set(fresh_col) - set(prod_col)):
    emit("column", "only_fresh", f"{k[0]}.{k[1]}")
for k in sorted(set(prod_col) & set(fresh_col)):
    pf = col_fingerprint(prod_col[k])
    ff = col_fingerprint(fresh_col[k])
    if pf != ff:
        emit("column", "changed", f"{k[0]}.{k[1]}", {"prod": pf, "fresh": ff})

# --- constraints
prod_pk = {(r["table_name"], r["column_name"]) for r in PROD_PK}
fresh_pk = {(r["table_name"], r["column_name"]) for r in FRESH_PK}
for k in sorted(prod_pk - fresh_pk):
    emit("primary_key", "only_prod", f"{k[0]}.{k[1]}")
for k in sorted(fresh_pk - prod_pk):
    emit("primary_key", "only_fresh", f"{k[0]}.{k[1]}")

prod_fk = {(r["table_name"], r["column_name"], r["ftable"], r["fcolumn"]) for r in PROD_FK}
fresh_fk = {(r["table_name"], r["column_name"], r["ftable"], r["fcolumn"]) for r in FRESH_FK}
for k in sorted(prod_fk - fresh_fk):
    emit("foreign_key", "only_prod", f"{k[0]}.{k[1]}->{k[2]}.{k[3]}")
for k in sorted(fresh_fk - prod_fk):
    emit("foreign_key", "only_fresh", f"{k[0]}.{k[1]}->{k[2]}.{k[3]}")

prod_uq = {(r["table_name"], r["column_name"]) for r in PROD_UNIQUE}
fresh_uq = {(r["table_name"], r["column_name"]) for r in FRESH_UNIQUE}
for k in sorted(prod_uq - fresh_uq):
    emit("unique_constraint", "only_prod", f"{k[0]}.{k[1]}")
for k in sorted(fresh_uq - prod_uq):
    emit("unique_constraint", "only_fresh", f"{k[0]}.{k[1]}")

prod_ck = {(r["table_name"], norm_check_clause(r["check_clause"])) for r in PROD_CHECK}
fresh_ck = {(r["table_name"], norm_check_clause(r["check_clause"])) for r in FRESH_CHECK}
for k in sorted(prod_ck - fresh_ck):
    emit("check_constraint", "only_prod", f"{k[0]}::{k[1]}")
for k in sorted(fresh_ck - prod_ck):
    emit("check_constraint", "only_fresh", f"{k[0]}::{k[1]}")

# --- indexes
prod_idx = {(r["tablename"], norm_indexdef(r["indexdef"])) for r in PROD_INDEXES}
fresh_idx = {(r["tablename"], norm_indexdef(r["indexdef"])) for r in FRESH_INDEXES}
for k in sorted(prod_idx - fresh_idx):
    emit("index", "only_prod", f"{k[0]}::{k[1]}")
for k in sorted(fresh_idx - prod_idx):
    emit("index", "only_fresh", f"{k[0]}::{k[1]}")

# --- RLS
prod_rls = {r["tablename"]: (r["rls"], r["force"]) for r in PROD_RLS}
fresh_rls = {r["tablename"]: (r["rls"], r["force"]) for r in FRESH_RLS}
for t in sorted(set(prod_rls) | set(fresh_rls)):
    if prod_rls.get(t) != fresh_rls.get(t):
        emit("rls", "changed", t, {"prod": prod_rls.get(t), "fresh": fresh_rls.get(t)})

# --- policies
def policy_key(r):
    return (r["tablename"], r["policyname"], r["cmd"], r["using"], r["check"])

prod_pol = {policy_key(r) for r in PROD_POLICIES}
fresh_pol = {policy_key(r) for r in FRESH_POLICIES}
for k in sorted(prod_pol - fresh_pol):
    emit("policy", "only_prod", f"{k[0]}.{k[1]}")
for k in sorted(fresh_pol - prod_pol):
    emit("policy", "only_fresh", f"{k[0]}.{k[1]}")

# --- functions (full signature; defhash for changed)
def func_sig(r):
    return (r["proname"], r["args"])

prod_func = {func_sig(r): r for r in PROD_FUNCTIONS}
fresh_func = {func_sig(r): r for r in FRESH_FUNCTIONS}
for s in sorted(set(prod_func) - set(fresh_func)):
    p = prod_func[s]
    emit("function", "only_prod", f"{s[0]}({s[1]})",
         {"prod_extension": p.get("extension_name")})
for s in sorted(set(fresh_func) - set(prod_func)):
    f = fresh_func[s]
    emit("function", "only_fresh", f"{s[0]}({s[1]})",
         {"fresh_extension": f.get("extension_name")})
for s in sorted(set(prod_func) & set(fresh_func)):
    p = prod_func[s]
    f = fresh_func[s]
    p_fp = {
        "ret": p.get("ret"),
        "secdef": p.get("secdef"),
        "volatility": p.get("volatility"),
        "proconfig": norm_sql(p.get("proconfig")),
        "definition": norm_func_def(p.get("definition")),
        "extension_name": p.get("extension_name"),
    }
    f_fp = {
        "ret": f.get("ret"),
        "secdef": f.get("secdef"),
        "volatility": f.get("volatility"),
        "proconfig": norm_sql(f.get("proconfig")),
        "definition": norm_func_def(f.get("definition")),
        "extension_name": f.get("extension_name"),
    }
    if p_fp != f_fp:
        emit("function", "changed", f"{s[0]}({s[1]})",
             {"prod": {k: v for k, v in p_fp.items() if k != "definition"},
              "fresh": {k: v for k, v in f_fp.items() if k != "definition"}})

# --- triggers
def trig_key(r):
    return (r["tablename"], r["trigger_name"])

prod_trig = {trig_key(r) for r in PROD_TRIGGERS}
fresh_trig = {trig_key(r) for r in FRESH_TRIGGERS}
for k in sorted(prod_trig - fresh_trig):
    emit("trigger", "only_prod", f"{k[0]}.{k[1]}")
for k in sorted(fresh_trig - prod_trig):
    emit("trigger", "only_fresh", f"{k[0]}.{k[1]}")

# --- views
prod_views = {r["table_name"]: r["view_definition"] for r in PROD_VIEWS}
fresh_views = {r["table_name"]: r["view_definition"] for r in FRESH_VIEWS}
for v in sorted(set(prod_views) - set(fresh_views)):
    emit("view", "only_prod", v)
for v in sorted(set(fresh_views) - set(prod_views)):
    emit("view", "only_fresh", v)
for v in sorted(set(prod_views) & set(fresh_views)):
    if prod_views[v] != fresh_views[v]:
        emit("view", "changed", v, {"prod": prod_views[v], "fresh": fresh_views[v]})

# --- grants
def grant_key(r):
    return (r["table_name"], r["grantee"], r["privilege_type"])

prod_grant = {grant_key(r) for r in PROD_GRANTS}
fresh_grant = {grant_key(r) for r in FRESH_GRANTS}
for k in sorted(prod_grant - fresh_grant):
    emit("grant", "only_prod", f"{k[0]}.{k[1]}.{k[2]}")
for k in sorted(fresh_grant - prod_grant):
    emit("grant", "only_fresh", f"{k[0]}.{k[1]}.{k[2]}")


# ---------------------------------------------------------------------------
# Classification: every raw diff is matched against the explanation allowlist.
# ---------------------------------------------------------------------------
print("applying explanation allowlist...", file=sys.stderr)
try:
    with open(EXPLANATIONS) as f:
        explanations = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    explanations = []

# allowlist keyed by (object_type, object)
allow = {}
for e in explanations:
    key = (e.get("object_type", ""), e.get("object", ""))
    allow[key] = e

explained = []
unexplained = []
for d in RAW:
    key = (d["object_type"], d["object"])
    if key in allow:
        entry = allow[key]
        explained.append({
            "object_type": d["object_type"],
            "direction": d["direction"],
            "object": d["object"],
            "category": entry.get("category", ""),
            "reason": entry.get("reason", ""),
            "source": entry.get("source", ""),
        })
    else:
        unexplained.append({
            "object_type": d["object_type"],
            "direction": d["direction"],
            "object": d["object"],
            "details": d["details"],
        })

raw_count = len(RAW)
explained_count = len(explained)
unexplained_count = len(unexplained)

result = {
    "summary": {
        "raw_difference_count": raw_count,
        "explained_difference_count": explained_count,
        "unexplained_difference_count": unexplained_count,
        "prod_tables": len(PROD_TABLES),
        "fresh_tables": len(FRESH_TABLES),
        "prod_functions": len(PROD_FUNCTIONS),
        "fresh_functions": len(FRESH_FUNCTIONS),
    },
    "raw_differences": RAW,
    "explained_differences": explained,
    "unexplained_differences": unexplained,
}

with open(OUT, "w") as f:
    json.dump(result, f, indent=2, sort_keys=True)

print(f"written to {OUT}", file=sys.stderr)
print(f"raw: {raw_count}, explained: {explained_count}, "
      f"unexplained: {unexplained_count}", file=sys.stderr)

# Completeness invariant: raw == explained + unexplained
if raw_count != explained_count + unexplained_count:
    print("INVARIANT VIOLATION: raw != explained + unexplained", file=sys.stderr)
    sys.exit(2)

# Fail non-zero if any unexplained difference remains
if unexplained_count > 0:
    print("UNEXPLAINED DIFFERENCES REMAIN", file=sys.stderr)
    for u in unexplained:
        print(f"  {u['object_type']} {u['direction']} {u['object']}", file=sys.stderr)
    sys.exit(1)

print("schema fingerprint: CLEAN (all differences explained)", file=sys.stderr)
