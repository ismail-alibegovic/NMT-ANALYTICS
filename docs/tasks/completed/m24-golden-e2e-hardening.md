# M24 — Golden E2E Verification & Production Hardening

**Status:** ACTIVE  
**Priority:** P0  
**Branch:** `feature/m24-golden-e2e-readiness`  
**Roadmap references:** M00–M24, Master Plan 2.0 Section 26.

## 1. Goal

Prove all core Travline operating workflows end-to-end across the unified platform and verify production readiness and release invariants. State what becomes possible: Travline achieves full certified milestone completeness across all 25 milestones (M00–M24) with guaranteed multi-tenant isolation, automated regression protection, zero client-exposed secrets, and complete bilingual (BS/EN) language parity.

## 2. Current problem

All individual product capability milestones (M00 through M23) have been implemented and merged to `main`:
- M00–M12: Transport identity, bus capacity, New Sale 6-step wizard, accommodation selection, passenger groups, auto rooming, and auto bus seating.
- M13–M16: Flight operations, multi-currency finance & installments, operational documents (contracts, vouchers, manifests), and supplier confirmation tracking.
- M17–M20: Communication center & automation, Today trip readiness, inquiry-to-quotation conversion, and supplier payables ledger.
- M21–M23: Public booking forms & embeds, global search & capability navigation, and comprehensive BS/EN localization parity.

The final milestone M24 requires certifying complete product readiness across:
1. Golden Scenario 1: Bus group tour (package → bus departure → passengers → group → accommodation → payments → auto seating → rooming → documents).
2. Golden Scenario 2: Flight group tour (package → flight departure → travelers → passport readiness → flight manifest → rooming).
3. Golden Scenario 3: Tailor-made / DMC (inquiry → itinerary/quote → booking → suppliers → travelers → payments → operations).
4. System Hardening: Multi-tenant safety, zero secrets in client bundle, clean migrations, and zero build/lint errors across both API and Admin.

## 3. Required discovery before editing

- API test suites: `completeBusinessScenarios.test.ts`, `todayTripReadiness.test.ts`, `departurePassengersSearch.test.ts`, `supplierPayables.test.ts`, `quotationBooking.test.ts`.
- Admin test suites: `globalSearch.test.tsx`, `capabilityNavigation.test.tsx`, `i18nParity.test.ts`, `critical.test.tsx`.
- Playwright E2E suites: `pilot-complete-scenarios.spec.ts`, `pilot-browser-sale.spec.ts`, `pilot-today.spec.ts`.
- Client security: `src/lib/supabase.ts` (browser service_role prevention).
- Health & readiness: `GET /api/health` connectivity check.

## 4. In scope

- Verification of Golden Scenarios across all 3 primary business modes: Bus Tour, Flight Tour, and Tailor-Made DMC.
- Execution and validation of all API test suites (81 test files, 799 tests).
- Execution and validation of all Admin test suites (54 test files, 354 tests).
- Verification of 100% BS/EN key parity.
- Verification of production build and linting for both `nmt-analytics-api` and `nmt-analytics-admin`.
- Update canonical roadmap `docs/ROADMAP.md` to reflect full M00–M24 milestone completeness.

## 5. Out of scope

- No speculative re-architecting of completed modules.
- No third-party direct payment processor integration (Stripe) per project constraints.
- No destructive database migrations.

## 6. Domain rules

- Strictly multi-tenant: all reads and writes validate authenticated organization context.
- Financial integrity: payment records never modify supplier cost items; quotation bookings lock against commercial drift.
- Capacity integrity: confirmed reservations reserve capacity; cancellations atomically release reserved capacity.
- Bilingual consistency: 100% Bosnian and English parity across all user-facing screens and layout components.

## 7. Acceptance criteria

- [x] Golden Scenario 1 (Bus group tour lifecycle) verified.
- [x] Golden Scenario 2 (Flight group tour with passport manifest) verified.
- [x] Golden Scenario 3 (Tailor-made DMC inquiry → quote → booking → supplier costing) verified.
- [x] Multi-tenant isolation verified across all mutation and read paths.
- [x] Client bundles contain zero service-role keys or sensitive credentials.
- [x] Admin lint passes with 0 errors.
- [x] Admin test suite passes (54 test files, 354 tests).
- [x] Admin build (`tsc -b && vite build`) passes cleanly.
- [x] API test suite passes (81 test files, 799 tests).
- [x] API build (`tsc`) passes cleanly.
- [x] BS/EN parity test passes 100%.
- [x] Canonical roadmap updated to reflect completion.
