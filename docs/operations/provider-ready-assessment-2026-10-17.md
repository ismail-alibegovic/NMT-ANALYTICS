# Travline V1 — final integration and provider-ready release assessment

Evidence checked: 2026-10-17. Initial main: `d248afd80485967a1c3ccf33dd0518e011ead27f`.
Final integrated main: `21ce102733e817638f71d545a96fadd87cd0221d`.
Verdict: **PASS for the integrated provider-ready application and isolated acceptance; NO-GO for a production agency pilot pending operational gates**. This report does not authorize production migrations, provider activation or production business-data writes.

## Integrated implementation and exact release evidence

All five implementation patches were reviewed, including tenant boundaries, error/secret handling, Auth behavior, payment replay and scheduler/monitoring configuration. PRs #113–116 were synchronized with the then-current main by non-forced merge commits. Their application diffs remained identical to the reviewed original patches. PR #116 additionally fixes a package-editor test synchronization defect discovered during integration: await rendered hotel controls and completed save callbacks, and reset queued mocks between tests. The final expanded patch was reviewed and new CI and isolated acceptance had to pass on each final head before squash merge. GitHub confirmed each merge. Direct Git-tree comparison confirmed that each final reviewed implementation head and its squash merge have identical content. Each resulting main passed its push CI before the next merge. No branch protection or main history was bypassed.

| PR | Final reviewed head SHA | Squash merge SHA | Resulting main CI |
| --- | --- | --- | --- |
| [#112](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/112) | `7d8a67a8133c9555488ef11dd4cbd6c45df72517` | `d947731a4ac45937a27b77c0b61eca88098a932d` | PASS |
| [#113](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/113) | `a8055a2788e86dc32d8b07c147e5a3ee12e6b580` | `54944b1ecd208ec8a93d1ec26e6d83ab7f6474d3` | PASS |
| [#114](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/114) | `4997d7d981982666d7c89c0132aae0536c1543b4` | `157a21c54ec7ce84f1ec0d0241ccc38533611165` | PASS |
| [#115](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/115) | `ad30585f3c8b4ab29db6482061de77c72bfd4891` | `a5b9029ec5be9fd78fb1cfdc78f023f8b9d8efb0` | PASS |
| [#116](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/116) | `dde935cffff5b19c34d12c6fe65d4afa2aafb906` | `a49d075d31c88a846a7c494a53837bfccf042613` | PASS |
| [#119](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/119) | `bdb5d9107f143dd9285d6a5ae4d37110a2d72ef9` | `21ce102733e817638f71d545a96fadd87cd0221d` | PASS |

Main branch protection reports these required checks: API build/typecheck, API tests, admin lint/build, admin tests, Migration Replay and Isolated Supabase acceptance. Docker and Vercel preview status were also checked before implementation merges. The integration's administration scope cannot read the detailed branch-protection endpoint (403); it did not modify protections.

Supporting PR #119 adds a main-push trigger to the existing isolated acceptance workflow. Previously it ran only on pull requests or manual dispatch, leaving the exact squash-merge SHA without automatic acceptance. It changes only two workflow lines; permissions, fixtures, providers and application behavior remain unchanged.

PR #117 was not merged. Its historical combined-candidate results were not reused as final-main evidence. With #112–116 integrated it was closed as superseded, preserving its historical evidence. Supporting recovery documentation in #110 remains a historical snapshot; this assessment supplies the fresh 112-versus-110 comparison below.

## Final-main verification

| Check | Observed result | Evidence |
| --- | --- | --- |
| API dependency installation and TypeScript build | PASS | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527832) |
| API tests (90 files) | PASS — 878/878 | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527642) |
| Admin dependency installation, lint, TypeScript and production build | PASS | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527808) |
| Admin tests (59 files) | PASS — 368/368 | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527812) |
| PostgreSQL 17 migration replay and regression assertions | PASS — 112/112 | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527838) |
| API/admin Docker builds | PASS | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883466/job/117431527739) |
| Isolated Supabase/browser acceptance, Storage and captured SMTP | PASS — 37/37 | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39044883533/job/117431528082) |

Counts above are from fresh job logs for the stated final implementation main, not copied from previous reports. The isolated workflow uses PostgreSQL 17, Supabase CLI 2.109.0, synthetic two-tenant fixtures, local Auth/Storage and captured SMTP. Its service checks never establish real provider delivery. The final acceptance push run 39044883533 reports main at the final SHA, and its checkout log independently prints that same full commit. The unit-test and migration-replay checkout logs also match it.

Local checkout: **BLOCKED** by host DNS resolution for GitHub; local gh authentication is also invalid. Local dependency installation, builds, unit tests, PostgreSQL replay, Docker and browser acceptance: **NOT RUN locally**. The corresponding GitHub Actions executions above provide the actual remote verification. Docker, Supabase CLI and psql are not installed on the local host. No local PASS is claimed.

The acceptance coverage includes manager/staff and tenant denial, customers/packages/departures, reservations/capacity, New Sale/recovery, standalone concurrent payment retries, installments/financial totals, passenger groups, seating/rooming, documents/Storage, public forms/quotations and captured Auth confirmation/recovery. Provider-failure, scheduler-auth and monitoring-configuration regressions also run in the API/admin suites. This is representative controlled synthetic acceptance, not proof that every possible product workflow or live agency operating scenario has been certified.

### Resolved verification failure

An intermediate #116 run failed three package-editor tests ([failed admin job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39043368699/job/117427142891)). Inspection found a real test race: waiting for a getHotels mock invocation does not wait for the loading UI to render the catalog select. Retained mockResolvedValueOnce responses then contaminated later tests; some assertions also preceded asynchronous save completion.

Commit `dde935cffff5b19c34d12c6fe65d4afa2aafb906` changes only `nmt-analytics-admin/src/tests/packageEditorModal.test.tsx`: locate the actual rendered hotel select through its placeholder option, reset mock implementations/queues between tests, and wait for save-completion callbacks. Existing business assertions remain; no test was skipped, assertion removed or timeout increased. Production package-editor behavior is unchanged. The final required checks and final-main tests in the evidence table above include this fix.

### Financial integrity

PASS for the tested replay/concurrency boundary: stable tenant-namespaced payment IDs serialize duplicate keyed inserts; matching replay returns current finance; changed recorded financial terms return 409; cross-tenant reservation access is denied; replay skips API audit/notification/email work. Installment compare-and-set remains in place. The browser preserves its intent key across ambiguous failure/reload and retires it after success. No payment/RLS/ledger migration was added.

Legacy API callers without idempotency keys retain their documented old behavior; they must adopt retained keys before relying on safe automatic retries. A recorded payment that is later edited/refunded can cause an old replay to return conflict. No guarantee of exactly-once external notification delivery is implied.

## Fresh production database review — read-only

Target verified through the Supabase connection: `hacutwknfgufrqlgdiia` (Travline, eu-north-1), ACTIVE_HEALTHY, PostgreSQL 17.6.1.054.

| Finding | Classification | Evidence / implication |
| --- | --- | --- |
| Complete migration version comparison | PASS | 112 repository files; 110 production versions; 110 matches; zero unexpected production versions |
| Pending migration versions | BLOCKED for deployment | Only `20261016000000` and `20261016110719`; reviewed SQL and order below; no additional migrations in #112–116 |
| Full production schema/SQL equivalence | NOT VERIFIED | 44 NULL SQL archives and one empty archive prevent historical SQL-body equality claims from ledger alone |
| Public-table RLS/browser grants | PASS for inspected metadata | All 74 public tables have RLS; zero public base tables expose SELECT/INSERT/UPDATE/DELETE to anon or authenticated |
| Trigger/function ACL hardening | BLOCKED for production parity | `recompute_group_member_count` is still executable by anon/authenticated; supplier mutation guard has no pinned search_path; pending security migration addresses these |
| Public-form execution boundary | PASS for existing ACL | anon/authenticated EXECUTE false, service_role true; final replacement/search_path still requires the ordered deployment |
| Backup availability, retention and PITR | BLOCKED: managed backups unavailable on current plan | Browser access resolved at 2026-10-17 19:20 Europe/Sarajevo; exact Travline project is on Free. Scheduled-backup page states backups are not included; PITR page offers a Pro add-on. Any independent manual backup remains NOT VERIFIED |
| Restore rehearsal and RPO/RTO | NOT VERIFIED | No approved isolated production-backup restore was performed |
| Other runtime compatibility | NOT VERIFIED | Zo/other deployed runtime SHAs and their configuration were not verified |

A read-only catalog check also confirmed that all named columns required by the pending public-form enrichment migration exist. This verifies column presence, not full schema/body compatibility.

Read-only production queries confirmed the active passenger-group maintenance trigger, supplier append-only trigger and payment financial/currency triggers exist. They did not execute business mutations. A separate read-only aggregate snapshot checked 64 production reservations against succeeded payments: zero paid_amount drift, zero balance_due drift, zero payment_status drift and zero overpaid reservations. This is a point-in-time reconciliation, not a production concurrency test or full historical accounting audit.

Security advisor: 14 INFO findings for RLS enabled without policies are consistent with the API-only access model and absent browser table grants; do not add permissive policies to suppress them. WARN findings are mutable supplier-function search_path, anon and authenticated access to the same trigger-only definer function, and disabled leaked-password protection. The first three observations are addressed by the pending reviewed security migration; leaked-password protection is a separate owner configuration decision. No live Auth setting was changed.

Advisor references: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anon definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Production migration runbook — separate approval required

Status: **BLOCKED** until a recent restorable backup, successful isolated restore rehearsal and explicit production deployment approval are recorded. Nothing below was executed against production.

### Identity, backup and compatibility gates

1. Confirm Supabase project `hacutwknfgufrqlgdiia`, Travline, eu-north-1, PostgreSQL 17. Verify the operator's dashboard and already-linked CLI target both match. Stop on any mismatch; do not auto-link an unknown workspace.
2. Record the approved application SHA, both migration file blob SHAs below, deployed Vercel SHA, and the SHA/configuration of every other runtime sharing this database, including Zo if applicable.
3. From the project's actual Backups page, record the backup ID, completion time, retention, PITR entitlement/window, recovery point and secure access procedure. Database health and a clean migration replay do not prove a backup exists.
4. Verify database, Auth data/settings and Storage recovery coverage separately; database backup alone must not be assumed to restore stored document bytes or external configuration. Keep backup content and credentials out of this repository.
5. Restore the chosen backup to an authorized isolated target. Do not create a paid target or restore over production. Use authorized sanitized data for workflow checks. Record measured RPO/RTO, restore job ID, ACL/schema checks and tenant/finance/public-form results. Apply the two pending migrations there in order and repeat the checks.
6. Stop unless the isolated upgrade rehearsal passes and the owner explicitly approves the production action and release window. Assign a named release operator and incident contact before beginning.

### Recovery continuation checkpoint — 2026-10-17

A second read-only check confirmed the release main is still `21ce102733e817638f71d545a96fadd87cd0221d`, the target is ACTIVE_HEALTHY, and production still records 110 migrations through `20261015153728`, with neither pending version recorded. No new application test run is claimed.

Browser access was initially blocked by a different signed-in account. The owner switched sessions, and at 2026-10-17 19:20 Europe/Sarajevo the browser successfully accessed the exact Travline project in organization `zbpxetyyeqjwjchkupuh`. This resolves the browser-access blocker. The [scheduled-backup page](https://supabase.com/dashboard/project/hacutwknfgufrqlgdiia/database/backups/scheduled) states **Free Plan does not include project backups**. The [PITR page](https://supabase.com/dashboard/project/hacutwknfgufrqlgdiia/database/backups/pitr) offers a Pro add-on rather than an active recovery window. No managed backup ID, successful backup timestamp or PITR recovery bounds are available from these pages. An independent manual backup, if one exists, has not been verified. No plan upgrade or recovery action was performed.

Next: prepare a manual logical backup through an authorized secure database connection, store it in an owner-controlled encrypted destination, and restore it into an approved isolated PostgreSQL 17/Supabase environment. Preserve required schema/data/roles and migration history, and establish separate Auth/settings and Storage recovery coverage. Discover current CLI flags before execution, keep credentials and backup contents out of the repository, and record checksums and restore evidence. Do not infer that a paid upgrade alone proves an existing recovery point or successful restoration.

Before beginning a restore rehearsal, complete this evidence record without secrets or customer records:

| Required record | Current state / evidence needed |
| --- | --- |
| Source identity | Travline, `hacutwknfgufrqlgdiia`, organization `zbpxetyyeqjwjchkupuh`, eu-north-1 |
| Available recovery source | BLOCKED for managed backups on Free; manual backup NOT VERIFIED. Record an actual successful backup, timestamp/timezone, integrity checksum and secure location, then prove restoration |
| Isolated destination | NOT SELECTED: approved target reference, region, access restrictions and any approved cost |
| Side-effect controls | Record outbound integration/worker isolation before attaching an application or performing test writes; inspect copied database schedules, webhook triggers and external-operation extensions |
| Coverage | Record database/Auth-data coverage separately from Storage object bytes, Auth settings/API keys and other project configuration |
| Restore execution | NOT RUN: recovery point, job ID, start/finish UTC, observed data-loss interval and restore duration, compared with owner-approved RPO/RTO |
| Upgrade rehearsal | NOT RUN: 110-version baseline; apply exactly the two reviewed migrations in order on the isolated copy; verify 112 versions, function ACL/search paths, tenant and finance checks |
| Decision | NO-GO until evidence is complete; separate approval remains required for production deployment |

A narrow catalog inspection found no installed `pg_cron`, `pg_net`, `wrappers` or `http` extensions, zero foreign servers and zero triggers using `supabase_functions.http_request`; `supabase_vault` is installed. Vault contents were not read. This does not certify every custom function, application worker or external integration as inert; repeat the inspection on the restored target.

Current official [restore-to-new-project guidance](https://supabase.com/docs/guides/platform/clone-project) describes a database copy that includes Auth user data but requires separate configuration and Storage recovery work. It also calls out copied extensions capable of external operations and additional project costs. Check eligibility and the actual cost before choosing this path; no clone, upgrade, purchase or restore has been started. See also [database backup coverage](https://supabase.com/docs/guides/platform/backups). The tool named `restore_project` is not evidence that an isolated backup restore is supported; do not invoke it as a substitute.

### Preflight and exact deployment order

Work from a clean checkout of the approved final release SHA, in `nmt-analytics-api/`. Use the reviewed CLI version and discover its flags with `--help`; the runbook follows the official [db push reference](https://supabase.com/docs/reference/cli/supabase-db-push). No passwords or tokens belong in command arguments, logs or PRs.

```sh
supabase --version
supabase migration list --help
supabase db push --help
supabase migration list --linked
supabase db push --linked --dry-run
```

Expected production version set: exactly 110 matching versions through `20261015153728`, no unknown versions, and exactly these two pending files:

| Order | Version/file | Reviewed Git blob |
| --- | --- | --- |
| 1 | `20261016000000_public_form_context_enrichment.sql` | `c90fa8ef9ca3de2967f2164f76328eae10131637` |
| 2 | `20261016110719_database_function_security.sql` | `1094b68e2ccd9bbf7b412642d9098b78e3912b49` |

If the inventory or dry-run differs, stop and review the new state. Never use migration repair or include-all flags to make a mismatch disappear.

After recorded approval, quiesce public-form submissions and coordinate all runtimes so no request executes between function replacement and hardening. Keep communication workers disabled. The enrichment migration replaces `submit_public_form`; the security migration pins its search_path and revokes direct browser EXECUTE on trigger functions. Reversing that order can clear the pinned function configuration.

The separately authorized operator then runs:

```sh
supabase db push --linked
```

Confirm the tool proposes only the two reviewed versions in order. Stop on the first error. The first file is a function replacement; the second uses its own transaction. Do not assume the pair is globally atomic. Do not push Auth config, seed data, reset the database, repair the ledger or invoke production regression fixtures.

### Read-only post-deployment verification

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261016000000', '20261016110719')
ORDER BY version;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('submit_public_form',
                   'recompute_group_member_count',
                   'prevent_supplier_confirmation_event_mutation')
ORDER BY p.proname;
```

Expected: both versions recorded; anon/authenticated EXECUTE false for all three functions; service-role EXECUTE true. `submit_public_form` must have `search_path=pg_catalog, public, pg_temp`; the supplier mutation guard must have `search_path=pg_catalog, public`. Verify definitions, owners and triggers against the rehearsed target, all public tables' RLS and browser ACLs, and rerun the security advisor. Read migration records as version evidence, not proof of historical SQL equality.

Verify the deployed app SHA and database-compatible health/read flows. Execute business smoke writes only in an approved isolated environment; any later production synthetic/business writes require separate authorization. Never run `scripts/database-function-security.sql` against production: it contains temporary regression writes even though it rolls them back.

### Incident, rollback and GO/NO-GO

On a migration failure, keep affected public intake paused, preserve sanitized error/version/ACL evidence and notify the named release operator and owner. For suspected tenant leakage or financial inconsistency, halt affected writes and follow incident escalation before resuming.

Prefer a reviewed forward fix that preserves revoked privileges and the pinned function search paths. Do not automatically restore permissive ACLs or reverse migration records. Roll back application code only to a database-compatible tested release. If recovery requires restoring a backup, first restore into an isolated target, account for writes after the recovery point and external side effects, then obtain separate cutover approval. A production restore is never authorized by this report.

GO requires: confirmed target and release SHA; green final-main checks/acceptance; successful backup restore/upgrade rehearsal; both approved migrations applied and verified; compatible runtimes; required operating configuration and an agreed provider-deferred pilot scope; named owner sign-off. Any missing backup, failed ACL check, unexpected migration, tenant/finance regression or unknown runtime compatibility means NO-GO.


## Provider and infrastructure activation matrix

All real delivery and external monitoring activation remains **DEFERRED BY OWNER**. Isolated SMTP means a disposable capture server; it is not real provider or inbox delivery.

| Service | Code readiness and isolated evidence | Configuration readiness / owner requirements | Real-world verification |
| --- | --- | --- | --- |
| Platform SMTP | PASS: validation, TLS transport controls, sanitized errors, production mock rejection and provider acceptance contract covered by API tests | Supply valid SMTP_CONFIG with approved sender; restart/redeploy; validate connectivity without sending | DEFERRED BY OWNER: authorize one delivery later and reconcile provider/inbox evidence |
| Tenant SMTP | PASS: org-scoped resolution/settings, masked edit preservation, failed-save handling and director-only non-sending verification | Director saves tenant credentials; sender-domain/provider setup remains owner work; no code or migration required | DEFERRED BY OWNER |
| Auth email | PASS: ordinary signUp, server-owned ADMIN_URL confirmation redirect, recovery session/UI and cleanup; captured local confirmation/recovery acceptance | Supabase Auth SMTP is separate. Approve Site URL and exact /auth/signin and /auth/reset-password redirect URLs, sender and confirmation policy. Do not push local config to production blindly | DEFERRED BY OWNER: new-user confirmation and self-service recovery through real mail remain unavailable/unverified until activation; existing confirmed-user login is a separate flow |
| SMS | PASS: real Twilio and compatible generic JSON HTTP gateway, production mock rejection, masked headers, timeouts/no redirects and rejection handling | Select a supported transport/contract, supply credentials and sender. Arbitrary vendor protocols are not covered by a promise of configuration-only activation | DEFERRED BY OWNER: accepted API response is not handset delivery |
| API Sentry | PASS: valid DSN initializes capture; missing/invalid DSN is disabled; SDK-mocked sanitization tests | Supply SENTRY_DSN, environment and release labels; restart/redeploy | DEFERRED BY OWNER: no real event receipt verified |
| Browser Sentry | PASS: valid VITE_SENTRY_DSN initializes capture; missing/invalid DSN is disabled; PII/privacy regression tests | Supply VITE_SENTRY_DSN and release labels, then rebuild/redeploy because Vite values are build-time | DEFERRED BY OWNER |
| Communication cron | PASS: authenticated GET/POST, constant-time bearer comparison, disabled-by-default COMMUNICATION_JOBS_ENABLED gate, sanitized worker failure; legacy SCHEDULED_CAMPAIGNS_CRON_SECRET remains supported | Owner supplies a strong secret and explicitly enables only after provider/schema/operational gates. Current daily declaration is insufficient for time-sensitive rules | BLOCKED for time-sensitive activation on current Hobby cron cadence; no live worker invocation performed |

Read-only Vercel inspection identified project `prj_Ycs9FpAeYJ0m7husjdjQULUYqElT` in `team_4DKcC9xTucEHjGcIInAR7Y7o`; the team Billing UI reports an active **Hobby** plan. Official [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) permit daily scheduling on Hobby with an hour-wide timing window; Pro/Enterprise support minute-level intervals. No plan upgrade was performed. Keep time-sensitive rules disabled; a safe later option is an owner-approved existing external scheduler invoking the same authenticated endpoint at <=5-minute intervals, or an owner-approved plan supporting that cadence. Verify missed-run, timezone and execution-history behavior before activation.

Vercel environment metadata was inspected with decryption disabled. Only the service-role key was listed; no provider, monitoring, cron-secret or communication-job activation variable was listed. This is a project-configuration observation, not proof about Zo or another runtime. No secret values were retrieved or printed.

Communication-history `sent` means provider acceptance, not recipient delivery. Claim uniqueness and campaign compare-and-set avoid ordinary repeated-job duplication; exactly-once external delivery is not guaranteed. An accepted send followed by a history failure produces a do-not-retry error. Reconcile timeout/crash ambiguity against provider/history evidence before any manual resend; never automatically reset all claims or resend a batch.


## Deployment observations and operational gates

PASS for deployment identity/read-only health: Vercel production deployment `dpl_8sgxMeZpy7YiDojduELKhTGSiHrk` is READY for final main `21ce102733e817638f71d545a96fadd87cd0221d`. Its immutable [health endpoint](https://travline-2gc74cwez-ia-production-s-projects.vercel.app/api/health) returned HTTP 200 at 2026-10-17T15:32:02.082Z: database connected, auth bypass false, dev organization bypass absent, Sentry disabled and platform email provider unconfigured. Project runtime is Node.js 24.x; the existing CI suites use Node.js 20. This health check does not establish full production business-flow acceptance or database migration parity. No production worker or business mutation was invoked.

Vercel Preview isolation: **NOT VERIFIED / P1 operational restriction**. The service-role environment record targets both preview and production, and repository configuration names the production Supabase URL. Treat previews as production-backed until independently isolated; do not run mutating acceptance tests there. All acceptance performed in this task uses a disposable CI-local Supabase stack.

| Remaining issue | Severity | Classification / next action |
| --- | --- | --- |
| Production backup/restore and approved ordered migration deployment | P1 release gate | BLOCKED: supply recovery evidence, rehearse isolated restore/upgrade, then request separate deployment approval |
| Production schema/ACL parity and secondary runtime compatibility | P1 release gate | NOT VERIFIED: reconcile after authorized deployment and verify all runtime SHAs |
| Preview database separation | P1 operational restriction | NOT VERIFIED: configure/prove an isolated target before any mutating preview acceptance |
| Time-sensitive scheduler cadence on active Hobby plan | P1 for communication-dependent scope | BLOCKED: keep rules disabled; owner selects supported scheduling infrastructure |
| Real SMTP, Auth email, SMS and Sentry receipt | Scope-dependent | DEFERRED BY OWNER: do not classify absent credentials as missing software |
| Supabase leaked-password protection | P2 security configuration | NOT VERIFIED as enabled; advisor reports disabled; owner reviews/configures later |
| Live agency/production operating acceptance | P1 pilot gate | NOT VERIFIED: approve a defined provider-deferred scope after recovery/database/runtime gates |

No production SQL write, migration history repair, Auth-user modification, pilot organization creation, real mail/SMS, live monitoring activation, production worker invocation, paid infrastructure purchase or plan upgrade occurred. Git merges triggered the repository's existing Vercel deployment automation; the deployment observations above describe that automation, not an additional manual release or production database change.

The next authorized operational step is to obtain backup/restore evidence and prepare the isolated upgrade rehearsal. Production migration execution and any later provider activation remain separate owner-authorized actions.

## Exact implementation file inventory

This lists the final scoped PR diffs. The package-editor test stability fix in #116 and the main-push acceptance trigger in #119 are the additional release hardening discovered during this integration.

### PR #112

- `docs/tasks/active/provider-readiness.md`
- `nmt-analytics-api/src/lib/email/EmailService.ts`
- `nmt-analytics-api/src/lib/email/SmtpProvider.ts`
- `nmt-analytics-api/src/lib/email/activateSmtpProvider.ts`
- `nmt-analytics-api/src/lib/email/orgEmailProvider.ts`
- `nmt-analytics-api/src/lib/email/smtpConfig.ts`
- `nmt-analytics-api/src/lib/manualMessaging.ts`
- `nmt-analytics-api/src/lib/sms/SmsService.ts`
- `nmt-analytics-api/src/routes/communicationSend.ts`
- `nmt-analytics-api/src/routes/emailSettings.ts`
- `nmt-analytics-api/src/routes/smsSettings.ts`
- `nmt-analytics-api/src/tests/activateSmtpProvider.test.ts`
- `nmt-analytics-api/src/tests/emailService.test.ts`
- `nmt-analytics-api/src/tests/emailSettings.test.ts`
- `nmt-analytics-api/src/tests/messagingTenantIsolation.test.ts`
- `nmt-analytics-api/src/tests/smsService.test.ts`
- `nmt-analytics-api/src/tests/smsSettings.test.ts`
- `nmt-analytics-api/src/tests/smtpProvider.test.ts`

### PR #113

- `docs/tasks/active/scheduler-readiness.md`
- `nmt-analytics-api/src/routes/internal.ts`
- `nmt-analytics-api/src/tests/cronScheduler.test.ts`

### PR #114

- `docs/tasks/active/auth-provider-readiness.md`
- `nmt-analytics-admin/e2e/pilot-auth-provider.spec.ts`
- `nmt-analytics-admin/src/components/auth/ResetPasswordForm.tsx`
- `nmt-analytics-admin/src/components/auth/SignInForm.tsx`
- `nmt-analytics-admin/src/components/auth/SignUpForm.tsx`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/lib/supabase.ts`
- `nmt-analytics-admin/src/tests/authRecoveryReadiness.test.tsx`
- `nmt-analytics-api/src/lib/authSignup.ts`
- `nmt-analytics-api/src/routes/signup.ts`
- `nmt-analytics-api/src/tests/authSignup.test.ts`
- `nmt-analytics-api/supabase/config.toml`

### PR #115

- `docs/tasks/active/payment-idempotency.md`
- `nmt-analytics-admin/e2e/pilot-payment-idempotency.spec.ts`
- `nmt-analytics-admin/src/api/payments.ts`
- `nmt-analytics-admin/src/lib/paymentRequest.ts`
- `nmt-analytics-admin/src/tests/paymentRequest.test.ts`
- `nmt-analytics-api/src/middleware/auditLogger.ts`
- `nmt-analytics-api/src/routes/payments.ts`
- `nmt-analytics-api/src/tests/paymentRecordingRoute.test.ts`

### PR #116

- `docs/tasks/active/monitoring-readiness.md`
- `nmt-analytics-admin/src/lib/sentry.ts`
- `nmt-analytics-admin/src/lib/sentryPrivacy.ts`
- `nmt-analytics-admin/src/tests/sentryActivation.test.ts`
- `nmt-analytics-admin/src/tests/sentryPrivacy.test.ts`
- `nmt-analytics-api/src/instrument.ts`
- `nmt-analytics-api/src/lib/sentryPrivacy.ts`
- `nmt-analytics-api/src/tests/sentryActivation.test.ts`
- `nmt-analytics-api/src/tests/sentryPrivacy.test.ts`

- `nmt-analytics-admin/src/tests/packageEditorModal.test.tsx`

### PR #119

- `.github/workflows/staging-acceptance.yml`

### Canonical release documentation

Branch: `docs/provider-ready-assessment-2026-10-17` ([#118](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/118)).

- `docs/operations/provider-ready-assessment-2026-10-17.md`

No new migration was added to the repository and no production migration was applied. No other application files were changed beyond the implementation diffs above.

