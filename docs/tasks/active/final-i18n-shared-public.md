# P2 Batch D: Shared/Public Components & Remaining Locale Formatters

**Status:** ACTIVE  
**Priority:** P2  
**Branch:** `fix/i18n-shared-public-batch`  
**Roadmap references:** M22 / Commercial Release Readiness — i18n & locale formatting for shared/public components and remaining formatters

## 1. Goal

Complete BS/EN localization and locale-aware date/number/currency formatting for shared UI infrastructure (`ErrorBoundary`, `NotFound`, `DateRangeFilter`, `ui/ImportModal`, `AppHeader`) and remaining public/shared formatter calls (`PublicSubAgentPortal`, `PackageDetail`, `CreateReservationModal`, `GlobalSearch`, `AnalyticsChart`), while keeping `ErrorBoundary` 100% bootstrap-safe outside `I18nProvider`.

## 2. Current problem

- `ErrorBoundary.tsx`: wraps `I18nProvider` at the app root, currently 100% hardcoded English (`Something went wrong`, `Refresh Page`, `Go to Login`, `Try Again`, `Copy Error Details`, `Error Details (Development)`).
- `NotFound.tsx`: hardcoded English `PageMeta`, heading (`ERROR`), description, and `Back to Home Page` link.
- `DateRangeFilter.tsx`: hardcoded English labels (`From`, `To`, `Granularity`) and options (`Daily`, `Weekly`, `Monthly`), without `htmlFor` accessibility bindings.
- `components/ui/ImportModal.tsx`: 100% hardcoded English upload/mapping/preview/footer copy and raw `err.message` toasts, plus an unlabelled close button.
- `AppHeader.tsx`: hardcoded `aria-label="Toggle Sidebar"` and missing `aria-label` on the mobile application menu toggle.
- `PublicSubAgentPortal.tsx`: hardcoded `"bs-BA"` in `fmtDate` / `fmtCurrency`, hardcoded Bosnian `PageMeta`, fallback error text, `Tier:`, `Klijent`, and document type labels.
- `PackageDetail.tsx`: local `formatCurrency` / `formatDate` hardcoded `"bs-BA"`.
- `CreateReservationModal.tsx` (line 241), `GlobalSearch.tsx` (lines 188, 261), `AnalyticsChart.tsx` (lines 38, 119, 144): hardcoded `"bs-BA"`, `"en-US"`, system default `toLocaleDateString()` / `toLocaleString()`, and `"popunjeno"`.

## 3. Required discovery before editing

Inspected:
- `nmt-analytics-admin/src/components/common/{ErrorBoundary,DateRangeFilter,GlobalSearch}.tsx`
- `nmt-analytics-admin/src/pages/OtherPage/NotFound.tsx`
- `nmt-analytics-admin/src/components/ui/ImportModal.tsx`
- `nmt-analytics-admin/src/layout/AppHeader.tsx`
- `nmt-analytics-admin/src/pages/{PublicSubAgentPortal,PackageDetail}.tsx`
- `nmt-analytics-admin/src/components/reservations/{CreateReservationModal,NewSaleWizard}.tsx` (note: preserved `NewSaleWizard` stored `booking_snapshot.departure_label` contract per inline comment)
- `nmt-analytics-admin/src/components/charts/AnalyticsChart.tsx`
- Existing tests: `e2e/finance-forms/{imports,portal}.spec.ts`, `src/tests/{packageDetailPage,globalSearch}.test.tsx`.

## 4. In scope

- Exact BS/EN dictionary keys in `bs.ts` and `en.ts`.
- Bootstrap-safe localization in `ErrorBoundary.tsx` (no `useT()`, resilient to restricted `localStorage`).
- Full BS/EN localization in `NotFound.tsx`, `DateRangeFilter.tsx`, `components/ui/ImportModal.tsx`, `AppHeader.tsx`, `PublicSubAgentPortal.tsx`.
- Locale-aware formatting (`bs-BA` vs `en-GB`) in `PackageDetail.tsx`, `CreateReservationModal.tsx`, `GlobalSearch.tsx`, `AnalyticsChart.tsx`.
- Vitest (`src/tests/sharedPublicLocale.test.tsx`) + Chromium Playwright (`e2e/finance-forms/shared-public-locale.*`) and regression runs of `imports.spec.ts` & `portal.spec.ts`.

## 5. Out of scope

- Modifying `src/components/import/ImportModal.tsx` (`imports.spec.ts` target) or altering `NewSaleWizard` stored snapshot serialization.
- Any backend, API, or database changes (other than running full API build/tests as baseline sanity).

## 6. Domain rules

- `ErrorBoundary` MUST work when rendered WITHOUT `I18nProvider` and when `localStorage.getItem` throws.
- Preserve existing `portal.spec.ts` and `imports.spec.ts` selectors and fail-closed error behavior.

## 7. API requirements

No API code changes in this batch.

## 8. Database / migration requirements

No schema change is needed.

## 9. Frontend / UX requirements

- Preserve TailAdmin styling, light/dark classes, and responsive layouts across 390/768/1440px.
- Maintain accessible button/input labels (`aria-label`, `<label htmlFor>`).

## 10. Tenant and security acceptance

- Sanitize UI error messages in `ui/ImportModal.tsx` instead of exposing raw client/server `err.message`.
- Preserve `PublicSubAgentPortal` token isolation (`credentials: 'omit'`, safe link URL scheme check).

## 11. Acceptance criteria

- [ ] `ErrorBoundary` renders localized BS/EN copy even without `I18nProvider` or when storage throws.
- [ ] `NotFound`, `DateRangeFilter`, `ui/ImportModal`, `AppHeader`, `PublicSubAgentPortal` have full BS/EN parity.
- [ ] `PackageDetail`, `CreateReservationModal`, `GlobalSearch`, `AnalyticsChart`, `PublicSubAgentPortal` use locale-aware formatting.
- [ ] BS/EN parity (`i18nParity.test.ts`), Admin lint/test/build, Playwright specs, and API build/test pass.

## 12. Required tests

- `src/tests/sharedPublicLocale.test.tsx` (Vitest)
- `e2e/finance-forms/shared-public-locale.spec.ts`, `imports.spec.ts`, `portal.spec.ts` (Playwright Chromium)
- Full Admin lint/test/build + API build/test.

## 13. Required verification commands

```bash
cd nmt-analytics-admin
npm run lint
npm test
npm run build
npx playwright test --config=playwright.finance-forms.config.ts e2e/finance-forms/shared-public-locale.spec.ts e2e/finance-forms/imports.spec.ts e2e/finance-forms/portal.spec.ts

cd ../nmt-analytics-api
npm run build
npm test
```

## 14. Completion report

Follow `AGENTS.md` Section 9 completion report contract.
