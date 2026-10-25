# Monitoring activation readiness

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

Owner scope: activate API and SPA Sentry later through configuration; credentials are deferred. No live events sent.

API SENTRY_DSN enables initialization before Express; SENTRY_ENVIRONMENT and SENTRY_RELEASE provide labels. Missing DSN logs a safe disabled notice and health reports sentryEnabled=false. Browser VITE_SENTRY_DSN enables initialization, with VITE_APP_VERSION release; Vite variables require a rebuild/redeploy, not code or migration. Missing browser DSN now logs a safe disabled notice. Neither surface enables tracing/replay or default PII collection.

A conservative beforeSend privacy boundary removes headers/cookies/body/query/fragment, email/IP, free-text error values, extras, arbitrary tags/contexts, breadcrumb content and frame variables. Exception type/stack paths and tenant/user IDs remain. This intentionally sacrifices raw error-message detail to avoid sending provider credentials and customer/financial form data. Capture integrations are tested with SDK mocks only. A real owner-approved smoke event and Sentry receipt verification remain deferred activation acceptance.
