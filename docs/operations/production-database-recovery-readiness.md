# Travline production database recovery and migration readiness

Status: **NO-GO for real agency data** until evidence below is recorded and signed off.
Project: Supabase `hacutwknfgufrqlgdiia` (Travline, eu-north-1).
This is a runbook and read-only findings report, **not** evidence that backup or restore has succeeded.

## Read-only observations — 2026-10-16

- Supabase project reports `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Production `supabase_migrations.schema_migrations`: **110 rows**; latest version `20261015153728` (`supplier_payables_overview`).
- Earlier repository audit counted **111 migrations**, latest cited `20261016000000_public_form_context_enrichment.sql`. The repository file `nmt-analytics-api/supabase/migrations/20261016000000_public_form_context_enrichment.sql` is present on `main` but version `20261016000000` is absent from the 110 recorded production migrations. This is the identified pending migration **subject to a complete set comparison**. It replaces `public.submit_public_form(text,jsonb)` (SECURITY DEFINER), enriches inquiry metadata, and explicitly restricts execution to `service_role`. Review application and security impact before deployment.
- Production public-schema tables: **74**, with RLS enabled on all **74** (does not establish policy correctness).
- Supabase security advisory: `public.recompute_group_member_count()` is SECURITY DEFINER executable by `anon` and `authenticated`; verified via `has_function_privilege`. Its repository definition in `20260902153611_safe_passenger_removal.sql` shows a trigger function returning `TRIGGER`, called by `trg_group_member_count` on membership inserts/deletes. Direct client execution should not be required for trigger invocation; review production trigger/function definitions and validate an append-only privilege-hardening migration in isolated CI before any production change.
- Backup availability, PITR entitlement/status, restore verification, database migration rollback compatibility and Auth email configuration: **NOT VERIFIED**.

## Exact migration version reconciliation — 2026-10-16

Compared all migration filenames on `main` at `32fbb2df4b69fe13c048cf357a5287c1e2eb7d59` with all recorded production versions, using read-only metadata queries. The complete, per-version inventory is [production-migration-inventory-2026-10-16.json](production-migration-inventory-2026-10-16.json).

| Result | Count / version |
| --- | --- |
| Repository migration files | 111 |
| Recorded production versions | 110 |
| Matching version identities | 110 |
| Missing from production | `20261016000000_public_form_context_enrichment.sql` only |
| Unexpected production versions | 0 |
| Production entries with archived SQL statements | 66 |
| Production entries without archived SQL statements | 44 |

This completes the version-set comparison, **not** SQL-body or schema equivalence. Git blob SHAs in the inventory identify the exact repository files; they are not production SQL checksums. The 44 missing statement archives prevent claiming historical SQL equality from migration records alone. Reconstructed migrations and schema/ACL state still require review before deployment.

PR [#111](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/111) adds `20261016110719_database_function_security.sql`; it remains outside `main` and production while open. If merged, expected repository count becomes 112 and the pending production list must include both `20261016000000` and `20261016110719`. Apply any separately approved deployment in migration-version order; do not mark either version applied without executing and validating the reviewed SQL.

## API-only access model — identity helper review

The previously noted helper ACL discrepancy is **not** a fresh-versus-production divergence. Migration `20260826155105` initially grants authenticated EXECUTE to `get_my_org_id()` and `get_my_role()`, but later migration `20260826155408_travline_p0_server_only_data_api.sql` explicitly revokes it and removes direct authenticated table access. Browser Supabase usage is Auth-only; business requests go through the tenant-authorized API using service_role.

Read-only production verification found RLS enabled on all 74 public base tables, zero public base tables with anon DML and zero with authenticated DML. Both identity helpers deny anon/authenticated EXECUTE. All 65 public policy records referencing the helpers belong to tables without authenticated SELECT. Retained RLS policies provide defense in depth; they are not authorization to reopen the Data API. No helper grants, table privileges or RLS policies need changing to resolve this observation. PR #111's regression now explicitly denies both helper calls and allows no public SECURITY DEFINER exception for browser roles.

The remaining actual production hardening actions are deployment of reviewed pending migrations and separate Auth leaked-password protection configuration. Backup/PITR availability, restore rehearsal, deployed-runtime alignment and pilot approval remain unverified. Isolated synthetic Supabase acceptance is not a production-backup restore rehearsal.

## Operator preflight — no production writes

1. Confirm target project ID in Supabase dashboard. Never run commands on similarly named projects.
2. In Supabase Dashboard > Project > Database > Backups, record: plan, whether scheduled backups are enabled, last successful backup time (UTC), retention, and PITR availability/window. **Do not claim a backup exists based on database health.**
3. Confirm secure access to a recent restorable backup and verify that it actually covers the databases and related assets needed by Travline. Separately document Supabase Storage object backup/recovery, Auth settings and external email/third-party configuration as applicable.
4. Compare the exact migration version sets between the current `main` repository migration directory and `supabase_migrations.schema_migrations`; record missing, unexpected and divergent migrations with file paths and checksums where feasible. Inspect candidate SQL for destructive statements, locks, backfills and API-compatibility risks. **Do not apply migrations or mark them applied during this investigation.**
5. Check whether other deployed runtimes (including the previously mentioned Zo deployment) target this same database. Record currently deployed backend SHA and database API compatibility.

## Recovery rehearsal — only after an approved isolated target exists

1. Obtain a non-production scratch project with explicit owner approval and understood costs; never restore over production or another user's project.
2. Restore a verified backup into the isolated target using the supported Supabase recovery procedure for the selected backup type. Record timestamps, restoration job IDs and any limitations.
3. Verify structural integrity, migration history, RLS/policy state, and representative reservations/payments/departure and tenant-isolation flows against *sanitized or otherwise authorized test data*. Do not expose production PII in logs, PR comments or screenshots.
4. Record RPO (recovery point), RTO (measured restore time), post-restore smoke test results and the person approving the rehearsal.
5. Delete test resources only after confirming they contain no needed evidence and after securing any required approval.

## Incident rollback decision tree

- **Frontend-only regression:** redeploy last known-good code release, smoke test routes, authentication and critical user flows.
- **API regression without incompatible schema change:** roll back to a database-compatible backend version; validate environment variables and smoke tests.
- **Database/schema regression:** **do not** blindly reverse SQL or roll back app code across incompatible schema. Freeze writes where safe, assess whether a forward fix is possible; otherwise restore into an isolated target first and follow an approved data-recovery/cutover plan. Account for writes after the backup, external side effects, emails and concurrent runtimes.
- **Suspected tenant leak or financial inconsistency:** halt the affected write paths, preserve audit evidence, escalate and use documented incident response before resuming.

## Go/no-go evidence checklist

- [x] Complete version-set comparison recorded: 110 matching, only `20261016000000` missing, zero unexpected versions (snapshot above)
- [ ] SQL-body/schema/ACL equivalence and pending migration impact reviewed; 44 historical SQL archives are unavailable
- [ ] Pending public-form migration reviewed for backward compatibility, tenant scoping, and runtime safety
- [ ] Backup type, latest successful backup, retention and PITR status verified
- [ ] Authorized isolated restore successfully rehearsed
- [ ] RPO/RTO measured; rollback and forward-fix paths documented for current deployment
- [ ] Prod and secondary runtime versions compatible with database
- [ ] Critical Supabase security warnings triaged in a separate reviewed PR
- [ ] Named owner and approval recorded

**Safety:** Do not store database tokens, API secrets, connection strings with credentials, backup files or sensitive customer data in this repository. Do not run DDL/DML in production as part of this documentation task.
