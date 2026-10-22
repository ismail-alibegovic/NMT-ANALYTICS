# Production infrastructure release candidate — 2026-10-21

Target: Travline `hacutwknfgufrqlgdiia`, eu-north-1, PostgreSQL 17.6. Production URL https://travline-ten.vercel.app. Base main 42ec744c337424f78f1a4ec36dfe1e1ac4f8f0b3. Production changes require separate explicit owner approval. This document is a plan, not execution evidence; commit-specific CI/deployment results are recorded in the PR.

## Migration parity and risk

Read-only production inspection: 110 migration versions, latest 20261015153728. All four below are absent. Waiver table has only its eight legacy columns, no consent sync function; documents bucket is already private, restrictive documents_api_only policy absent. No public table without RLS; no unvalidated public constraints. Waiver token count is zero, so current legacy revocation/backfill affects zero rows; recheck immediately before execution. Browser roles lack CREATE on public. Historical migration SQL archives are incomplete, so version matching alone is not complete schema identity proof.

| Version | Changes and dependencies | Risk / recovery |
| --- | --- | --- |
| 20261016000000 | Replaces submit_public_form, enriches inquiry context; requires existing form/package/departure/inquiry columns | Function replacement; service-only EXECUTE preserved. Immediately follow with search_path pin in next migration. Roll forward preferred; restore reviewed prior function definition if needed. |
| 20261016110719 | Revokes browser execution on recompute_group_member_count and supplier append-only trigger; pins supplier and public-form search_path | No data writes. Existing trigger firing remains supported, verified by database-function-security.sql. Do not roll back by reopening browser privileges. |
| 20261020125419 | Revokes direct public table/column access; restrictive documents Storage policy; sets documents bucket private | Existing browser business-data callers would fail; API-only acceptance is mandatory. Bucket UPDATE is a production write even if currently a no-op. No financial data changes. |
| 20261020201438 | Adds consent snapshots, status, indices, constraints, tenant FKs and atomic passenger/audit trigger | Backfills consumed links and revokes unsigned legacy links without terms. ADD COLUMN/index/FK locks require maintenance window. Never invent historical terms or reactivate revoked links. Four FKs are NOT VALID until separately validated. |

No DROP/TRUNCATE/DELETE appears in these four migrations. Consent backfill and bucket changes are intentional mutations requiring approval. Existing financial tables are not updated by migration SQL. The isolated upgrade rehearsal checks full payment/reservation row fingerprints and financial totals before/after, consumed history and unsigned link revocation. A clean replay alone does not certify existing-data upgrades.

## Approval and execution checklist

1. Owner confirms exact project/ref, release commit and migration file SHA256 manifest; no new migration versions or partial objects since inspection.
2. Establish a recoverable, encrypted, access-restricted database backup plus separate Storage object copy/manifest. Verify restore into isolated infrastructure, including roles/grants/RLS, authentication, financial totals and object checksums. Record backup age, location, access owner and restore result. A synthetic rehearsal is not evidence of a production backup.
3. Owner approves maintenance window, blocking/reissuing legacy links, bucket privacy, privilege changes, four migration versions, migration-history entries and separate validation of four FKs. Pause user writes and scheduled jobs under an approved operational procedure.
4. Re-run SELECT-only preflight; abort on missing dependencies, partially applied objects, invalid tenant references, new unexpected versions or backup failure. Capture schema definitions/ACLs and financial counts/totals privately, without passenger records in CI or PR logs.
5. Apply exactly the four immutable files in order using the supported Supabase migration runner, with each migration and its history update atomic. Do not manually mark a version applied after a failure. Set bounded lock/statement timeouts appropriate to measured table sizes; abort and investigate lock timeouts rather than retry blindly. Never run the isolated rehearsal against production.
6. Verify 114 exact versions; expected function definitions/ACLs/search_path; no browser business table/column grants; documents restrictive policy; all consent columns/indices/trigger. Compare captured financial counts/totals and aggregate tenant-FK checks. Validate the four consent FKs only after a zero-violation check and approval.
7. Check health and authorized read-only role/tenant routes. Synthetic workflow writes belong in staging. Resume writes only after owner accepts results. Record executor, timestamp, commit, migration checksums and outcomes.

Recovery: on transaction failure, stop; confirm rollback and history consistency before retry. If already committed, prefer a reviewed forward repair; keep access fail-closed. Do not drop populated consent columns, reopen browser grants, or replay old migrations. Restore the verified pre-change backup into an isolated target first, validate finance/Auth/Storage and plan an explicitly approved cutover. Restoring production can lose post-backup writes; reconcile them before cutover. Never overwrite production as a diagnostic test.

## Security findings and smallest remedies

- recompute_group_member_count(): SECURITY DEFINER trigger exposed to anon/authenticated; migration 20261016110719 revokes execution while retaining trigger semantics and service access. Its trigger return type limits direct RPC execution, but excessive grants remain unnecessary exposure.
- prevent_supplier_confirmation_event_mutation(): mutable search_path and browser EXECUTE; same migration pins pg_catalog/public and revokes clients.
- All other inspected public SECURITY DEFINER functions deny browser EXECUTE and have configured search_path. Public CREATE is denied to browser roles. RLS without client policies on API-only tables is intentional fail-closed, not a reason to grant access.
- Leaked-password protection is disabled. Project organization is Free. Supabase documentation confirms leaked-password protection requires Pro or above (https://supabase.com/docs/guides/auth/password-security); owner must approve billing before activation. Enable through supported Auth configuration only after explicit approval, then test safe synthetic password rejection in staging. No production Auth setting changed.

## Vercel packaging

Before: 16 TS diagnostics, comprising 13 TS2339 discriminated-union narrowing failures and 3 TS2835 dynamic-import extension failures. Files: publicFormsHandlers (1), reservations (5), import (1), accommodation (6), waivers (1), orgBranding (1), fiscal/registry (1).

Root api/index.ts had no tsconfig and Vercel used different compiler defaults from the strict CommonJS API build. Root tsconfig now extends the API configuration; CI and Vercel explicitly typecheck the serverless entrypoint. Preview evidence showed Vercel function packaging still uses NodeNext/default narrowing independently of the explicit build check. Boolean discriminants now use explicit true/false comparisons and three relative dynamic imports use emitted .js extensions, compatible with both compilers. No strictness disabled or casts added; business decisions unchanged. Preview dpl_5Xado5bxmhJS9QP8D7kqcERMoVid at commit 6e9fbe34fa7b21bccf35acc8867483e47b57ec7a completed with zero TypeScript packaging diagnostics (full packaging-stage logs inspected); read-only /api/health returned 200 with database connected on 2026-10-22. Recheck the final commit before merge. The serverless entrypoint now imports instrumentation before Express.

## Monitoring activation and alert ownership

Prepared code: safe Sentry beforeSend, early serverless initialization, handled 5xx capture, structured 401/403/5xx outcome logs, route templates and validated correlation IDs, no raw global, shared database or authentication error payload. Aggregate production checks found zero payment/reservation tenant mismatches, payment currency mismatches, invalid payment amounts, unscoped payments/reservations and direct browser table grants. Real SDK in-memory transport test verifies sanitization; this is not an external Sentry receipt. Existing API and SPA privacy regression suites remain required.

External activation remains NOT VERIFIED: owner must supply API SENTRY_DSN through Vercel protected environment settings, choose SENTRY_ENVIRONMENT and immutable SENTRY_RELEASE, and optionally configure VITE_SENTRY_DSN through a reviewed rebuild. Never paste credentials into PRs. Configure an approved Sentry project, retention/access policy and alert destination; no account, destination or credentials are invented.

Proposed owner: Ismail Alibegović (requires acceptance), plus a named backup operator. Alert plan: availability check every 60s, page after 3 consecutive failures; API 5xx >2% with >=20 requests over 5min; finance server failure immediately; auth 401/403 >20/min for 5min for investigation rather than automatic user blocking; database health disconnected twice consecutively. Review noisy thresholds after pilot. Verify one synthetic event in staging, receipt, redaction, release tag and actual alert delivery/acknowledgment before activation PASS. Do not send external messages without owner authorization. No alerts verified yet.

## Backup/PITR and recovery

Connected Supabase organization reports Free. Official documentation: https://supabase.com/docs/guides/platform/backups — managed daily backup access is a paid-plan capability; PITR requires a paid plan and eligible compute/add-on. The connector exposes no backup inventory/PITR/config endpoint, and no management token or database backup credentials are available locally. Existing backup availability/retention is NOT VERIFIED; no paid resource created.

Safe alternative pending owner setup: encrypted logical backups via a least-privileged backup connection into owner-controlled off-site storage, plus separate Storage object exports/checksums and access-controlled role/config inventory. Schedule and monitor backup completion, retention/deletion and restore tests. Supabase database backups contain Storage metadata, not object bytes. Preserve Auth/config/roles and restore platform-managed schemas only using supported procedures; the CI compatibility bootstrap is not a production Supabase restore tool.

Proposed objectives for owner acceptance: RPO <=24h for daily exports, RTO <=4h only after a measured representative restore. If financial requirements demand lower loss, select PITR or a verified more frequent backup strategy. Actual achieved production RPO/RTO remains UNKNOWN. Synthetic pg_dump/pg_restore timing is recorded in CI and cannot predict production timing. Quarterly rehearsal and after major schema changes: restore isolated copy, verify ledger row fingerprints and cached totals, tenant boundaries, Auth, documents/object checksums, consent state, scheduled jobs disabled, outbound providers disabled, then destroy the disposable copy under approved retention rules.

## Workflow evidence boundaries

CI runs full API/Admin suites, all 114 migrations, upgrade/recovery rehearsal and authenticated synthetic acceptance (finance/security/consent/storage). No real customer/payment mutation is authorized. Production health/read-only metadata checks do not certify authenticated workflows. The detail/operator-portal suite adds populated fixtures for four detail routes and six operator portal routes across both themes and three widths, with strict route/API/error/overflow checks. Public form and subagent capability paths are covered by existing dedicated workflows. These initial-render checks do not certify every editing action on those pages. Old audit PRs #120–126 are superseded; #127 is verification-only; #110/#118 contain older recovery/release documentation, not current certificates.

Production remains NO-GO until approved migration execution, security settings, recoverable backups, live monitoring/alerts and critical workflow evidence are complete.

## Verification follow-up — 2026-10-22

At 6e9fbe34, all six CI jobs and UI regressions passed. Acceptance run 39612103285 attempt 1 passed 190/191 scenarios, including all six new detail/portal cases. One finance scenario failed before browser navigation: Auth 200, package 201, departure 201, reservation 500 while reserving capacity. Trace and blank pre-navigation screenshot confirm fixture setup failure, not a viewport/locator issue. The response contained DATABASE_ERROR rather than a SQLSTATE/provider code; sanitized logs did not retain enough evidence to establish the underlying cause. No automatic retry was added to this non-idempotent capacity RPC, and no assertion or critical scenario was weakened. A rerun alone does not establish root cause. Safe telemetry now distinguishes known transport failures, SQLSTATE/PostgREST codes and unknown failures without retaining raw error text, URLs or row values. Keep the original failure in the release evidence and investigate any recurrence before GO.
