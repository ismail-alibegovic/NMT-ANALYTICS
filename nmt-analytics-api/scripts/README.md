# Travline API scripts

Operational helpers that run outside the Express server process.

## `apply_migrations.py`

Apply a `.sql` migration file to Supabase via the Management API
`/database/query` endpoint. The endpoint rejects multi-statement bodies with
Cloudflare WAF 1010, so this script splits the file into individual
statements (respecting single-quote strings and `$$ … $$` dollar-quoted
blocks) and POSTs each one separately.

### Usage

```bash
export TRAVLINE_SUPABASE_PROJECT_REF=<project-ref>
export TRAVLINE_SUPABASE_MANAGEMENT_TOKEN=<management-api-token>
python3 scripts/apply_migrations.py path/to/migration.sql
```

`SUPABASE_REF`, `SUPABASE_MGMT_TOKEN`, and `SUPABASE_MANAGEMENT_TOKEN` are accepted only as legacy aliases. Prefer the `TRAVLINE_*` names in Zo Secrets.

Use this when the Supabase dashboard SQL editor is blocked or when applying
migrations from a fresh environment. The Management API token can be created
from the Supabase dashboard (Account → Access Tokens).

### Why split into single statements?

The Supabase Management API `POST /v1/projects/{ref}/database/query` endpoint
sits behind the same edge WAF as the dashboard. Multi-statement bodies trigger
a CF WAF 1010 response. Splitting the file and sending one statement per
request is the reliable path.
