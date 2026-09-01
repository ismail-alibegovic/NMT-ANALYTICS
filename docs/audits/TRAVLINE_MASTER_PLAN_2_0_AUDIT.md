# Travline — Master Plan 2.0 Alignment Audit

**Date:** 2026-09-01
**Scope:** Reconcile repository state vs. `TRAVLINE_MASTER_PLAN_2_0.md` (M00–M24)
**Based on:** prior 96-point baseline audit (`docs/audits/TRAVLINE_BASELINE_AUDIT.md`) and current `codex/accommodation-demo-flow`.

> This is a documentation-only task. No code changed.

---

## 1. Key findings

The existing baseline audit (2026-08-31, 96 points A1–L96) was keyed to `TRAVLINE_MASTER_ZAHTJEVI` (42 sections). Master Plan 2.0 restructures the roadmap into 25 tasks (M00–M24) with different domain boundaries:

- Old "Smart Reservation Flow (§10)" → split across M03/M04/M05/M06
- Old "Package variants (§30)" → superseded; no variants abstraction in M-plan
- Old "integrations foundation" → deferred out of M-plan scope
- M16 (supplier confirmations) and M20 (supplier payables) are new scope not in the old ZAHTJEVI
- Old T01–T38 task decomposition is archived; M00–M24 is now canonical

PR #23 (`codex/accommodation-demo-flow`, 7 commits, +6273/−1194) contains valuable M02/M04/M09 work stranded on a branch one commit behind main. It must be reconciled before M01 starts.

---

## 2. M-task status matrix

| M-task | Status | Evidence | On main | On PR23 | Notes |
|---|---|---|---|---|---|
| M00 — Baseline freeze | IN PROGRESS | This document + prior audit A1-L96 | ✅ | — | Needs re-keyed audit against M-plan |
| M01 — Package/Departure/Transport | PARTIAL | B11-B14, C16 DONE; C17 MISSING | ✅ | — | No fleet/vehicles model; transport_type only |
| M02 — Departure occupancy/capacity | PARTIAL | Capacity exists; enforcement on PR23 only | ⬜ | ✅ | `departureCapacity.ts` + migration |
| M03 — New Sale wizard structure | NOT STARTED | A8 MISSING; static form only | ⬜ | ⬜ | PR23 adds accommodation step only |
| M04 — Accommodation selection in sale | DONE on PR23 | reservationAccommodation.ts + room slots migration | ⬜ | ✅ | Package-scoped filtering in wizard |
| M05 — Optional services | NOT STARTED | T13 MISSING | ⬜ | ⬜ | |
| M06 — Traveler readiness / fill-in-later | PARTIAL | F46/F47 doc_readiness migration; not wired | ✅ | — | docAttention quickFilter exists |
| M07 — Reservation detail (single context) | PARTIAL | ReservationDetail + snapshots B15 DONE | ✅ | — | Not yet unified single context |
| M08 — Passenger groups hardening | DONE | D24–D30 baseline-verified | ✅ | — | |
| M09 — Manual rooming | DONE | E35–E37; slot-tracking enhanced on PR23 | ✅ | ✅ | |
| M10 — Automatic rooming | DONE core | E38–E41; full-room semantics PARTIAL to verify | ✅ | — | |
| M11 — Manual bus seating | DONE | C19 baseline-verified | ✅ | — | |
| M12 — Auto bus seating + groups-together | DONE core | C20–C21; split-visibility C22 PARTIAL | ✅ | — | Flight-guard C23 PARTIAL |
| M13 — Flight Ops + manifest/readiness | PARTIAL | F42-F48; authority field F45 MISSING | ✅ | — | |
| M14 — Payments/installments | PARTIAL | Core routes DONE; full workflow pending | ✅ | — | |
| M15 — Documents | PARTIAL | PDFs (contracts/receipts/voucher/manifest) DONE | ✅ | — | Scope not re-verified |
| M16 — Supplier confirmations | NOT STARTED | P11 long-term only | ⬜ | ⬜ | New scope in M-plan |
| M17 — Communication connection | DONE core | G49-G59; SMS UX G60 + parity G61 PARTIAL | ✅ | — | Templates, campaigns, auto DONE |
| M18 — Today/readiness dashboard | PARTIAL | I72–I81 | ✅ | — | |
| M19 — Inquiry/quote pipeline | PARTIAL | Inquiries route DONE; quote conversion not | ✅ | — | |
| M20 — Supplier payables | NOT STARTED | P11 long-term only | ⬜ | ⬜ | New scope in M-plan |
| M21 — Public booking page | DONE | H63–H71; P7.1 baseline-verified | ✅ | — | Forms + submission + inquiry pipeline |
| M22 — Global search + nav audit | PARTIAL | I78–I81; GlobalSearch exists | ✅ | — | |
| M23 — i18n parity sweep | PARTIAL | J82–J86; ~71 hardcoded BS strings | ✅ | — | |
| M24 — E2E hardening | PARTIAL | K87–K96; no Playwright/Cypress K91 | ✅ | — | |

---

## 3. PR #23 contribution breakdown

PR #23 (`codex/accommodation-demo-flow`, 38 files, +6273/−1194):

**Contributes to:** M02, M04, M09, M10

**Specific additions:**
- M02: `lib/departureCapacity.ts` (+235), `enforce_departure_passenger_capacity.sql`, departureOccupancy + passengerSafety tests
- M04: `lib/reservationAccommodation.ts` (+229), `reservation_accommodation_room_slots.sql`, EditReservationModal accommodation flow, NewSaleWizard accommodation step
- M09: RoomingWorkspace refactored with slot tracking
- Infra: `seed_record_registry.sql`, `SECURITY DEFINER` privilege hardening

**Warning:** PR23 deletes `docs/audits/TRAVLINE_BASELINE_AUDIT.md` and partially rewrites `docs/ROADMAP.md`. These must be reverted before merge.

---

## 4. Conflicting legacy concepts

1. **Package transport model** — `transport_type` scalar flag vs. M01 canonical transport model spanning package→departure→reservation
2. **Departure transport model** — generic seat map treats all transport uniformly vs. M01/M13 flight≠bus differentiation
3. **New Sale transport selection** — static form vs. M03 progressive disclosure driven by selected package/departure
4. **Accommodation selection** — separate from sale flow vs. M04 inline package-scoped allotment in wizard
5. **Reservation vs passenger roles** — passenger as departure entity vs. M07 reservation as commercial container
6. **Legacy rooming model** — proposal→apply RPC with coarse error semantics vs. M09/M10 manual drag-drop + atomic enforcement
7. **Stale `departures.booked`** — capacity tracked but not enforced vs. M02 atomic occupancy enforcement
8. **Package variants/accommodation overlap** — T05 "variants" conflates concepts vs. M01/M04 explicit separation

---

## 5. T→M task mapping

| T-tasks | Maps to | Verdict |
|---|---|---|
| T01 Package CRUD | M01 | MAP (fold into canonicalization) |
| T02 Hotel catalog CRUD | M01 / M04 / M09 | MAP |
| T03 Transport types | M01 | MAP |
| T04 Package accommodation | M04 / M01 | MAP |
| T05 Package variants | — | SUPERSEDED |
| T06 Package→Departure materialization | M01 | MAP |
| T07 Departure inventory override | M01 | MAP |
| T08 Reservation/New Sale CRUD | M03 | MAP |
| T09 Progressive disclosure | M03 | MAP |
| T10 Flight pkg travel docs | M06 / M13 | MAP |
| T11 Bus int'l travel docs | M06 | MAP |
| T12 Package-driven accommodation | M04 | MAP |
| T13 Optional services | M05 | MAP |
| T14 Reservation accommodation reqs | M04 | MAP |
| T15 Edit reservation atomic | M03 / M04 | MAP |
| T16 Passengers | M06 / M07 | MAP |
| T17 Passenger groups | M08 | MAP |
| T18 Accommodation inventory | M04 / M09 / M10 | MAP |
| T19 Operational room slots | M02 / M09 | MAP |
| T20 Manual rooming | M09 | MAP |
| T21 Rooming validations | M09 | MAP |
| T22 Automatic rooming | M10 | MAP |
| T23 Final rooming list | M09 / M10 | MAP |
| T24 Bus/vehicle | M01 | MAP |
| T25 Auto bus seating | M12 | MAP |
| T26 Flight Ops + traveler data | M13 | MAP |
| T27 Payments/installments | M14 | MAP |
| T28 Document generation | M15 | MAP |
| T29 Email/SMS | M17 | MAP |
| T30 Newsletter/reminders/campaigns | M17 | MAP |
| T31 Public forms & embeds | M21 | MAP |
| T32 Dashboard & global search | M18 / M22 | MAP (split) |
| T33 Inquiries/leads | M19 | MAP |
| T34 i18n parity | M23 | MAP |
| T35 UI polish | M03–M18 | MAP (distributed) |
| T36 Integrations foundation | — | NO LONGER NEEDED |
| T37 Golden E2E dataset | M24 | MAP (subset) |
| T38 Agency demo accounts | M24 | MAP (subset) |

---

## 6. Old task disposition

All T01–T38 phase files (`01-core-crud.md` through `15-e2e-production.md`), `INDEX.md`, and old `README.md` moved to `docs/tasks/archived/`. Not deleted. New canonical roadmap is M00–M24 in ROADMAP.md.

---

## 7. Recommended first executable development task after alignment

**M01 — Package/Departure/Transport canonicalization**

Why: it is the domain foundation M02 (occupancy), M03 (wizard), M04 (accommodation), M06 (readiness), and M13 (flights) all depend on. Also directly resolves 3 of the 8 conflicting legacy concepts.

Prerequisites before starting M01:
1. Reconcile PR #23: revert its deletion of the baseline audit, then decide merge strategy for its stranded M02/M04 work.
2. Complete M00 (this audit) by committing the alignment artifacts to the repository.
