# Release candidate validation

The root TypeScript configuration inherits the API's strict settings and checks the actual serverless entrypoint. CI checks both the API compiler mode and NodeNext packaging. The Vercel build also runs this check before building the admin application. Never treat READY as proof of a diagnostic-free build: inspect build logs and test the function.

Operational events use application route templates, UUID correlation identifiers, fixed outcome categories and status codes. Raw payloads, provider errors, customer/financial data, query strings and bearer capabilities must not enter telemetry. Both unhandled errors and handled 5xx responses are monitored. Authentication 401/403 outcomes are recorded separately from defects. The real Sentry SDK is exercised through an in-memory synthetic transport; this does not certify external ingestion or alerts.

External activation checklist (requires configuration and verification, not just a merge):

1. Configure separate preview/production API `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`; configure browser `VITE_SENTRY_DSN` and release only if browser ingestion is required. Rebuild after browser build-variable changes. Keep tracing/replay and default PII disabled unless separately reviewed.
2. Configure an HTTPS availability monitor for `/api/health` every 60 seconds. Alert after three consecutive failures/timeouts; verify both HTTP status and `ok=true`, `database=connected`. Use an authorized deployment-protection authentication path; a protection-page 200 must fail the content check.
3. Configure Sentry alerts for new/regressed server exceptions and sustained finance-area 5xx. Investigate an authentication-failure increase against baseline without sending credentials or captured form data. Configure the intended recipient/escalation destination through the provider; no notifications are sent by the application tests.
4. Send a synthetic event in a non-production environment with no customer records. Verify its receipt, environment/release labels, redaction and alert delivery. Record event/incident identifiers and delivery time. A local in-memory envelope proves sanitization/SDK delivery only.
5. Verify the exact preview SHA, health, JSON API routing, anonymous auth denial, protected route boundaries, CORS allow/deny behavior and SPA deep links. If preview uses the production database, limit checks to read-only operations; mutation acceptance must use isolated synthetic Supabase.
6. Record PASS/FAIL/NOT VERIFIED independently for staging and production. Production schema parity, security settings, backup/PITR and authenticated business workflows are distinct release gates. No production release is certified solely by CI.

The synthetic acceptance suite covers role/tenant isolation, customer/reservation/sale flows, concurrent payments/refunds, supplier payables, reports, documents/Storage and immutable consent. Detail/operator-portal coverage adds real records and tests six viewport/theme combinations; initial-render/API checks do not certify every portal workflow. Public partner capability issue/use/revoke tests are separate.
