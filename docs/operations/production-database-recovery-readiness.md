# Travline production database recovery and migration readiness

Status: **NO-GO for real agency data** until evidence below is recorded and signed off.
Project: Supabase `hacutwknfgufrqlgdiia` (Travline, eu-north-1).
This is a runbook and read-only findings report, **not** evidence that backup or restore has succeeded.

## Read-only observations — 2026-10-16

- Supabase project reports `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Production `supabase_migrations.schema_migrations`: **110 rows**; latest version `20261015153728` (`supplier_payables_overview`).
- Earlier repository audit counted **111 migrations**, latest cited `20261016000000_public_form_context_enrichment.sql`. **The exact repo-versus-production set difference still needs independent confirmation; a count mismatch alone is not proof a migration is pending.**
- Production public-schema tables: **74**, with RLS enabled on all **74** (does not establish policy correctness).
- Supabase security advisory: `public.recompute_group_member_count()` is SECURITY DEFINER executable by `anon` and `authenticated`; verified via `has_function_privilege`. Do not revoke until its legitimate callers are traced and tests prepared.
- Backup availability, PITR entitlement/status, restore verification, database migration rollback compatibility and Auth email configuration: **NOT VERIFIED**.

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

- [ ] Exact 111-vs-110 migration comparison completed and reviewed
- [ ] Backup type, latest successful backup, retention and PITR status verified
- [ ] Authorized isolated restore successfully rehearsed
- [ ] RPO/RTO measured; rollback and forward-fix paths documented for current deployment
- [ ] Prod and secondary runtime versions compatible with database
- [ ] Critical Supabase security warnings triaged in a separate reviewed PR
- [ ] Named owner and approval recorded

**Safety:** Do not store database tokens, API secrets, connection strings with credentials, backup files or sensitive customer data in this repository. Do not run DDL/DML in production as part of this documentation task.
