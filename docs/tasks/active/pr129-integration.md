# PR #129 completion and integration

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

User-authorized scope: integrate the remaining payment, expense, supplier, document, report and form fixes from #129 into current main. Preserve merged #128, #132, #135 and #136. Use one consolidated integration PR.

Acceptance: API/admin build and tests; both shared form browser suites; authenticated isolated Supabase acceptance covering create/edit/validation/cancel/retry/duplicate suppression and reload. Production records must never be used. Merge only after all six protected checks succeed on the final head.

Do not extend this task into the historical inventory of every application page. Record broader untested surfaces explicitly. No schema migration is planned.
