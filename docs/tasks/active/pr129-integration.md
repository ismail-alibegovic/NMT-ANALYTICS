# PR #129 completion and integration

User-authorized scope: integrate the remaining payment, expense, supplier, document, report and form fixes from #129 into current main. Preserve merged #128, #132, #135 and #136. Use one consolidated integration PR.

Acceptance: API/admin build and tests; both shared form browser suites; authenticated isolated Supabase acceptance covering create/edit/validation/cancel/retry/duplicate suppression and reload. Production records must never be used. Merge only after all six protected checks succeed on the final head.

Do not extend this task into the historical inventory of every application page. Record broader untested surfaces explicitly. No schema migration is planned.
