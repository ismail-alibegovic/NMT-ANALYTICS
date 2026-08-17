#!/usr/bin/env python3
"""
Apply a SQL migration file to Supabase via the Management API /database/query
endpoint. Splits the file into individual statements (respecting single-quote
strings and $$ ... $$ dollar-quoted blocks) and runs each as a single-query
POST, since the endpoint rejects multi-statement bodies with CF WAF 1010.
"""
import sys, os, json, time, re
from urllib import request, error

REF = os.environ.get("TRAVLINE_SUPABASE_PROJECT_REF") or os.environ.get("SUPABASE_REF")
MGMT = (
    os.environ.get("TRAVLINE_SUPABASE_MANAGEMENT_TOKEN")
    or os.environ.get("SUPABASE_MGMT_TOKEN")
    or os.environ.get("SUPABASE_MANAGEMENT_TOKEN")
)
if not REF:
    raise RuntimeError("Set TRAVLINE_SUPABASE_PROJECT_REF")
if not MGMT:
    raise RuntimeError("Set TRAVLINE_SUPABASE_MANAGEMENT_TOKEN")
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"

def split_sql(text: str) -> list[str]:
    """Yield individual SQL statements, respecting quotes and $$ blocks."""
    stmts, buf, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        # line comment
        if c == '-' and i + 1 < n and text[i+1] == '-':
            j = text.find('\n', i)
            i = n if j == -1 else j
            continue
        # block comment
        if c == '/' and i + 1 < n and text[i+1] == '*':
            j = text.find('*/', i + 2)
            i = n if j == -1 else j + 2
            continue
        # dollar-quoted block: $$ ... $$ or $tag$ ... $tag$
        if c == '$':
            m = re.match(r'\$[A-Za-z_0-9]*\$', text[i:])
            if m:
                tag = m.group(0)
                end = text.find(tag, i + len(tag))
                if end != -1:
                    buf.append(text[i:end + len(tag)])
                    i = end + len(tag)
                    continue
        # single-quoted string
        if c == "'":
            buf.append(c); i += 1
            while i < n:
                ch = text[i]
                buf.append(ch); i += 1
                if ch == "'":
                    if i < n and text[i] == "'":  # escaped ''
                        buf.append("'"); i += 1
                        continue
                    break
            continue
        # statement terminator
        if c == ';':
            stmt = ''.join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(c); i += 1
    tail = ''.join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts

def run(stmt: str) -> tuple[int, str]:
    payload = json.dumps({"query": stmt}).encode("utf-8")
    req = request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {MGMT}",
        "Content-Type": "application/json",
        "User-Agent": "Travline-Migrator/1.0",
        "Accept": "application/json",
    }, method="POST")
    try:
        with request.urlopen(req, timeout=30) as r:
            body = r.read(300).decode("utf-8", errors="replace")
            return r.status, body
    except error.HTTPError as e:
        body = e.read(300).decode("utf-8", errors="replace")
        return e.code, body

def main():
    path = sys.argv[1]
    text = open(path).read()
    stmts = split_sql(text)
    print(f"=== {path}: {len(stmts)} statements ===", flush=True)
    ok, fail = 0, 0
    for k, s in enumerate(stmts, 1):
        preview = s.replace('\n', ' ')[:90]
        code, body = run(s)
        status = "OK" if code in (200, 201, 204) else "FAIL"
        if status == "OK":
            ok += 1
        else:
            fail += 1
        # Suppress noisy "already exists" duplicate-object errors (idempotent migrations)
        if status == "FAIL" and re.search(r'already exists|duplicate|PGRST204|relation "\w+" already exists|column "[\w ]+" of relation "\w+" already exists', body, re.I):
            status = "SKIP-existing"
            ok += 1; fail -= 1
        print(f"  [{k}/{len(stmts)}] {status} ({code}) {preview}", flush=True)
        if status == "FAIL":
            print(f"      BODY: {body}", flush=True)
        time.sleep(0.25)
    print(f"\nResult: {ok} ok, {fail} failed", flush=True)
    return 0 if fail == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
