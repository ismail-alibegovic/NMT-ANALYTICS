# Final I18N-04A — Customer Detail translations and truthful currency display

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

**Status:** IMPLEMENTED LOCALLY — dependency integration and remote CI pending
**Priority:** P1
**Branch:** `fix/i18n-customer-detail`
**Roadmap:** Final roadmap I18N-04, with a narrowly scoped SEC-02 display-integrity repair pulled forward.

## Goal and confirmed defects

Complete the existing CustomerDetail screen in BS/EN without rebuilding it. It currently mixes English summary/tabs/errors and Bosnian table labels, fixes all formatting to bs-BA, aggregates different currencies as BAM, presents only 50 loaded reservations as complete totals, and omits reservation currency in timeline payload/display. Loading failures appear as not-found, and old route responses can overwrite a newer customer. These are explicit requirements of this screen slice, not permission for a finance/domain rewrite.

## Scope

- Reuse existing dictionaries/status labels and add only missing Customer Detail copy.
- Follow the current language for text, money, calendar-day booking dates and timestamp display. Retain the locale fallback proven in I18N-01.
- Show per-currency subtotals of loaded rows, clearly disclose loaded versus server total count, and never assume BAM for missing currency. Invalid/missing monetary values remain unavailable rather than fabricated as zero. No FX conversion, new pagination feature, stored financial recalculation or API aggregation endpoint.
- Add existing reservation currency to the tenant-scoped timeline read payload. Fail on underlying timeline read errors instead of returning success with misleading empty data. No auth/RLS/schema changes.
- Distinguish loading, not-found and retryable errors; ignore superseded route requests. Preserve existing tabs, table, spacing and themes.

## Required tests and acceptance

Reproduce mixed-currency totals and missing timeline currency before the fix. API route tests assert org/customer filters, foreign-tenant exclusion, source currency and safe database-error handling. Component tests cover BS/EN switching without refetch, per-currency loaded summaries, missing currency, pagination disclosure, timeline labels/currency, date-only timezone safety, loading failures/retry/not-found and superseded requests. Browser fixture uses the actual screen and synthetic transport at mobile/desktop in both themes/languages. Required API/admin build/tests/lint, relevant type checks and exact-head CI before merge.

## Boundaries

No migrations, seed/reset, production/customer writes, mutation endpoint changes, auth changes, unrelated modules or redesign. Financial display correctness is pulled forward only because translating misleading customer totals would preserve a confirmed defect. Full-history financial aggregation and broader backend auditing remain separate roadmap work.

## Completion record

Old API reproduced 4 failures/1 pass; old UI reproduced 7 failures/1 pass. Corrected route tests: 5 passed. Full API: 1,009 tests, build and strict/NodeNext type checks passed. Full admin: 517 tests/build passed; lint zero errors/51 existing warnings. Browser: 7 CustomerDetail and 4 Reports scenarios passed. Exact files and evidence are recorded in the final roadmap. No migrations or production actions. PR/merge and required remote CI pending. Integrate after foundation PRs #151–#153.
