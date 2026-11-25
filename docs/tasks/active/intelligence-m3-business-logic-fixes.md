# Intelligence M3 — Product Experience & Business Logic Corrections

**Status:** DONE  
**Priority:** P0 / P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`, `docs/audits/intelligence/ISSUE_REGISTER.md`

## 1. Goal
Resolve the high-priority P0/P1 business logic, data integrity, authorization, and UX defects identified in Milestone 1 (`ISS-001`, `ISS-004`, `ISS-007`, `ISS-010`, `ISS-011`, `ISS-014`).

## 2. Scope (In)
1. **ISS-001 (`reservations.ts`):** Fix `package_hotels` accommodation snapshot query to use actual schema columns.
2. **ISS-004 (`departureProfitability.ts`):** Scope `payments` query to `.in('reservation_id', reservationIds)` instead of querying all org payments (avoiding 1000-row truncation).
3. **ISS-007 (`inquiries.ts`):** Allow `source='public_form'` on inquiry update and preserve `source_metadata`.
4. **ISS-010 (`DepartureDetail.tsx`):** Fix broken `openSegmentAttacher` handler.
5. **ISS-011 (`payments.ts` + `UnifiedPayments.tsx`):** Replace `departures!inner` with left join in `/payments/dashboard` (avoid dropping non-departure open balances) and fix `UnifiedPayments.tsx` customer/method rendering.
6. **ISS-014 (`ai.ts`):** Add `requireMinimumRole('manager')` and `requireModule` gating to `/ai/*` routes.

## 3. Out of scope
- FIT / individual holiday schema changes (`ISS-006`, deferred pending owner decision).
- Legacy `Excursions` / `accommodation_buildings` deprecation (`ISS-009`, deferred pending owner decision).
- Multi-currency FX policy (`ISS-016`, deferred pending owner decision).

## 4. Acceptance criteria
- [x] `reservations.ts` accommodation snapshot uses valid `package_hotels` / `hotels` columns.
- [x] `departureProfitability.ts` scopes `payments` by `reservation_id`.
- [x] `inquiries.ts` preserves `public_form` source and `source_metadata`.
- [x] `/payments/dashboard` uses left join on `departures` and `UnifiedPayments.tsx` renders customer & payment method.
- [x] `ai.ts` enforces `requireMinimumRole('manager')` and `requireModule`.
- [x] `DepartureDetail.tsx` `openSegmentAttacher` works cleanly.
- [x] API and Admin tests & builds pass.
