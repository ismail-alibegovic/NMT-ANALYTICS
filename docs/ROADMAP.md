# Travline — Canonical Roadmap

**Purpose:** prioritized product backlog keyed to Master Plan 2.0 (M00–M24). This is planning context, not an instruction to implement everything at once.

**Canonical plan:** `docs/TRAVLINE_MASTER_PLAN_2_0.md`

> The previous P0–P11 roadmap (based on `TRAVLINE_MASTER_ZAHTJEVI`) has been superseded. Its structure is preserved in commit history. The old T01–T38 task decomposition is archived at `docs/tasks/archived/`.

## Status legend

- `DONE` — confirmed completed; do not rebuild unless a regression is demonstrated.
- `PARTIAL` — meaningful implementation exists, but the end-to-end product workflow still needs completion/verification.
- `NOT STARTED` — no implementation exists.
- `ACTIVE` — an explicit current initiative exists.
- `DEFERRED` — intentionally postponed.

M00 is a meta-task (documentation/alignment). M01–M24 are product development tasks in dependency order.

Before turning any M-task into code, create a scoped spec under `docs/tasks/active/` using `docs/tasks/TEMPLATE.md`.

---

## Master Plan 2.0 — M00–M24

### M00 — Baseline freeze and master-plan alignment — ACTIVE

**Status:** IN PROGRESS. Existing 96-point baseline audit (`docs/audits/TRAVLINE_BASELINE_AUDIT.md`) keyed to old `ZAHTJEVI`. Alignment audit (`docs/audits/TRAVLINE_MASTER_PLAN_2_0_AUDIT.md`) produced 2026-09-01.

**Evidence:** `docs/audits/TRAVLINE_BASELINE_AUDIT.md` (296 lines, A1–L96), this roadmap.

---

### M01 — Package/Departure/Transport canonicalization — PARTIAL

Foundations DONE (B11–B14, C16 from baseline audit). Missing: single canonical transport model, `vehicles`/fleet resource table (C17 MISSING), coherent package→departure→reservation transport selection.

**Evidence:** `transport_type` on departures; `departure_flights`; `bus_seat_categories`; baseline A1–L96 (B11–B14 DONE, C16 DONE, C17 MISSING).

**Depends on:** M00 (alignment complete).

---

### M02 — Departure occupancy and capacity enforcement — PARTIAL on main / DONE on PR23

Capacity field exists on main. Atomic occupancy enforcement (`departureCapacity.ts` + `enforce_departure_passenger_capacity` migration) exists only on PR #23 (`codex/accommodation-demo-flow`).

**Evidence:** PR23 adds `lib/departureCapacity.ts` (+235), `20260831223011_enforce_departure_passenger_capacity.sql`, `departureOccupancy.test.ts`.

**Depends on:** M01 (transport model informs capacity semantics). PR #23 must be reconciled first.

---

### M03 — New Sale wizard structure (6-step progressive disclosure) — NOT STARTED

NewSaleWizard exists but form is static — no progressive disclosure driven by selected package/departure (A8 MISSING in baseline).

**Evidence:** `NewSaleWizard.tsx` captures passengers but does not adapt fields to trip type. PR23 adds accommodation step only, not the full 6-step structure.

**Depends on:** M01 (transport model), M02 (capacity enforcement).

---

### M04 — Accommodation selection in New Sale — DONE on PR23

Package-scoped hotel/room filtering with availability display in reservation edit/wizard. Not available on main.

**Evidence:** PR23 adds `lib/reservationAccommodation.ts` (+229), `reservation_accommodation_room_slots.sql` migration, `EditReservationModal` + `NewSaleWizard` accommodation flow, `reservationAccommodation.test.ts`.

**Depends on:** M01 (canonical accommodation reference). PR #23 must be reconciled.

---

### M05 — Optional services / add-ons — NOT STARTED

No package-scoped optional services auto-offered in New Sale. T13 MISSING in old task system.

**Evidence:** No route, component, or migration for optional-service selection in sale flow.

**Depends on:** M03 (wizard structure), M01 (package service model).

---

### M06 — Traveler readiness (fill-in-later, missing-data signals) — PARTIAL

`document_readiness` migration + `docAttention` quickFilter exist (F46/F47 PARTIAL). Not wired as full readiness dashboard or fill-in-later workflow.

**Evidence:** F46/F47 from baseline. No fill-in-later state machine; no readiness summary per spec.

**Depends on:** M03 (wizard must support "fill-in-later"), M13 (flight readiness).

---

### M07 — Reservation detail (single context for payments/docs/communication) — PARTIAL

ReservationDetail screen + quotation snapshots exist (B15 DONE). Not yet unified single context covering payments, documents, and communication from one view.

**Evidence:** `ReservationDetail` component; `quotation_snapshots` migration; baseline A9/A10 PARTIAL.

**Depends on:** M03 (reservation creation flow).

---

### M08 — Passenger groups hardening — DONE

Group CRUD, member management, colors, preferences, departure/org scoping all baseline-verified (D24–D30 DONE).

**Evidence:** D24–D30 DONE in baseline audit. `passengerGroups.ts` route; `autoColor()`; `seating_preference`; `accommodation_pref`.

---

### M09 — Manual rooming — DONE

Room assignment, move, unassigned traveler workflow verified. Enhanced with slot tracking on PR23.

**Evidence:** E35–E37 DONE in baseline. `accommodation.ts` assign/move endpoints. PR23 refactors `RoomingWorkspace.tsx` with slot tracking.

---

### M10 — Automatic rooming — DONE core

Proposal → atomic apply via RPC. Keeps groups together. Full-room conflict semantics (E41) PARTIAL to verify.

**Evidence:** E38–E41 DONE/PARTIAL in baseline. `/departures/:id/rooming/proposal` → `apply` endpoints; `batch_update_seats_atomic` RPC.

---

### M11 — Manual bus seating — DONE

Interactive seat map with manual assignment verified (C19 DONE).

**Evidence:** C19 DONE in baseline. `SeatMap.tsx`; `seats.ts` endpoints.

---

### M12 — Automatic bus seating + keep-groups-together — DONE core

Auto-assign and group-auto-assign endpoints DONE. Split-group visibility (C22) and flight-guard (C23) PARTIAL.

**Evidence:** C20–C21 DONE, C22/C23 PARTIAL in baseline. `/seats/auto-assign` + `/seats/group-auto-assign/:groupId`.

---

### M13 — Flight Ops + manifest/readiness — PARTIAL

Flight CRUD DONE. Passport authority field MISSING (F45). Readiness signals partial (F46–F48). Flight workflow UX not connected to departure workspace.

**Evidence:** F42–F48 PARTIAL in baseline. `flights.ts` CRUD + FlightsPage; `departure_flights` migration.

**Depends on:** M01 (transport model ensures flight≠bus differentiation).

---

### M14 — Payments/installments — PARTIAL

Core routes DONE (payments, installments, contracts, receipts CRUD). Full workflow verification pending.

**Evidence:** `payments.ts`, `installments.ts`, `contracts.ts`, `receipts.ts` routes present. Dashboard endpoint exists.

---

### M15 — Documents — PARTIAL

PDF generation DONE (contracts, receipts, voucher, manifest, rooming-list). Scope against M15 spec not re-verified.

**Evidence:** `documents.ts`, `departureDocuments.ts` routes; PDF utilities present.

---

### M16 — Supplier confirmations — NOT STARTED

New scope in Master Plan 2.0. No prior implementation.

**Evidence:** Not in old ZAHTJEVI or baseline audit. P11 long-term only.

---

### M17 — Communication connection (templates + manual send) — DONE core

Templates CRUD, manual send, recipient resolution, communication history, campaigns, and automation engine all verified (G49–G59 DONE). SMS-length UX (G60) and BS/EN parity (G61) PARTIAL.

**Evidence:** `communicationSend.ts`, `messageTemplates.ts`, `campaigns.ts`, `automationRules.ts`, `recipientResolver.ts`. G60/G61 PARTIAL in baseline.

---

### M18 — Today/readiness dashboard — PARTIAL

HomeHub + dashboard stats endpoint exist. Missing traveler/doc/supplier readiness signals (I72–I81 PARTIAL).

**Evidence:** I72–I81 PARTIAL in baseline. `HomeHub` component; `payments/dashboard` endpoint; `docAttention` quickFilter.

**Depends on:** M06 (readiness signals), M14 (payment exceptions), M16 (supplier confirmations).

---

### M19 — Inquiry/quote pipeline — PARTIAL

Inquiries route DONE. Quote conversion and pipeline not built.

**Evidence:** `inquiries.ts` CRUD + role gating. P7.2 VERIFY in old roadmap.

---

### M20 — Supplier payables — NOT STARTED

New scope in Master Plan 2.0. No prior implementation.

**Evidence:** Not in old ZAHTJEVI or baseline audit. P11 long-term only.

---

### M21 — Public booking page — DONE

Public forms CRUD, submissions, inquiry pipeline, share/copy/URL all baseline-verified (H63–H71 DONE). P7.1 DONE in old roadmap.

**Evidence:** `publicForms.ts`, `publicFormsHandlers.ts`, `submit_public_form` RPC. H63–H71 DONE in baseline.

---

### M22 — Global search + secondary nav audit — PARTIAL

GlobalSearch component exists in header. Search depth, legacy nav cleanup, and capability-aware navigation pending (I78–I81 PARTIAL, P8.2 VERIFY).

**Evidence:** `GlobalSearch.tsx`; `ModuleGuard`; duplicate Hub scopes + direct routes coexist.

---

### M23 — i18n parity sweep — PARTIAL

~71 hardcoded Bosnian strings, 3 BS-only i18n keys, mixed-language pages (J82–J86 PARTIAL). P9.1 VERIFY in old roadmap.

**Evidence:** ~71 `.tsx` hardcoded BS literals; `bookingsOverTime`/`exportData`/`unknownPackage` BS-only. J82–J86 in baseline.

---

### M24 — E2E hardening — PARTIAL

No Playwright/Cypress suite (K91). Auth regression protections DONE (K87–K88). Golden dataset + agency demo accounts not implemented (K91 PARTIAL).

**Evidence:** K87–K96 PARTIAL in baseline. CI covers API tests + migration replay + Docker build. No browser E2E.

---

## Execution order (from Master Plan 2.0)

```
M00 → M01 → M02 → M03 → M04 → M05
                        → M06 → M18
                        → M07
           → M09 → M10
           → M11 → M12
           → M13 → M18
           → M14 → M18
           → M15
           → M16
           → M17
           → M19
           → M20
           → M21
           → M22
           → M23
           → M24
```

Tasks on the same tier can parallelize; tasks with arrows must sequence. M01 is the critical prerequisite for M02–M07 and M13.

## Prerequisite: reconcile PR #23

PR #23 (`codex/accommodation-demo-flow`, 7 commits, +6273/−1194) contains M02/M04/M09 work stranded on a branch one commit behind main. It must be:

1. Fixed: revert its deletion of `docs/audits/TRAVLINE_BASELINE_AUDIT.md` and `docs/ROADMAP.md` overwrite
2. Rebased or merged to main
3. Verified before new development begins

## First development task after alignment

**M01 — Package/Departure/Transport canonicalization.** It is the domain foundation for M02 (occupancy), M03 (wizard), M04 (accommodation), M06 (readiness), and M13 (flights). Blocked only by: M00 completion + PR #23 reconciliation.
