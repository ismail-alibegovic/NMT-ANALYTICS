# Zo stabilization: export and error privacy

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

Authorized stabilization follow-up. Correct malformed CSV escaping and prevent spreadsheet formula execution in existing exports. Preserve numeric money cells, export schemas and tenant filters. Stop internal API errors from returning provider/SQL details while retaining actionable 4xx validation details. Reject privileged Supabase keys before frontend production bundling and at browser initialization. No credentials, migrations, production writes or service activation.

Verify with parser round trips, real route regressions using synthetic transport, full API/admin tests/build/lint and required protected GitHub CI. This is a security/correctness slice, not a redesign or certification of all product behavior.
