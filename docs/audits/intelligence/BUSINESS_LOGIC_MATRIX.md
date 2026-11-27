# Travline Intelligence — Milestone 1 Business Logic Matrix

**Date:** 2026-11-25  
**Scope:** End-to-end functional, financial, operational, document, and security/platform audit of `nmt-analytics-api`, `nmt-analytics-admin`, and database migrations on branch `feat/travline-intelligence`.  
**Explicit Audit Boundary:** Core Sales/CRM, Operations/Inventory, Finance/Fiscal, Documents/PDFs, and AI/Platform Security boundaries were deeply audited. Admin-only shell/utility views (`AppSidebar`, `Settings`, `CommunicationCenter`, `AuditLogs`, `Notifications`) were only lightly scanned in Milestone 1 and are **not deeply audited** here.

---

## Domain 1 — Sales & CRM

### 1.1 Customers & Inquiries & Public Forms
- **Purpose:** Capture travel leads, manage customer profiles, and convert inquiries into quotations or reservations.
- **Primary User:** Sales Agent, Manager, Director.
- **When Used:** Pre-sales lead intake (manual or public web form) and customer onboarding.
- **Inputs:** Customer contact details (`full_name`, phone, email, passport info), inquiry fields (`source`, `source_metadata`, notes, desired trip).
- **Outputs:** Customer record, inquiry record, lead pipeline status.
- **DB Entities:** `customers`, `inquiries`.
- **Related Modules:** Quotations, Reservations (`NewSaleWizard`), Public Forms.
- **Implemented Workflow:** Public forms/manual entry create `inquiries`; agents manually create or link `customers`, then separately create `quotations` or `reservations`.
- **Practical Sense:** Lead capture makes sense, but the funnel is fragmented into disconnected islands.
- **Terminology:** `full_name` in `customers` vs `first_name`/`last_name` assumed by downstream document queries.
- **Duplication / Duplicate Entry:** Agents must re-enter inquiry context when creating quotations or reservations because there is no seamless pre-sales conversion pipeline.
- **Missing Connections:**
  - `Customers <-> Inquiries <-> Quotations <-> Reservations` pre-sales funnel is disconnected.
  - `inquiries.ts` rejects `source='public_form'` on update and drops `source_metadata`.
- **Limitations & Correctness:** Schema mismatch (`customers.full_name` only) breaks downstream manifest/voucher queries (`departureDocuments.ts:67,650`).
- **Recommended Improvement:** Unify lead-to-quote-to-reservation conversion, allow `public_form` source preservation on `inquiries` updates, and standardize customer name fields.
- **Classification:** `Missing connection`, `Broken`
- **Priority:** **P1**

### 1.2 Quotations & Itineraries
- **Purpose:** Build trip proposals/itineraries and convert accepted quotes into reservations.
- **Primary User:** Sales Agent, Manager.
- **When Used:** Pre-sale quoting for individuals or groups.
- **Inputs:** Package/departure or custom itinerary items, pricing, customer, validity dates.
- **Outputs:** Quotation record, Quotation PDF, atomic booking conversion.
- **DB Entities:** `quotations`, `itineraries`, `reservations`.
- **Related Modules:** Packages, Departures, Reservations, PDF Renderer.
- **Implemented Workflow:** `book_quotation_atomic` converts an accepted quotation into a reservation.
- **Practical Sense:** Quotation-to-booking conversion is essential, but currently enforces group-departure assumptions and has broken PDF output.
- **Missing Connections:** `book_quotation_atomic` rejects standalone quotes and requires `Package` + `Departure`.
- **Limitations & Correctness:**
  - Quotation PDF renders a miswired `INVOICE` (`0.00 BAM`).
  - `QuotationDetail.tsx:150` uses `window.open` without auth headers, resulting in HTTP `401`.
- **Recommended Improvement:** Fix Quotation PDF template/wiring, replace `window.open` with authenticated blob/fetch download, and support FIT/standalone quote booking per owner decision.
- **Classification:** `Broken`, `Missing connection`
- **Priority:** **P1**

### 1.3 Reservations (`NewSaleWizard`) & Individual Family Holidays (FIT)
- **Purpose:** Create and manage travel bookings, passengers, and accommodation/service snapshots.
- **Primary User:** Sales Agent, Manager, Director.
- **When Used:** Core booking workflow when a customer confirms a trip.
- **Inputs:** `packageId`, `departureId`, customer, passenger list, optional services, pricing.
- **Outputs:** `reservations` row, `departure_passengers` rows, payment schedule/balance.
- **DB Entities:** `reservations`, `departure_passengers`, `packages`, `departures`, `package_hotels`, `package_services`.
- **Related Modules:** Departures, Rooming, Seating, Payments, Documents.
- **Implemented Workflow:** `NewSaleWizard` requires selecting a `packageId` and `departureId`. Backend snapshots accommodation from `package_hotels` and generates reservation documents.
- **Practical Sense:** Works for scheduled group departures, but **not commercially realistic** for individual/FIT family holidays (custom hotel + flight without a group departure).
- **Missing Connections & Correctness:**
  - **P0:** `reservations.ts:998-1004` queries nonexistent `package_hotels` columns (`room_type`, `rooms_booked`, `price_per_person`, `currency`, `notes`), silently blanking the accommodation booking snapshot.
  - **P0 (FIT Gap):** `NewSaleWizard` requires `packageId` + `departureId`, `departure_passengers.departure_id` is `NOT NULL`, and `book_quotation_atomic` requires `Package` + `Departure`. Individual family holidays cannot be booked cleanly without dummy group entities.
- **Recommended Improvement:** Fix `package_hotels` column query in `reservations.ts`; implement FIT/individual booking model after product owner decision (`reservation_passengers` + optional `departure_id` vs hidden private departure).
- **Classification:** `Broken`, `Not commercially realistic`, `Requires product owner decision`
- **Priority:** **P0**

### 1.4 Subagents & Commissions
- **Purpose:** Manage partner/subagent sales channels and commission calculations.
- **Primary User:** Director, Manager, Finance.
- **When Used:** B2B/subagent bookings and commission settlement.
- **Inputs:** Subagent profile, commission rate/rules, linked reservations.
- **Outputs:** Commission amounts, subagent payable/settlement tracking.
- **DB Entities:** `subagents` (and related reservation/commission references).
- **Related Modules:** Reservations, Departure Profitability, Finance.
- **Limitations & Correctness:** Audited in M1 as part of Sales/Finance boundary; requires alignment with unified profitability and multi-currency/FIT models.
- **Recommended Improvement:** Verify subagent commission flow during M3/M4 financial alignment.
- **Classification:** `Needs verification / alignment`
- **Priority:** **P2**

---

## Domain 2 — Operations & Inventory

### 2.1 Packages & Departures
- **Purpose:** Define reusable tour templates (`packages`) and dated operational instances (`departures`) with capacity and pricing.
- **Primary User:** Operations Manager, Director.
- **When Used:** Product setup and ongoing departure capacity management.
- **Inputs:** Package metadata, services, hotels, departure dates, capacity, pricing.
- **Outputs:** Active departures available for booking, booked/available counts.
- **DB Entities:** `packages`, `package_services`, `package_hotels`, `departures`, `departure_passengers`.
- **Related Modules:** Reservations, Rooming, Seating, Profitability, Availability.
- **Implemented Workflow:** `Departures.tsx` exposes `+`/`-` buttons to adjust `departures.booked`, while backend `getDepartureBookedMap()` computes booked counts from reservations/passengers.
- **Duplication / Operational Correctness:**
  - `Departures.tsx` `+`/`-` mutates `departures.booked` which `getDepartureBookedMap()` overwrites — confusing and misleading UI mutation.
  - `DepartureDetail.tsx:434-436` `openSegmentAttacher` is broken.
- **Recommended Improvement:** Remove manual `booked` +/- override (derive strictly from reservations/passengers) or clearly separate capacity vs booked; fix `openSegmentAttacher`.
- **Classification:** `Broken`, `Confusing`
- **Priority:** **P1**

### 2.2 Accommodation / Rooming & Availability / Calendar
- **Purpose:** Allocate hotel rooms/beds for a departure and track inventory availability.
- **Primary User:** Operations Manager.
- **When Used:** Pre-departure rooming list preparation and inventory monitoring.
- **Inputs:** Hotel allocations, room slots, passenger assignments.
- **Outputs:** Rooming lists, readiness summary, availability counts.
- **DB Entities:** `hotel_allocations`, `departure_room_slots`, legacy `accommodation_buildings`.
- **Related Modules:** Departures, Reservations, Departure Documents.
- **Duplication / Missing Connections:**
  - `readiness-summary` reads legacy `accommodation_buildings` instead of `departure_room_slots`.
  - `availability.ts` hardcodes `rooms_reserved - 0` and queries legacy `excursion_passengers`.
- **Recommended Improvement:** Deprecate/remove legacy `accommodation_buildings` reads in favor of `departure_room_slots` and `hotel_allocations`; fix `availability.ts` reservation/room subtraction.
- **Classification:** `Duplicated`, `Broken`
- **Priority:** **P1**

### 2.3 Flights / Seating & Excursions / Waivers
- **Purpose:** Manage transport seating (bus/flight) and optional excursions/waivers.
- **Primary User:** Operations Manager, Guide.
- **When Used:** Pre-departure seating assignment and excursion/waiver tracking.
- **Inputs:** Vehicle/flight segments, seat maps, passenger assignments, waiver status.
- **Outputs:** Seat assignments, excursion manifests, waiver completion status.
- **DB Entities:** `departure_passengers`, legacy `excursion_passengers`, flight/seating tables.
- **Duplication / Missing Connections:**
  - `waivers.ts` is hard-wired to legacy `excursion_passengers` instead of `departure_passengers`.
  - `Excursions` vs `Departures` represents overlapping legacy vs current operational modeling.
- **Recommended Improvement:** Migrate `waivers.ts` and `availability.ts` off `excursion_passengers` onto `departure_passengers`; confirm deprecation of legacy `Excursions` / `accommodation_buildings` with owner.
- **Classification:** `Duplicated`, `Broken`, `Requires product owner decision`
- **Priority:** **P1**

### 2.4 Suppliers & Contracts
- **Purpose:** Manage hotels, transport providers, guides, and supplier contracts.
- **Primary User:** Operations Manager, Director, Finance.
- **When Used:** Contracting suppliers and linking costs to departures/payables.
- **DB Entities:** `suppliers`, `supplier_contracts`, supplier payables.
- **Related Modules:** Finance (Payables, Departure Profitability), Packages/Departures.
- **Recommended Improvement:** Ensure clean linkage from supplier contracts to departure costs and supplier payables without duplicate entry.
- **Classification:** `OK / Needs minor alignment`
- **Priority:** **P2**

---

## Domain 3 — Finance & Fiscal

### 3.1 Payments, Installments, Unified Payments & Public Paylinks
- **Purpose:** Record customer payments, track installment plans, process refunds, and allow online/public payment links.
- **Primary User:** Sales Agent, Finance, Director.
- **When Used:** At booking, during installment collection, and for refunds.
- **Inputs:** Reservation ID, amount, payment method, currency, installment schedule.
- **Outputs:** Payment ledger entries, updated reservation balance, payment confirmation.
- **DB Entities:** `payments`, `reservations`, payment/installment tables.
- **Related Modules:** Receipts, Invoices, Analytics, Departure Profitability.
- **Limitations & Correctness:**
  - `UnifiedPayments.tsx:247,250` renders `-` for payment method and customer.
  - `payments.ts:954-964` `/payments/dashboard` inner-joins `departures!inner` (silently dropping non-departure open balances) and caps results at `.limit(200)`.
  - Public paylinks `/public/pay/:code` are unimplemented.
  - Multi-currency payment collection policy needs owner decision (locked per reservation currency vs FX conversion).
- **Recommended Improvement:** Fix `UnifiedPayments.tsx` customer/method rendering, replace `departures!inner` with left join / remove arbitrary 200-row cap on `/payments/dashboard`, implement or remove dead `/public/pay/:code` links.
- **Classification:** `Broken`, `Missing connection`, `Requires product owner decision`
- **Priority:** **P1**

### 3.2 Receipts & Fiscalization (`receipts.ts`)
- **Purpose:** Issue payment receipts and integrate with fiscalization providers.
- **Primary User:** Finance, Sales Agent, Director.
- **When Used:** Upon receiving customer payment or issuing advance/final fiscal documents.
- **DB Entities:** `receipts`.
- **Related Modules:** Payments, PDF Template Renderer.
- **Limitations & Correctness (CRITICAL LEGAL/FISCAL RISK — P0):**
  - `receipts.ts` / `pdfTemplateRenderer.ts` labels **un-fiscalized** PDFs as `RAČUN`, `Fiskalni račun`, `Avansni račun`, and `FR-YYYY-XXXX`.
  - `PATCH` and `DELETE` are allowed on already-issued receipts (violates accounting/fiscal immutability).
  - `fiscal_data` is unvalidated.
  - `FiskalizacijaHrProvider` is a stub, and no `BA` (Bosnia & Herzegovina) fiscal provider exists.
- **Recommended Improvement:** Immediately relabel un-fiscalized documents as non-fiscal (`Potvrda uplate` / `Predračun` / `Payment Receipt`) until a real fiscal provider is connected; enforce immutability on issued receipts (use credit notes/storno instead of `PATCH`/`DELETE`).
- **Classification:** `Broken`, `Not commercially realistic`, `Requires product owner decision`
- **Priority:** **P0**

### 3.3 Supplier Payables, Departure Profitability & Analytics / Reports
- **Purpose:** Track money owed to suppliers, compute per-departure profit/margin, and report agency-wide revenue/collected/open balances.
- **Primary User:** Director, Finance.
- **When Used:** Financial review, departure close-out, executive dashboarding.
- **DB Entities:** `payments`, `reservations`, `departures`, supplier payables.
- **Limitations & Correctness:**
  - **P0:** `departureProfitability.ts:76-79` queries ALL org `payments` without `.in('reservation_id', ...)`, risking PostgREST 1000-row silent truncation and wrong profitability numbers.
  - **P1:** Analytics endpoints disagree on revenue, paid, and cancelled definitions across dashboard/reports.
- **Recommended Improvement:** Scope `departureProfitability.ts` payment queries to the departure's `reservation_id`s; establish a single canonical financial calculation helper shared across Dashboard, Payments, and Reports.
- **Classification:** `Broken`
- **Priority:** **P0** (profitability truncation) / **P1** (analytics definition drift)

---

## Domain 4 — Documents & Communications

### 4.1 Reservation Invoice PDF (`reservations.ts` + `pdfTemplateRenderer.ts`)
- **Purpose:** Generate a customer invoice/proforma PDF for a reservation.
- **Primary User:** Sales Agent, Finance, Customer.
- **When Used:** After reservation creation or payment request.
- **Limitations & Correctness (P0):**
  - `reservations.ts:1410-1428` + `pdfTemplateRenderer.ts:142-176`: `invoice.pdf` sums ALL `package_services` (including `is_optional=true`), overriding `reservation.total_amount`.
  - Omits mandatory business identifiers (`tax_id` / `bank_account`).
- **Recommended Improvement:** Use actual `reservation.total_amount` and selected reservation items/services; include agency `tax_id` and `bank_account`; clearly label fiscal vs proforma status.
- **Classification:** `Broken`
- **Priority:** **P0**

### 4.2 Departure Manifests & Batch Vouchers (`departureDocuments.ts`)
- **Purpose:** Generate operational passenger manifests and batch hotel/service vouchers for a departure.
- **Primary User:** Operations Manager, Guide.
- **When Used:** Pre-departure operational pack generation.
- **Limitations & Correctness (P0):**
  - `departureDocuments.ts:67,650`: Manifest & Batch Vouchers query `customers:customer_id(first_name, last_name, ...)` when `customers` only has `full_name`. Errors are ignored, producing **empty documents in production**.
  - Does not filter out `status = 'cancelled'` reservations/passengers.
- **Recommended Improvement:** Query `full_name` from `customers`, handle query errors explicitly (fail loudly rather than returning blank PDFs), and filter out cancelled reservations/passengers.
- **Classification:** `Broken`
- **Priority:** **P0**

---

## Domain 5 — Existing AI & Platform / Security Boundary

### 5.1 Existing AI Endpoints (`nmt-analytics-api/src/routes/ai.ts`)
- **Purpose:** Provide deterministic analytics/recommendation endpoints (`/ai/revenue-down`, `/ai/occupancy`, `/ai/recommend-packages`).
- **Primary User:** Manager, Director.
- **Implemented Workflow:** 3 deterministic SQL/in-memory endpoints (lines 1–330); zero LLM calls.
- **Limitations & Correctness:** Missing `requireModule` and `requireMinimumRole` gating — any authenticated low-privilege role could hit them.
- **Recommended Improvement:** Add `requireMinimumRole('manager')` and `requireModule` gating immediately; replace/augment with Universal AI Provider architecture in Milestones 5–9.
- **Classification:** `Broken` (missing RBAC/module guard)
- **Priority:** **P1**

### 5.2 Platform Admin Boundary & Secrets (`routes/admin.ts`, `org_settings`)
- **Purpose:** Platform-level administration (`super_admin`), tenant audit logs, and organization integration secrets.
- **Primary User:** Platform Owner (`super_admin`), Agency Director.
- **Implemented Workflow:** `routes/admin.ts` (lines 1–109) mounted at `/api/admin` with router-wide `requireMinimumRole("director")`, `/me`, `/orgs` (`super_admin`), `/audit-logs` (`req.orgId!`).
- **Limitations & Correctness:**
  - `super_admin` is tied to `profiles.org_id` and lacks a separate `platform_admins` cross-org boundary.
  - `org_settings` stores SMTP/SMS/eTurista secrets in plaintext (no encryption helper exists yet in `nmt-analytics-api/src/lib/`).
- **Recommended Improvement:** Implement AES-GCM envelope/secret encryption helper for platform/org secrets and a dedicated `platform_admins` boundary in Milestone 5 before storing any AI provider API keys.
- **Classification:** `Missing connection`, `Security hardening required`
- **Priority:** **P1**
