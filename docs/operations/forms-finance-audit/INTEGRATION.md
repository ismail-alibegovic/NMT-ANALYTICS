# PR #129 integration on current main

Base: `74989b833fa378a82e587e1abdaeda9698d95d3a`. Source: #129, `581a3f79ed36ef0c54f9ef44afff42bf789d2340`. Branch: `integrate/pr129-completion`.

## Already integrated

- #128: Flight forms, native Input attributes, modal accessibility/focus/scrolling and original form browser suite.
- #132: rooming/seating fixes and regressions.
- #135: toolbar labels and light/dark contrast.
- #136: refund eligibility and tenant-scoped compare-and-set, booking-date analytics, fail-closed report errors and stronger tenant-refund assertions. These API changes are absent from this integration diff.

## Remaining changes integrated

- Payments: one shared validated form; cancel/reset, draft retention after failure, synchronous duplicate guards, local calendar dates and existing idempotent API transport. Embedded list payments and editing use the same form.
- Expenses: blank unit-cost validation, synchronous save guard, clearable notes, accessible fields, mobile layout and retained failed drafts.
- Supplier payables: serialized issue/payment/reversal/cancel submissions; existing durable retry intent retained. Supplier directory/services gain required/numeric validation, cancel/reset and failed-save recovery.
- Documents: paginated/searchable admin list contract with legacy array compatibility; failed upload retains the file; retryable deletion preserves the record when Storage fails; tenant-scoped download/delete.
- Reports: authenticated CSV transport, stale-response protection, explicit error/retry state, localized labels and currency/date behavior.
- Imports: CSV/XLSX preview/result envelopes, failed-file retention, validation and duplicate-submit guard.
- Authentication and sub-agents: validated accessible forms, controlled checkboxes, confirmation/recovery flows, list metadata persistence and working portal issue/revoke lifecycle.

## Conflict resolution

Retained current main Input native-prop support and refund safety assertions. Combined modal text contrast with current dialog semantics/focus/scrolling. Playwright excludes both fixture suites from real acceptance, while running each fixture suite separately. Acceptance seed preserves the original two security tenants, Flight tenant and a separate entitled finance director.

## Verification

Pending final integration CI and isolated browser acceptance. Historical REPORT.md, COVERAGE.md, screenshots and logs describe earlier commits and are not evidence for this integration. Current results will be recorded here after verification.

No migration is added and no production financial records are accessed. The historical application-wide form inventory remains broader than this scoped integration; untested surfaces are not certified by this work.
