#!/usr/bin/env python3
"""
Read-only production readiness checks for Travline.

  migrations   Compare applied production migrations with supabase/migrations in this repo.
               Needs TRAVLINE_SUPABASE_MANAGEMENT_TOKEN (a Supabase personal access token
               that can read the Travline project). Issues one SELECT on the migration
               ledger. The token is read from the environment only and is never printed.
  health       Read the public /api/health of the deployed API (no credentials) and report
               which integrations the deployment says are configured.

Only the Travline project (REF below) is ever contacted. The script refuses to continue if
that project's name looks like another product, so a wrong token cannot cause a wrong read.

Usage:
  TRAVLINE_SUPABASE_MANAGEMENT_TOKEN=... python3 prod-readiness-check.py migrations
  python3 prod-readiness-check.py health [https://travline-ten.vercel.app]
"""
import json
import os
import re
import subprocess
import sys

REF = "hacutwknfgufrqlgdiia"  # Travline production. Never change this to another project.
API = "https://api.supabase.com/v1"
MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "supabase", "migrations")
LEDGER_SQL = "select version, name from supabase_migrations.schema_migrations order by version"


def _request(url, token=None, body=None):
    """GET/POST via curl (system CA store). Credentials go through stdin, never argv."""
    lines = [f"url = {json.dumps(url)}", 'header = "Accept: application/json"', "silent", "show-error", "fail", "max-time = 60"]
    if token:
        lines.append(f"header = {json.dumps('Authorization: Bearer ' + token)}")
    if body is not None:
        lines.append('header = "Content-Type: application/json"')
        lines.append(f"data = {json.dumps(json.dumps(body))}")
    out = subprocess.run(["curl", "-K", "-"], input="\n".join(lines), capture_output=True, text=True, timeout=90)
    if out.returncode != 0:
        # Exit code only: curl's stderr can echo request details.
        raise SystemExit(f"request failed (curl exit {out.returncode}) for {url.split('?')[0]}")
    return json.loads(out.stdout or "null")


def migrations():
    token = os.environ.get("TRAVLINE_SUPABASE_MANAGEMENT_TOKEN", "")
    if not token:
        raise SystemExit("TRAVLINE_SUPABASE_MANAGEMENT_TOKEN is not set")

    project = _request(f"{API}/projects/{REF}", token)
    name = (project or {}).get("name", "")
    print(f"project: {name} ({REF})")
    if (project or {}).get("id") != REF and (project or {}).get("ref") != REF:
        raise SystemExit("refusing to continue: the API did not return the Travline project")
    if re.search(r"estateline", name, re.I):
        raise SystemExit("refusing to continue: this is not the Travline project")

    assert LEDGER_SQL.lstrip().lower().startswith("select")  # read-only by construction
    rows = _request(f"{API}/projects/{REF}/database/query", token, {"query": LEDGER_SQL}) or []
    applied = {str(r["version"]): r.get("name") for r in rows}

    repo = {}
    for fn in sorted(os.listdir(MIGRATIONS_DIR)):
        m = re.match(r"^(\d+)_(.+)\.sql$", fn)
        if m:
            repo[m.group(1)] = m.group(2)

    not_applied = sorted(v for v in repo if v not in applied)
    unknown_to_repo = sorted(v for v in applied if v not in repo)
    print(f"repo migrations: {len(repo)}   applied in production: {len(applied)}")
    print(f"in repo but NOT applied in production ({len(not_applied)}):")
    for v in not_applied:
        print(f"  {v}_{repo[v]}")
    print(f"applied in production but NOT in repo ({len(unknown_to_repo)}):")
    for v in unknown_to_repo:
        print(f"  {v} {applied[v]}")
    verdict = "PARITY" if not not_applied and not unknown_to_repo else "DRIFT"
    print(f"result: {verdict}")
    # Version mismatches can also be renames of the same migration; triage by name before acting.
    sys.exit(0 if verdict == "PARITY" else 1)


def health(base):
    data = _request(base.rstrip("/") + "/api/health")
    print(json.dumps(data, indent=2))
    cfg = (data or {}).get("config", {})
    problems = []
    if cfg.get("devBypassEnabled"):
        problems.append("devBypassEnabled is true")
    if not cfg.get("sentryEnabled"):
        problems.append("error monitoring (Sentry) is not enabled")
    if cfg.get("emailProviderConfigured") is False:
        problems.append("no platform SMTP provider (transactional email fails closed unless an org has its own SMTP)")
    elif cfg.get("emailProviderConfigured") is None:
        problems.append("emailProviderConfigured not reported: deployed API predates the fail-closed email change")
    if (data or {}).get("database") != "connected":
        problems.append("database not connected")
    for p in problems:
        print(f"WARN: {p}")
    print("result:", "OK" if not problems else "ATTENTION")
    sys.exit(0 if not problems else 1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "migrations":
        migrations()
    elif cmd == "health":
        health(sys.argv[2] if len(sys.argv) > 2 else "https://travline-ten.vercel.app")
    else:
        raise SystemExit(__doc__)
