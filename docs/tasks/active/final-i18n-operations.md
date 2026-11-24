# P2 Batch C: Operations BS/EN, Locale & Fail-Closed Recovery

**Status:** ACTIVE  
**Priority:** P2  
**Branch:** `fix/i18n-operations-batch`  
**Roadmap references:** M22 / Commercial Release Readiness — i18n, locale-aware formatting, and fail-closed read/save recovery across Operations modules

## 1. Goal

Eliminate remaining mixed-language (hardcoded Bosnian or English) UI copy, hardcoded `bs-BA` / `toLocaleString()` formatters, and silent/EmptyState read failures across Operations screens (`Excursions`, `CommissionRules`, `SubAgents`, `Departures`, `DepartureFormModal`, `DepartureCalendarView`, `DepartureDetail`, `Hotels`, `SeatMap`). Every screen in scope must render cleanly in both Bosnian (`bs`) and English (`en`), format currency and dates using the active locale, preserve user drafts during language switches, and fail closed with Retry controls when initial reads fail.

## 2. Current problem

- `Excursions.tsx`: mixes `tr.*` with hardcoded English headers/buttons/modals/empty states, appends hardcoded `" BAM"` instead of `formatCurrency`, exposes raw `err.message`, and has no fail-closed `loadError` + Retry state.
- `CommissionRules.tsx`: 100% hardcoded Bosnian without `useT()`, hardcoded `.toFixed(2) + " BAM"`, raw `err.message`, and no fail-closed `loadError` + Retry state.
- `SubAgents.tsx`: mixes `tr.*` with hardcoded English table headers, badges, KPI labels, tooltips, confirm/toasts, `toLocaleDateString()` without locale, and no `loadError` + Retry state.
- `Departures.tsx`, `DepartureFormModal.tsx`, `DepartureCalendarView.tsx`: hardcoded Bosnian status labels, filters, columns, FullCalendar `locale="bs"`, modal labels, and `formatDate` without locale; `Departures.tsx` lacks fail-closed `loadError` + Retry.
- `DepartureDetail.tsx`: module-level `formatCurrency`/`formatDate`/`formatDateTime` hardcode `"bs-BA"`, plus remaining hardcoded Bosnian strings (`Sažetak putovanja`, `Stvarno stanje...`, `Spremno`/`Potrebna pažnja`, `Manifest (PDF)`, `Razvrstavanje` labels, `Nema smještaja`).
- `Hotels.tsx`: hardcoded English `type`/`types`, `available`, tooltips, and delete confirmations/toasts.
- `SeatMap.tsx`: hardcoded English strings (`Seat map not available...`, `Unassigned passengers`, `Front / Driver`, `Back`, tooltips, `Assign seat`) and hardcoded Bosnian `"Slobodno sjedište"`.

## 3. Required discovery before editing

Inspected:
- `nmt-analytics-admin/src/pages/operations/{Excursions,CommissionRules,SubAgents,Hotels}.tsx`
- `nmt-analytics-admin/src/pages/admin/Departures.tsx`
- `nmt-analytics-admin/src/components/departures/{DepartureFormModal,DepartureCalendarView}.tsx`
- `nmt-analytics-admin/src/pages/DepartureDetail.tsx`
- `nmt-analytics-admin/src/components/operations/SeatMap.tsx`
- `nmt-analytics-admin/src/utils/business.ts` and `nmt-analytics-admin/src/components/ui/button/Button.tsx`
- `nmt-analytics-admin/src/lib/i18n/{bs,en}.ts`
- Existing tests: `e2e/finance-forms/{subagents,hotel-read,hotel-stock,hotel-allocation}.spec.ts` and `src/tests/{departureDocuments,allocationAndVehicleRecovery,i18nParity}.test.*`.

## 4. In scope

- Shared helper signatures compatible with Batches A/B (`formatDate(dateString, locale?)` in `business.ts`, `"aria-label"` forwarding in `Button.tsx`).
- Full BS/EN i18n parity in `bs.ts` and `en.ts` for all keys used by Batch C screens.
- Locale-aware formatting, fail-closed `loadError` + Retry, draft retention across BS ↔ EN switch, and localized error feedback (no raw `err.message` leaks) across the 9 Operations files in scope.
- Unit (`src/tests/operationsLocale.test.tsx`) and Chromium Playwright (`e2e/finance-forms/operations-locale.*`) verification, plus re-running existing subagent/hotel Playwright suites.

## 5. Out of scope

- Shared/public components (`ErrorBoundary`, `NotFound`, `DateRangeFilter`, `ImportModal`) — handled in Batch D.
- Rooming/seating operator matrix and backend RBAC matrix — handled in `P1 FLOW-01`.
- Any backend or database schema changes.

## 6. Domain rules

- Preserve all existing Playwright contract selectors in `subagents.spec.ts`, `hotel-read.spec.ts`, `hotel-stock.spec.ts`, `hotel-allocation.spec.ts`.
- Read errors must fail closed (never render EmptyState when `getDepartures`/`getExcursionPassengers`/`getCommissionRules`/`getSubAgents` rejects).
- Switching `bs` ↔ `en` must not re-fetch lists unnecessarily or discard unsaved modal drafts.

## 7. API requirements

No API code changes in this task. Existing API build and test suite remain green.

## 8. Database / migration requirements

No schema change is needed.

## 9. Frontend / UX requirements

- Preserve existing TailAdmin visual layout, colors, spacing, and light/dark mode compatibility.
- Verify BS and EN rendering across 390px, 768px, and 1440px viewports with zero horizontal overflow.

## 10. Tenant and security acceptance

- Sanitize UI error messages: never render raw internal `err.message` strings in toasts on operational read/write failures where structured recovery copy applies.
- Preserve existing tenant-scoped API calls without adding direct browser Supabase mutations.

## 11. Acceptance criteria

- [ ] All 9 Batch C screens/components have zero mixed-language copy in BS and EN modes.
- [ ] All monetary/date formatters on Batch C screens respect active `bs-BA` vs `en-GB` locale.
- [ ] Initial read failures render localized `role="alert"` + Retry controls and suppress EmptyState.
- [ ] BS/EN parity check (`i18nParity.test.ts`), Admin lint/test/build, and Playwright tests pass under Node 24.
- [ ] No unrelated screens or checked-in audit PNGs modified.

## 12. Required tests

- `src/tests/operationsLocale.test.tsx` (Vitest)
- `e2e/finance-forms/operations-locale.spec.ts`, `subagents.spec.ts`, `hotel-read.spec.ts`, `hotel-stock.spec.ts`, `hotel-allocation.spec.ts` (Playwright Chromium)
- Existing Admin & API suites remain green.

## 13. Required verification commands

```bash
cd nmt-analytics-admin
npm run lint
npm test
npm run build
npx playwright test --config=playwright.forms.config.ts e2e/finance-forms/operations-locale.spec.ts e2e/finance-forms/subagents.spec.ts e2e/finance-forms/hotel-read.spec.ts e2e/finance-forms/hotel-stock.spec.ts e2e/finance-forms/hotel-allocation.spec.ts

cd ../nmt-analytics-api
npm run build
npm test
```

## 14. Completion report

Follow `AGENTS.md` Section 9 completion report contract.
