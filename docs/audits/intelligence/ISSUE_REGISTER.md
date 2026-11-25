# Travline Intelligence — Prioritized Issue & Decision Register

**Date:** 2026-11-25  
**Branch:** `feat/travline-intelligence`

---

## 1. P0 — Release / Legal / Data-Integrity Blockers

| ID | Area | Citation | Classification | Summary | Target Milestone |
|---|---|---|---|---|---|
| **ISS-001** | Reservations / Accommodation Snapshot | `nmt-analytics-api/src/routes/reservations.ts:998-1004` | `Broken` | Queries nonexistent `package_hotels` columns (`room_type`, `rooms_booked`, `price_per_person`, `currency`, `notes`), silently blanking the accommodation booking snapshot. | M3 |
| **ISS-002** | Invoice PDF Calculation & Legal Fields | `nmt-analytics-api/src/routes/reservations.ts:1410-1428`, `nmt-analytics-api/src/lib/pdfTemplateRenderer.ts:142-176` | `Broken` | `invoice.pdf` sums ALL `package_services` (including `is_optional=true`), overriding `reservation.total_amount`, and omits `tax_id`/`bank_account`. | M2 |
| **ISS-003** | Departure Manifests & Batch Vouchers | `nmt-analytics-api/src/routes/departureDocuments.ts:67,650` | `Broken` | Queries `customers:customer_id(first_name, last_name, ...)` when `customers` only has `full_name`; ignores errors -> empty PDFs in production; does not filter `status = 'cancelled'`. | M2 |
| **ISS-004** | Departure Profitability Truncation | `nmt-analytics-api/src/routes/departureProfitability.ts:76-79` | `Broken` | Queries ALL org `payments` without `.in('reservation_id', ...)`, risking PostgREST 1000-row silent truncation and inaccurate departure profit. | M3 |
| **ISS-005** | Legal / Fiscal Receipt & Invoice Risk | `nmt-analytics-api/src/routes/receipts.ts`, `nmt-analytics-api/src/lib/pdfTemplateRenderer.ts` | `Broken`, `Not commercially realistic`, `Requires product owner decision` | Labels un-fiscalized PDFs as `RAČUN`, `Fiskalni račun`, `Avansni račun`, `FR-YYYY-XXXX`; allows `PATCH`/`DELETE` on issued receipts; `fiscal_data` unvalidated; `FiskalizacijaHrProvider` is a stub; no `BA` fiscal provider exists. | M2 |
| **ISS-006** | Individual Family Holiday (FIT) Gap | `NewSaleWizard`, `departure_passengers.departure_id` (`NOT NULL`), `book_quotation_atomic` | `Not commercially realistic`, `Requires product owner decision` | `NewSaleWizard` requires `packageId` + `departureId`; `departure_passengers.departure_id` is `NOT NULL`; `book_quotation_atomic` rejects standalone quotes. Individual family holidays cannot be booked cleanly without dummy group entities. | M3 |

---

## 2. P1 — High-Impact Functional, UX, and Security Issues

| ID | Area | Citation | Classification | Summary | Target Milestone |
|---|---|---|---|---|---|
| **ISS-007** | Pre-Sales Funnel & Inquiries | `nmt-analytics-api/src/routes/inquiries.ts` | `Missing connection`, `Broken` | `Customers <-> Inquiries <-> Quotations <-> Reservations` funnel disconnected; `inquiries.ts` rejects `source='public_form'` on update and drops `source_metadata`. | M3 |
| **ISS-008** | Quotation PDF & Download Auth | `nmt-analytics-admin/src/pages/QuotationDetail.tsx:150` | `Broken` | Quotation PDF renders miswired `INVOICE` (`0.00 BAM`); `QuotationDetail.tsx:150` uses `window.open` causing HTTP `401`. | M2 |
| **ISS-009** | Legacy `excursion_passengers` & `accommodation_buildings` | `waivers.ts`, `readiness-summary`, `availability.ts` | `Duplicated`, `Broken`, `Requires product owner decision` | `waivers.ts` hard-wired to `excursion_passengers` instead of `departure_passengers`; `readiness-summary` reads `accommodation_buildings` instead of `departure_room_slots`; `availability.ts` hardcodes `rooms_reserved - 0` & queries `excursion_passengers`. | M3 |
| **ISS-010** | Departure Booked Count & Segment Attacher | `Departures.tsx`, `DepartureDetail.tsx:434-436` | `Broken`, `Confusing` | `Departures.tsx` `+`/`-` mutates `departures.booked` which `getDepartureBookedMap()` overwrites; `DepartureDetail.tsx:434-436` `openSegmentAttacher` is broken. | M3 |
| **ISS-011** | Unified Payments & Dashboard Open Balances | `UnifiedPayments.tsx:247,250`, `nmt-analytics-api/src/routes/payments.ts:954-964` | `Broken`, `Missing connection` | `UnifiedPayments.tsx` renders `-` for method/customer; `/payments/dashboard` inner-joins `departures!inner` (dropping non-departure open balances) and caps at `.limit(200)`. | M3 |
| **ISS-012** | Analytics Definition Drift | Analytics endpoints | `Broken` | Analytics endpoints disagree on revenue, paid, and cancelled definitions across dashboard and reports. | M3 |
| **ISS-013** | Public Paylinks Dead Path | `/public/pay/:code` | `Missing connection` | Public paylink route `/public/pay/:code` is unimplemented. | M3 |
| **ISS-014** | AI Route Authorization Gap | `nmt-analytics-api/src/routes/ai.ts:1-330` | `Broken` (Security) | Existing deterministic `/ai/*` routes lack `requireMinimumRole('manager')` and `requireModule` gating. | M3 / M5 |
| **ISS-015** | Plaintext Secrets & `super_admin` Boundary | `org_settings`, `nmt-analytics-api/src/routes/admin.ts:1-109` | `Missing connection` (Security) | `org_settings` stores SMTP/SMS/eTurista secrets in plaintext (no encryption helper exists yet); `super_admin` is tied to `profiles.org_id` without a dedicated `platform_admins` cross-org boundary. | M5 |

---

## 3. P2 / P3 — Medium & Low Priority Alignment Items

| ID | Area | Classification | Summary | Target Milestone |
|---|---|---|---|---|
| **ISS-016** | Subagent Commissions & Multi-Currency | `Requires product owner decision` | Multi-currency payment collection rules (locked per reservation currency vs FX conversion) and subagent settlement alignment. | M3 |
| **ISS-017** | Admin Utility Views Deep Audit | `Not yet deeply audited` | `AppSidebar`, `Settings`, `CommunicationCenter`, `AuditLogs`, `Notifications` were only lightly scanned in M1; verify during M3/M4 UX pass. | M3 / M4 |

---

## 4. Items Requiring Product Owner Decision (Before M2/M3/M5 Implementation)

1. **Isolated DB Strategy for Milestone 5+ AI Migrations:**  
   Shared Staging (`hlyqrwytlrimtrjncmez`) backs the verified RC preview. Should Milestone 5+ intelligence migrations be additive-only on shared Staging, or should we provision a dedicated Supabase branch/project?
2. **Individual / FIT Holiday Data Model (ISS-006):**  
   Should FIT bookings use `reservation_passengers` with an optional `departure_id` (clean domain separation), or auto-create a hidden private departure per FIT booking?
3. **Multi-Currency Payment Collection (ISS-016):**  
   Should payments be strictly locked to the reservation's currency, or should cross-currency payments with recorded FX rate be supported?
4. **Legal / Fiscal Receipt & Invoice Labeling (ISS-005):**  
   Confirm immediate relabeling of un-fiscalized PDFs to non-fiscal terminology (`Potvrda uplate` / `Predračun` / `Payment Receipt`) and disabling `PATCH`/`DELETE` on issued receipts until a real fiscalization integration (`BA`/`HR`) is built.
5. **Deprecation / Consolidation of Overlapping Legacy Modules (ISS-009):**  
   Confirm deprecating/removing legacy `Excursions` (`excursion_passengers`) vs `Departures`, `accommodation_buildings` vs `departure_room_slots`/`hotel_allocations`, and unifying overlapping `Contracts`/`Receipts`/`Payments` entry points.
