# Scheduler readiness

> Commercial scope override — 2026-10-25: **DEFERRED ACTIVATION — retain safety code; no provider/job activation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

Owner-authorized scope: fix Vercel GET/POST incompatibility, preserve bearer-secret authentication, add an explicit disabled-by-default execution gate and regression tests. No production activation.

All three job endpoints accept authenticated GET and POST. Unsupported methods return 405. Both CRON_SECRET and the legacy SCHEDULED_CAMPAIGNS_CRON_SECRET remain accepted. COMMUNICATION_JOBS_ENABLED must equal true; otherwise no worker is called. Worker exceptions return a sanitized 503. Existing per-message failure counters remain visible.

## Activation and cadence

Leave COMMUNICATION_JOBS_ENABLED unset until providers, schema parity and isolated/pilot checks are complete. Owner configures a strong CRON_SECRET and the gate only after approval. Vercel sends GET with Authorization: Bearer CRON_SECRET. Do not call these endpoints in production as a read-only diagnostic: an authorized enabled request performs work.

The existing 06:00 UTC daily declaration is unchanged and is insufficient for hourly automation windows or precise scheduled sends. Daily invocations can miss before-departure/payment windows; Hobby scheduling may also vary within the hour. For time-sensitive pilot communications use an approved scheduler at <=5 minute intervals (or a plan supporting that cadence) against the same endpoint. Scheduling frequency is infrastructure configuration, not new application development. Keep time-sensitive rules disabled until cadence is configured and execution history is observed.

## Retry safety

Campaign sending uses a status compare-and-set claim. Automation occurrences have a unique rule/entity claim; failed and pending occurrences are not automatically retried. Departure notification generation deduplicates occurrences. These avoid ordinary duplicate invocations; they do not provide exactly-once external delivery. A crash after provider acceptance can leave an ambiguous occurrence. Reconcile provider logs and communication history before operator retry; do not reset all claims or automatically retry an entire batch. Missing providers reject or skip individual sends, never report delivery. The execution gate prevents consuming claims while provider activation is deferred.

Required validation: API build/tests, existing concurrency and duplicate-claim tests, all PR CI including isolated acceptance. No schema changes.
