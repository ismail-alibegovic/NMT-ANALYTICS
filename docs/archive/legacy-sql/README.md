# Legacy SQL Archive

**These files are historical and must NOT be used for new migrations.**

## Source of truth

All new database migrations go exclusively in:

```
nmt-analytics-api/supabase/migrations/
```

(Supabase CLI timestamp format, e.g. `20260704000027_voucher_enhancement.sql`)

If you are unsure about the current live schema, read it directly from Supabase
(do not infer from these archived files — they diverged from production long ago).

## What's here

| Folder | Origin | Contents |
|---|---|---|
| `api-docs-sql/` | `nmt-analytics-api/docs/sql/` | Early numbered DDL (0001–0008), revenue queries |
| `supabase-sql/` | `nmt-analytics-api/supabase/sql/` | 001–038 numbered migrations + RPC helpers |

These were the pre-`supabase/migrations/` migration set. They were replaced by
the `supabase/migrations/` timezone-stamped versions and are retained here for
historical reference only.

## Archived on

2026-07-09 — consolidation pass (improvement plan Phase 1).
