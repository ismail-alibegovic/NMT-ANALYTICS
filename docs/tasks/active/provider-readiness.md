# Provider readiness hardening

> Commercial scope override — 2026-10-25: **DEFERRED ACTIVATION — retain safety code; no provider/job activation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

Owner request: Travline V1 production readiness, 2026-10-16.
Scope: fail-closed email/SMS transports, tenant configuration safety, diagnostics and credential-safe errors. External provider activation is deferred. No real messages, production configuration changes or production migrations.
Acceptance: incomplete SMTP cannot report a send; saved passwords survive masked edits; database failures cannot report a save; only provider acceptance counts as sent; production mock transports reject; tests use isolated mocks/capture servers.
Validation: API build/tests, admin lint/tests/build, migration replay and isolated Supabase acceptance in PR CI. No local Docker or Supabase CLI is available in this workspace.
