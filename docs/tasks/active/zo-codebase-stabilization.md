# Zo codebase stabilization

User-authorized task, 2026-10-23: stabilize existing code for Zo deployment, starting from origin/main. Zo owns deployment/runtime verification. No production data changes, production migrations, paid-service activation, redesign or architecture replacement.

First slice: deterministic production environment loading across config, instrumentation, Supabase and start-production.sh; production authentication bypass must fail closed. Preserve explicit runtime configuration and production-local file support; do not commit secrets. Regression tests must cover process/file precedence, unsafe flags and import boundaries.

Then review existing authentication/tenant, reservations/travelers, accommodation, transport, finance, documents, communications, imports/exports, analytics and admin coverage. Run API/admin checks, isolated integration/migration and browser tests where available. Report unverified surfaces explicitly. Use logical branches/PRs and normal protected merges after all required checks pass.
