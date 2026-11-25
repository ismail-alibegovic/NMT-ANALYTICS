# Travline Intelligence — Realistic Travel Agency Scenarios (A–H)

**Date:** 2026-11-25  
**Purpose:** Walk through eight realistic travel agency workflows against the actual implemented codebase (`feat/travline-intelligence`) to verify practical viability, financial integrity, document accuracy, and operational completeness.

---

## Scenario A — Istanbul Group Bus Tour
- **Workflow:** Agency creates a `Package` (4-night Istanbul bus tour with base hotel + optional Bosphorus cruise), creates a dated `Departure` with bus capacity, books multiple families via `NewSaleWizard`, assigns bus seats and hotel room slots, and generates a departure passenger manifest + batch vouchers + customer invoices.
- **Actual Codebase Reality:**
  - Booking works via `NewSaleWizard` because a `Package` + `Departure` exist.
  - **Breaks in 3 places:**
    1. `reservations.ts:998-1004` queries nonexistent `package_hotels` columns, blanking the accommodation snapshot.
    2. `invoice.pdf` (`reservations.ts:1410-1428`, `pdfTemplateRenderer.ts:142-176`) includes optional Bosphorus cruise services (`is_optional=true`) in the total even if not selected, overriding `reservation.total_amount`.
    3. `departureDocuments.ts:67,650` queries `first_name`/`last_name` on `customers` (which only has `full_name`) and ignores errors, producing **blank** manifests and batch vouchers, and fails to exclude cancelled reservations.

## Scenario B — Umrah Group Arrangement
- **Workflow:** Agency manages multi-week Umrah groups with tiered hotel rooming (Makkah/Madinah room slots), passport/visa tracking on passengers, installment payments, and group readiness summary before departure.
- **Actual Codebase Reality:**
  - Group departure & installment concepts exist, **but:**
    1. `readiness-summary` reads legacy `accommodation_buildings` instead of `departure_room_slots`, giving misleading readiness status.
    2. `availability.ts` hardcodes `rooms_reserved - 0`, failing to reflect actual room consumption.
    3. Batch vouchers & manifests fail silently due to `customers.full_name` mismatch (`departureDocuments.ts:67,650`).

## Scenario C — European Group Tour (Multi-Segment / Excursions)
- **Workflow:** Agency organizes a multi-city European tour with flight/bus segments, optional excursions, and excursion waivers.
- **Actual Codebase Reality:**
  - **Breaks in 3 places:**
    1. `DepartureDetail.tsx:434-436` `openSegmentAttacher` is broken, blocking segment attachment in the UI.
    2. `waivers.ts` and `availability.ts` query legacy `excursion_passengers` instead of `departure_passengers`.
    3. Optional excursion pricing leaks into `invoice.pdf` (`reservations.ts:1410-1428`).

## Scenario D — Individual Family Holiday (FIT — Hotel + Flight Only)
- **Workflow:** A family walks in asking for a custom 7-night Antalya resort + flight booking for their dates only (no group tour, no shared departure).
- **Actual Codebase Reality:**
  - **Blocked (`Not commercially realistic`):**
    - `NewSaleWizard` requires `packageId` + `departureId`.
    - `departure_passengers.departure_id` is `NOT NULL`.
    - `book_quotation_atomic` rejects standalone quotes and requires `Package` + `Departure`.
    - Agencies must invent dummy packages/departures for every custom family trip. **Requires owner decision (ISS-006).**

## Scenario E — Corporate Group Quotation
- **Workflow:** Corporate client submits an inquiry (via public web form or email), agent builds a tailored `Quotation`, sends a Quotation PDF, and upon approval converts it into an active reservation.
- **Actual Codebase Reality:**
  - **Breaks in 3 places:**
    1. `inquiries.ts` rejects `source='public_form'` on update and drops `source_metadata`, losing lead provenance.
    2. `QuotationDetail.tsx:150` uses `window.open` without auth (returns HTTP `401`), and the Quotation PDF renders a miswired `INVOICE` showing `0.00 BAM`.
    3. `book_quotation_atomic` cannot convert a standalone corporate quote without a `Package` + `Departure`.

## Scenario F — Subagent Sales
- **Workflow:** External subagent sells seats on the agency's departure, earns commission, and agency tracks net revenue vs subagent commission and departure profitability.
- **Actual Codebase Reality:**
  - Subagent entity exists, but departure profitability (`departureProfitability.ts:76-79`) queries all org `payments` without `.in('reservation_id', ...)`, risking 1000-row PostgREST truncation and distorted profit/commission reporting.

## Scenario G — Financial Lifecycle (Deposit, Installments, Partial Payment, Refund, Payables)
- **Workflow:** Customer pays a deposit, pays remaining installments via unified payments or public paylink, receives a legally accurate receipt, or receives a partial refund; finance views open balances across all bookings.
- **Actual Codebase Reality:**
  - **Breaks in 4 places:**
    1. `receipts.ts` labels un-fiscalized PDFs as `RAČUN` / `Fiskalni račun` / `FR-YYYY-XXXX` and allows `PATCH`/`DELETE` on issued receipts (legal/fiscal hazard).
    2. `UnifiedPayments.tsx:247,250` displays `-` for payment method and customer.
    3. `/payments/dashboard` (`payments.ts:954-964`) inner-joins `departures!inner` (dropping non-departure open balances) and caps at `.limit(200)`.
    4. `/public/pay/:code` is unimplemented.

## Scenario H — Operational Changes (Cancellation, Rooming/Capacity Adjustment)
- **Workflow:** A passenger cancels; operations adjusts rooming/seating and checks departure booked count and manifests.
- **Actual Codebase Reality:**
  - **Breaks in 2 places:**
    1. `Departures.tsx` exposes `+`/`-` buttons mutating `departures.booked`, which `getDepartureBookedMap()` overwrites.
    2. Cancelled passengers/reservations are not filtered out of `departureDocuments.ts` manifests and batch vouchers.
