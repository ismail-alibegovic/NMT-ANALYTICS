# Provider readiness hardening

Owner request: Travline V1 production readiness, 2026-10-16.
Scope: fail-closed email/SMS transports, tenant configuration safety, diagnostics and credential-safe errors. External provider activation is deferred. No real messages, production configuration changes or production migrations.
Acceptance: incomplete SMTP cannot report a send; saved passwords survive masked edits; database failures cannot report a save; only provider acceptance counts as sent; production mock transports reject; tests use isolated mocks/capture servers.
Validation: API build/tests, admin lint/tests/build, migration replay and isolated Supabase acceptance in PR CI. No local Docker or Supabase CLI is available in this workspace.
