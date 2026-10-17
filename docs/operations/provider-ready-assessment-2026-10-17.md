# Travline V1 — provider-ready release assessment

Evidence checked: 2026-10-17. Base main: `d248afd80485967a1c3ccf33dd0518e011ead27f`.
Status: **implementation candidate passes CI and isolated acceptance; NO-GO for a production pilot pending release/operational gates below.**
The five implementation PRs already existed when this assessment resumed. They remain unmerged. This assessment adds documentation only, not duplicate implementations.

## 1. Application and code readiness

| Scope | Implementation and tested boundary |
| --- | --- |
| Transactional email | #112 validates platform/tenant SMTP, rejects incomplete configuration and production mocks, requires SMTP recipient acceptance, masks saved secrets and preserves masked edits, fails saved-setting writes on database errors. Tenant configuration lookup errors cannot silently use another provider. Director-only saved-configuration verification opens a connection without sending mail. |
| SMS | #112 retains real Twilio and compatible JSON HTTP gateway transports, rejects production mocks, checks Twilio receipts and explicit HTTP application failures, masks gateway headers, uses timeouts/no redirects and sanitizes provider failures. The generic HTTP adapter supports its existing request/response contract; arbitrary vendor protocols are not promised to work without an adapter. |
| Auth | #114 uses anonymous Auth signUp rather than admin.createUser so confirmation can be sent. ADMIN_URL owns the confirmation destination; recovery uses /auth/reset-password and requires a session, with localized invalid-link handling and sign-out after password change. Isolated Mailpit confirmation/recovery and browser password update passed. Live Auth settings remain unchanged. |
| Finance | #115 derives a tenant-namespaced deterministic payment UUID from an optional request key. Existing primary-key uniqueness serializes concurrent writes. Replays return the recorded payment and current finance, conflicting recorded terms return 409, and replay avoids duplicate audit/notification/email work. Admin retains keys across ambiguous errors/reloads. Unkeyed third-party clients retain legacy behavior and must adopt keys. |
| Monitoring | #116 validates DSNs and enables API/browser Sentry via configuration. SDK-mocked tests cover activation/disabled behavior and conservative scrubbing of headers, bodies, query/fragment, user PII, arbitrary extras/context, breadcrumbs and free-text exceptions. No real Sentry receipt is verified. |

Communication-history `sent` means provider acceptance, **not inbox/handset delivery**. No delivery receipt/webhook guarantee is added. SMTP and HTTP responses can be ambiguous after a timeout or crash: reconcile provider/history evidence before manual resend. Campaign compare-and-set and automation occurrence claims prevent ordinary repeated-job duplicates; they do not establish exactly-once external delivery. An accepted send followed by a history failure surfaces a do-not-retry error.

### Reviewable implementation branches

| PR | Branch | Exact head verified |
| --- | --- | --- |
| [#112](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/112) | `fix/provider-readiness` | `7d8a67a8133c9555488ef11dd4cbd6c45df72517` |
| [#113](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/113) | `fix/scheduler-provider-readiness` | `bb76f30ef764a6a59b6852b81a30b69e2117c583` |
| [#114](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/114) | `fix/auth-provider-readiness` | `9eae098843c4557e19fa0f56ed5b52700455f2f8` |
| [#115](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/115) | `fix/payment-request-idempotency` | `d8deec28eeb3df5f6a4d4f32619eb744eb60555e` |
| [#116](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/116) | `fix/monitoring-privacy-readiness` | `f722361654108556886b268679ce5b5c6c9dac85` |

All five heads have successful API typecheck/tests, admin lint/build/tests, Docker build, migration replay and isolated acceptance checks. Review/merge remains an owner action.

## 2. Database and migration readiness

No migration was created or applied by this assessment. Both pending files already exist on main:

1. `nmt-analytics-api/supabase/migrations/20261016000000_public_form_context_enrichment.sql`
2. `nmt-analytics-api/supabase/migrations/20261016110719_database_function_security.sql`

The first replaces submit_public_form and enriches inquiry context while preserving service-role-only execution. The second pins that replacement's search_path, removes browser EXECUTE on trigger functions and preserves service-role access. **Apply in that order.** Replacing the public-form function after the security migration can clear its pinned configuration. Do not deploy only the enrichment replacement and leave hardening outstanding.

Exact deployment sequence, after separate approval:

1. Confirm the target, approved release heads, all runtimes sharing the database and read-only migration/schema/ACL inventory. The prior production inventory is dated 2026-10-16; this assessment did not refresh production state.
2. Record a recent restorable backup, retention/PITR status and successful authorized isolated restore evidence. Follow the recovery runbook in PR #110; database health and fresh replay do not prove recoverability.
3. On an authorized isolated restored target, execute enrichment then security migration and validate the existing-runtime/public-form contracts, function ACLs/search paths and trigger behavior. Review lock/runtime impact and rollback or forward-fix plan.
4. Obtain explicit owner approval for the production migration action. No approval is inferred from this report.
5. In a controlled release window, quiesce affected public-form traffic or otherwise prevent requests between the replacement and hardening. Apply the two reviewed files in version order using the established migration runner, stopping on the first error. Do not mark a version applied without executing it.
6. Verify both migration records, submit_public_form search_path/service-role-only ACL, trigger-function ACLs and current-runtime compatibility. Resume affected traffic only after hardening verification.
7. Deploy the reviewed application release with communication jobs still disabled. Verify the deployed SHA and approved smoke/tenant/finance flows before any pilot sign-off.

Fresh isolated PostgreSQL replay executed **112/112** migrations, including both pending files in order and database-function-security assertions. Full isolated Supabase acceptance also applied them. This establishes clean replay compatibility, not production SQL equivalence or an upgrade rehearsal from a production backup.

PR #110's older inventory was based on main before #111: it described only one pending migration. #111 is now merged and this release requires both files above. Its historical finding of 45 unusable migration SQL archives (44 NULL, one empty) means version equality alone cannot establish schema equality. Backup/restore and deployed-runtime compatibility remain unverified operational gates.

## 3. Infrastructure and scheduler readiness

#113 accepts GET/POST for all three internal communication-job routes, retains constant-time bearer-secret authentication, rejects unsupported methods, disables execution unless `COMMUNICATION_JOBS_ENABLED=true`, returns non-cacheable authorized job responses and sanitizes worker failures.

No cron secret, activation gate or production schedule was configured. Missing secrets or the disabled gate perform no worker work. Existing daily 06:00 UTC scheduling remains insufficient for time-sensitive reminders and hourly windows. Before enabling these rules, the owner must configure an approved scheduler at <=5-minute cadence, account for UTC versus agency time, and observe execution history. This is an infrastructure configuration prerequisite, not completed production scheduling verification.

Sentry API configuration requires restart/redeploy; Vite browser variables require rebuild/redeploy. Neither requires new application code or database migrations for the implemented integration.

## 4. External provider activation — deferred by owner

These are intentional deferrals, not missing-credential development tickets:

- Platform transactional SMTP: provide valid SMTP_CONFIG and approved sender identity, restart/redeploy, then verify connectivity and an explicitly authorized delivery.
- Tenant SMTP: save credentials through director-only settings and run the non-sending connection diagnostic; sender-domain/authentication and recipient delivery require owner/provider verification.
- Supabase Auth SMTP: configure in Supabase Auth separately from tenant SMTP, approve Site URL and exact /auth/signin and /auth/reset-password redirects, confirmation policy and provider sender identity. The checked-in Auth configuration is for isolated tests; do not apply it blindly to production.
- SMS: select supported Twilio or the compatible HTTP gateway contract and supply credentials/sender configuration. An accepted API receipt does not prove handset delivery.
- Sentry: provide SENTRY_DSN and browser VITE_SENTRY_DSN plus release/environment labels, rebuild/redeploy as needed; authorize a safe smoke event and verify receipt later.
- Scheduler: supply an approved secret/cadence and explicitly enable jobs only after the above dependencies are ready.

No real messages, live Auth changes, production job invocations, production DDL/DML, paid-service activation or merges occurred in this assessment.

## 5. Pilot acceptance and remaining blockers

The combined verification-only draft [#117](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/117) contains exactly the five heads above:
candidate `6d030fc77d2ee6f755be111a2f452c2fa56463c6`.
GitHub Actions checked out its synthetic merge with unchanged main:
`44003e3b9befb9e621d6be0f582ad19da12887c6`.
Do not merge this duplicate integration snapshot; implementation delivery belongs to #112–116.

| Verification | Observed result | Evidence |
| --- | --- | --- |
| API tests | 90 files, 878 tests passed | [API job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996441161) |
| Admin tests | 59 files, 368 tests passed | [Admin job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996366175) |
| API lint/typecheck | Success | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996368165) |
| Admin lint/build | Success | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996410497) |
| Docker build | Success | [Job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996421424) |
| Migration replay | 112 migrations executed; integrity/security assertions passed | [Replay job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369836/job/116996369499) |
| Isolated Supabase/browser acceptance | 37 passed, including captured Auth confirmation/recovery and concurrent payment retries with tenant denial | [Acceptance job](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38907369889/job/116994230257) |

These are existing CI results from 2026-10-16 on the exact unchanged candidate, re-read on 2026-10-17, not new local executions. Local checkout/test execution was unavailable because the host could not resolve GitHub; source and CI evidence were accessed through the connected GitHub API. No PASS is claimed for a local command.

Remaining pilot gates:

- Review/merge scoped PRs through the normal required checks, then verify the final assembled main/deployment. Do not assume a later rebased or merged SHA inherits this result.
- Confirm backup/restore evidence, current production schema/ACL parity, approved migration application and compatible runtimes.
- Configure/verify scheduler cadence before time-sensitive communications.
- Record approved production/agency pilot acceptance. Isolated synthetic scenarios do not demonstrate behavior against production deployment and real agency operations.
- Keep provider-dependent flows/jobs disabled or fail-closed while owner-deferred activations remain incomplete. Live email/SMS delivery and Sentry event receipt remain explicitly unverified.

Assessment: the reviewed provider-ready development candidate is test-green and ready for PR review. Production pilot approval is not granted by this report.

## Exact implementation file inventory

This lists the scoped PR diffs at the verified heads. No additional implementation changes were made during this assessment.

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
