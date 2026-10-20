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

Local combined-tree verification: API TypeScript build and 908 tests passed; admin lint passed with 0 errors/51 warnings, 405 tests and production build passed. Local Chromium installation was blocked by a download failure.

The authoritative final-commit CI and isolated browser evidence is attached to integration PR #137: https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/137. Review all six protected checks on the final head before merging. Historical REPORT.md, COVERAGE.md, screenshots and logs describe earlier commits and are not evidence for this integration.

No migration is added and no production financial records are accessed. The historical application-wide form inventory remains broader than this scoped integration; untested surfaces are not certified by this work.

## Visual review follow-up

The first combined acceptance passed 148 finance form checks and 108 authenticated scenarios with no skips/flakes. Screenshot review then exposed two mobile bounds defects: the import dialog lost its outer margin when the preview had wide content, and currency labels extended left of the revenue chart SVG. The integration now permits the import dialog to shrink, reserves chart label width and adds real browser bounds assertions. Zero-only chart series also use a finite scale. All required checks must pass again on this final follow-up commit.
