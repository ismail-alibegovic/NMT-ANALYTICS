# Task: Final i18n Parity Sweep (Zero BS/EN Mixed Strings)

## Goal
Eliminate all remaining hardcoded Bosnian/English strings and hardcoded `.toLocaleString()` / `.toLocaleDateString()` / `bs-BA` / `en-US` calls in components and pages outside Batches A–D so selecting either Bosnian or English renders 100% in that single language.

## In Scope
- `nmt-analytics-admin/src/lib/i18n/bs.ts` & `en.ts`: add matching BS/EN keys (`common`, `packages`, `customers`, `operations.calendar`, `operations.availability`, `createReservationModal`).
- `nmt-analytics-admin/src/components/operations/RoomingWorkspace.tsx`: read `t?.departures?.rooming ?? t?.operations?.rooming`.
- `nmt-analytics-admin/src/components/reservations/CreateReservationModal.tsx`: full BS/EN localization + locale-aware departure dates.
- `nmt-analytics-admin/src/pages/operations/Calendar.tsx`: localized weekdays/months/legend/errors/titles and locale-independent ISO day keys.
- `nmt-analytics-admin/src/pages/operations/Availability.tsx`: localized status badges, error toasts, unknown package fallback, and locale-formatted refresh timestamp.
- `nmt-analytics-admin/src/pages/admin/Packages.tsx` & `Customers.tsx`: localized load errors, auth/empty states, retry labels, filter hints, customer status badges, and page meta.
- `nmt-analytics-admin/src/components/charts/DonutChart.tsx`: localized total/empty label and locale-formatted tooltip/totals.
- Locale-aware `toLocaleString(locale)` / `toLocaleDateString(locale)` in `Inquiries.tsx`, `ItineraryDetail.tsx`, `Quotations.tsx`, `QuotationDetail.tsx`, `QuotationBookingPanel.tsx`, `Suppliers.tsx`, `Dashboard/Home.tsx`.
- Regression unit tests (`src/tests/finalParitySweep.test.tsx`) and Playwright harness/spec (`e2e/finance-forms/final-parity-sweep.{html,tsx,spec.ts}`).

## Out of Scope
- Stored reservation snapshot label contract in `NewSaleWizard.tsx` (`departure_label`).
- Backend API / DB migrations.

## Verification
- `npm --prefix nmt-analytics-admin run lint`
- `npm --prefix nmt-analytics-admin test`
- `npm --prefix nmt-analytics-admin run build`
- `npm --prefix nmt-analytics-api run build`
- `npm --prefix nmt-analytics-api test`
- Playwright `--config=nmt-analytics-admin/playwright.finance-forms.config.ts e2e/finance-forms/final-parity-sweep.spec.ts`
