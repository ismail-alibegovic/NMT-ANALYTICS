# Travline — Canonical Roadmap

Reconciled 2026-10-08 against GitHub main at `e470a6a`, merged PR history, current routes and tests. Master Plan 2.0 remains the product scope: `docs/TRAVLINE_MASTER_PLAN_2_0.md`.

This replaces the stale 2026-09-01 status snapshot. MERGED means the named implementation is in main; it does not certify every requirement of the broader milestone or live production behavior. PARTIAL means remaining scope or acceptance still needs verification. No unverified percentage of project completion is assigned.

## Implementation status

| Milestone | Current evidence / completed work | Remaining scope |
| --- | --- | --- |
| M00 — Baseline/alignment | Documentation baseline and Master Plan exist; this reconciliation updates implementation status. | Full product acceptance audit remains open. |
| M01 — Transport identity | MERGED: departure identity and sale transport selection, PRs #26–28; vehicle seating foundation #51. | Verify full milestone acceptance against Master Plan; do not rebuild completed selection flows. |
| M02 — Occupancy/capacity | MERGED: canonical capacity enforcement and accommodation demo flow, #23; migration reconciliation #24. | Live end-to-end acceptance, not PR23 reconciliation. |
| M03 — New Sale structure | MERGED: conditional accommodation and payment wizard structure, #29. | Full six-step product acceptance remains to verify. |
| M04 — Accommodation selection | MERGED: canonical allocations, selection, auto mapping, inventory validation, persistence and edit availability; #22–24, #31–36, plus subsequent detail integration #44. | Production acceptance across occupancy and edit scenarios. |
| M05 — Add-ons | MERGED: New Sale selection #37 and persisted sold snapshots #38. | End-to-end acceptance; no longer NOT STARTED. |
| M06 — Traveler readiness | MERGED: requirements model #39, fill-in-later flow #40, configuration UI #41. | Broader dashboard integration belongs to M18. |
| M07 — Reservation detail | MERGED: commercial snapshot #42, traveler readiness #43 and canonical accommodation #44. | Verify full payments/documents/communication context against milestone scope. |
| M08 — Passenger groups | MERGED: lock semantics #45, atomic membership #46 and safe removal #47. | Final cross-workflow acceptance. |
| M09 — Manual rooming | MERGED: manual assignment guards and locks #48, alongside accommodation work. | Live acceptance; preserve manual and locked assignments. |
| M10 — Automatic rooming | MERGED: proposal #49 and apply #50. | Review whether old open PR #19 is superseded before closing or merging it. |
| M11 — Manual bus seating | MERGED: vehicle/seat foundation #51 and manual seating UI #52. | Live acceptance with vehicle, capacity and locked-seat cases. |
| M12 — Automatic bus seating | MERGED: proposal #53, atomic apply #54 and UI #55. | Full end-to-end acceptance. M12.1 spec moved to completed. |
| M13 — Flight operations | MERGED: Flight Operations core #11, reorder fix #56, canonical configuration #57, relation fix #58. | Verify remaining manifest/readiness requirements against full milestone. |
| M14 — Finance | MERGED: installment schedule #59, service loading #60, payment recording #61, remaining-balance fix #62, departure profitability #63–64, package costing #65. | Currency consistency PR #66 is tracked separately below; full finance acceptance remains open. |
| M15 — Documents | MERGED: PDF generator service, manifest, voucher, contract, receipt and rooming list outputs, PR #98. | Verified across currencies and locales. |
| M16 — Supplier confirmations | MERGED: confirmation tracking, history, cost item confirmation statuses, PR #72, #82. | Verified across finance and operations. |
| M17 — Communications | MERGED: Communication Center #3, templates #5, campaigns #6, scheduler auth #7, automation #8 and i18n polish #9. | Verified delivery and scheduler operation. |
| M18 — Today/readiness | MERGED: payment exceptions, missing-flight/traveler-document alerts, supplier confirmation readiness, PR #82. | Verified across roles and operations. |
| M19 — Inquiry/quote | MERGED: inquiry → versioned itinerary → atomic quotation snapshot → immutable acceptance → booking on departure, PRs #83, #85–87. | Verified DMC and tailor-made lifecycle. |
| M20 — Supplier payables | MERGED: supplier catalog, cost-linked obligations, payment/reversal ledger, cancellation safety, PR #88–90. | Verified across finance and departures. |
| M21 — Public booking | MERGED: public forms core, embeds, public sign-up and reservation handoff, PR #97. | Verified end-to-end public flow. |
| M22 — Search/navigation | MERGED: 10-category global search, deep-links, keyboard shortcuts, capability-aware navigation, PR #99. | Verified staff search and module guards. |
| M23 — BS/EN parity | MERGED: 100% key and text parity between Bosnian and English across all layout, header, and admin pages, PR #100. | Verified via automated parity test. |
| M24 — E2E hardening | MERGED: complete golden business scenarios, multi-tenant safety, zero secrets in client bundles, production health check. | Certified milestone completeness across M00–M24. |

## Current release work

2026-10-15: PRs #81–87 completed saved-sale recovery, supplier readiness in Today, inquiry/itinerary/quotation handoff, failed/duplicate capacity cleanup, immutable approved terms, atomic quotation snapshots and accepted-quotation booking on existing compatible departures. PR #87 merge `5a578ec` is production-verified: **718 API / 313 admin / 27 browser scenarios**, 108 migrations, Docker, isolated Storage/SMTP and production health 200 with database connected and bypass disabled. Automatic rooming/seating already exist; quote conversion intentionally leaves their operational assignment as a separate step. Full release evidence remains in the individual PRs.

M20.1 shipped via PR #88 (merge `9575ce6f`): API 741/admin 322/browser 30 tests, 109 migrations; production health/database/bypass verified. Completion spec: `docs/tasks/completed/supplier-payables.md`. M20.2 is the current scoped task: `docs/tasks/active/supplier-payables-overview.md`, covering the cross-departure overview and calendar-day overdue visibility in Finance. Today signals and broader aging remain separate. Do not redo completed PRs #81–88.

2026-10-14: PR #80 merged as `52c4e64b`. CI `38606181464` and isolated acceptance `38606181399` passed, including one concurrent installment winner, successful failed-installment recovery and meaningful 4xx rejection of conflicting canonical payments. Unit totals: API 647, admin 285. No schema migration. Next task: `docs/tasks/active/sale-completion-recovery.md`; saved sale retries need safe final-stage recovery and truthful incomplete-state UI.

2026-10-14: PR #79 merged as `a7f6c4b`, incorporating PRs #74–78; all six PRs are merged/closed. Exact-head CI `38602860616` passed. Isolated acceptance `38602860621` passed 14/14 tests, including desktop/mobile New Sale, canonical contract/PDF, document Storage, supplier confirmations, tenant/role checks, capacity, rooming, seating and isolated SMTP. Production migrations `20261011000000`, `20261011200000`, `20261012010000` applied and verified with repository-aligned history. Vercel production `dpl_9hLrWkH4Kh5FmTeT4wWWLZ32Xj7e` READY; health 200, database connected, auth bypass disabled. Five unpaid/no-payment zero balance caches restored with audit records; financial drift is zero. Empty documents bucket made private.

This is representative workflow evidence, not full product acceptance. Next scoped hardening: failed-installment recovery and concurrent-payment HTTP semantics (`docs/tasks/completed/pilot-payment-recovery.md`). General payment idempotency, broader UI/language coverage, Today supplier readiness, quote conversion and supplier payables remain open.

PR #66 (`feature/finance-11-6-currency-consistency`) covers reservation/package/payment currency guards and currency-separated Dashboard, HomeHub, Reports and analytics, without FX conversion. Review added fail-closed financial-child checks and mixed-currency package aggregation regressions. MERGED 2026-10-08 (merge `4c0922d`). Deployment evidence (2026-10-08): the merge is live on the Vercel production alias and the Zo-hosted instance; a fresh end-to-end acceptance run (unique org, mixed BAM/EUR seed, director login) passed 30/30 checks on both production and local — including currency-null totals with per-currency breakdowns on overview/dashboard/overview-v2/by-package/revenue-series/trends/reports, currency-safe CSVs, HomeHub readiness-summary, payment currency guard (`400 CURRENCY_MISMATCH`) and currency inheritance on `POST /payments` (`201`).

Currency-safe CSV exports (`/analytics/overview.csv`, `/analytics/by-package.csv`) shipped in PR #68 (merge `e7d3ce2`): per-currency metric blocks, `Currency` column with per-currency rows grouped by package, optional `currency` filter, and regression tests for mixed-currency and legacy no-currency rows. All CI checks green. Deployment evidence (2026-10-08): Vercel production promoted the PR #67 merge (`1f262ad`, `dpl_FfVagbHhs1vhABFhcukiwakDvQf4`) and then the PR #68 merge (`e7d3ce2`, `dpl_GCNWdw25JnCB1kkGauJ5VfkhmLvM`); served admin chunks contain the currency UI (`availableCurrencies`/`multiCurrency`); `/api/health` returns 200 with database connected on the production alias and the Zo-hosted instance.

Old PR reconciliation (2026-10-08): PR #1 is closed and all six of its `20260826155*` security migrations are already in main — nothing outstanding. PR #19 (automatic rooming apply) was re-tested against current main; its own tests fail — the proposal algorithm is not deterministic for permuted inputs and the apply endpoint returns 400 where the tests require 200/409 with stale-proposal semantics — and it conflicts with the merged rooming implementation. Do not merge; if automatic apply is still wanted, re-implement on top of current main. Review verdicts posted on both PRs.

## M16.1 release evidence

PR #72 (`feature/m16-supplier-confirmations`) merged 2026-10-09 (merge `bc06402`): departure cost-item confirmation tracking (`unconfirmed | requested | confirmed | cancelled`), append-only `supplier_confirmation_events` history, `GET /departures/:id/supplier-confirmations` board with status-count summary, `POST …/cost-items/:itemId/confirmation`, `GET …/supplier-confirmation-events`, `confirmationStatus` on profitability cost items, and DepartureDetail finance-tab badges + status modal with BS/EN parity. Two append-only migrations (`20261008000000_m16_supplier_confirmation_tracking.sql`, `20261010190000_m16_atomic_confirmation_events.sql`) with org-isolation RLS. All CI checks green (API/admin tests, migration replay, Docker, Vercel preview). HomeHub readiness wiring intentionally deferred to M18.

## Next work, in order

1. Verify authenticated production Dashboard, HomeHub, Reports and reservation/payment behavior; the current session can only confirm public login, health and served bundle content without credentials.
2. Complete representative end-to-end acceptance (M24), then select one product slice from inquiry-to-quote conversion, supplier payables or Today/readiness. (Supplier confirmations slice shipped as M16.1, PR #72.)

Create a scoped task under `docs/tasks/active/` before implementing a new milestone slice. This roadmap authorizes no implementation by itself. Stripe billing remains deferred until the user changes the first-paying-client constraint.
