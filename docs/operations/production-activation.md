# Production activation controls

The release includes 114 migration files. The four previously pending versions are `20261016000000`, `20261016110719`, `20261020125419`, and `20261020201438`. The immutable checksums are in `production-migration-sha256.txt`.

When a provider migration runner generates a timestamp instead of accepting the repository version, preserve provenance: apply the exact reviewed SQL through the migration runner, confirm success, compare the recorded SQL bytes/hash with the reviewed file, and only then align that successful history entry to its canonical repository version. Require the expected generated version/name/hash and absence of the canonical version in the guarded update. Never insert an applied history entry for failed or unexecuted SQL. Verify the exact version set and catalog state afterward.

Post-migration checks include financial row fingerprints and totals, consent columns/trigger, restrictive documents policy and bucket privacy, browser table/column privileges, function execution/search paths, and tenant constraints. Keep customer data and account-specific operational evidence outside the public repository. Backup/recovery readiness is independently recorded; this deployment procedure does not certify it.

## Availability

`.github/workflows/production-health.yml` runs a read-only probe on the default branch every five minutes, on relevant pushes/PRs, and on manual dispatch. GitHub schedules can be delayed; this is not a one-minute monitoring SLA. The probe checks HTTPS health status, JSON content type, `ok=true`, connected database and disabled authentication bypass. Redirects, HTML protection pages and malformed/incomplete responses fail. It logs no response bodies or credentials. Three consecutive failures (20 seconds apart) fail the job.

Failed runs appear in GitHub Actions. The operator must configure and verify the intended GitHub Actions notification recipients; a failing check alone is not evidence of delivered email/page. Dedicated Sentry/availability-provider ingestion and alert receipt remain separate activation evidence.

## Credentials and scheduler

Configure production-only `CRON_SECRET` as a sensitive value and leave `COMMUNICATION_JOBS_ENABLED=false` until communication providers and due-job behavior have been verified. With this setting, missing/invalid bearer credentials must return 401, and the correct credential returns `503 scheduler_disabled` without executing business jobs. Never exercise the production job processor as a diagnostic when it can send communications or change records.

API Sentry requires `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production` and an immutable `SENTRY_RELEASE`; browser ingestion additionally requires a reviewed `VITE_SENTRY_DSN` rebuild. Verify redaction, event receipt and actual alert delivery using a separate non-production environment. SMTP requires a verified sender and `SMTP_CONFIG`; SMS requires the chosen provider credentials/sender. Do not enable mock providers in production or invent credentials.

Supabase Auth leaked-password protection is a hosted Auth setting requiring an eligible plan and configuration access. It cannot be enabled with business-table SQL. Verify that setting in the hosting account and confirm the security advisor clears after activation.
