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
| M15 — Documents | PARTIAL: PDF routes and generators exist. | Verify current contracts, receipts, vouchers, manifest and rooming-list output, including currencies. |
| M16 — Supplier confirmations | NOT VERIFIED AS IMPLEMENTED: supplier/service catalog exists. | Operational confirmation workflow remains backlog; catalog is not confirmation tracking. |
| M17 — Communications | MERGED: Communication Center #3, templates #5, campaigns #6, scheduler auth #7, automation #8 and i18n polish #9. | Verify delivery configuration and scheduler operation in the target deployment. Old notes saying “not started” are obsolete. |
| M18 — Today/readiness | PARTIAL: HomeHub has payment exceptions plus missing-flight and traveler-document alerts. | Verify existing signals and complete supplier readiness and remaining cross-workflow gaps. |
| M19 — Inquiry/quote | PARTIAL: inquiry CRUD, public intake, quotations with items/status/PDF (`quotations.ts`) exist. | Verify the connected inquiry-to-quote workflow and implement/verify reservation conversion; do not rebuild quotation CRUD. |
| M20 — Supplier payables | PARTIAL FOUNDATION: supplier catalog, package costing and departure profitability exist. | Outstanding supplier obligations, settlement and payable workflow are not established by costing alone. |
| M21 — Public booking | MERGED: public forms core #10 and product integration #12. | End-to-end public submission and booking acceptance. |
| M22 — Search/navigation | PARTIAL: global search and module guards exist. | Search coverage and capability-aware navigation audit. |
| M23 — BS/EN parity | PARTIAL: localized workflows and communication polish exist. | Fresh parity sweep; old hardcoded-string counts are not current measurements. |
| M24 — E2E hardening | PARTIAL: CI covers API/admin tests, builds, migration replay and Docker. | Browser workflow suite, representative demo data and production acceptance. Unit tests are not a substitute for these. |

## Current release work

PR #66 (`feature/finance-11-6-currency-consistency`) covers reservation/package/payment currency guards and currency-separated Dashboard, HomeHub, Reports and analytics, without FX conversion. Review added fail-closed financial-child checks and mixed-currency package aggregation regressions. Record final merge and deployment evidence here when available.

Currency-safe CSV exports (`/analytics/overview.csv`, `/analytics/by-package.csv`) shipped in PR #68: per-currency metric blocks, `Currency` column with per-currency rows grouped by package, optional `currency` filter, and regression tests for mixed-currency and legacy no-currency rows. Deployment evidence: Vercel production promoted the PR #67 merge (commit `1f262ad`) on 2026-10-08; health endpoint 200 with database connected; login page 200. Record PR #68 merge and promotion evidence here when available.

## Next work, in order

1. Verify authenticated production Dashboard, HomeHub, Reports and reservation/payment behavior; the current session can only confirm public login and health without credentials.
2. Record PR #68 (currency-safe CSV exports) merge and production promotion evidence when CI completes.
3. Reconcile old open PRs #19 and #1 with current main. Neither should be merged merely because it is open.
4. Complete representative end-to-end acceptance (M24), then select one product slice from supplier confirmations, inquiry-to-quote conversion, supplier payables or Today/readiness.

Create a scoped task under `docs/tasks/active/` before implementing a new milestone slice. This roadmap authorizes no implementation by itself. Stripe billing remains deferred until the user changes the first-paying-client constraint.
