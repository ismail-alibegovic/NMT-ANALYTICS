# P2 Batch B: Finance & Documents BS/EN Localization, Locale Formatting, Fail-Closed Recovery & Accessibility

- **Branch:** `fix/i18n-finance-documents-batch`
- **Base (`origin/main`):** `3f525b5`
- **Status:** Implemented & verified locally (CI running on PR branch)

## Scope (Bounded)

Admin-only BS/EN localization, locale-aware date/currency formatting, accessibility bindings, and fail-closed read/save error recovery across the Finance & Documents screens listed in `docs/operations/final-i18n-inventory.md` ("Batch B"):

1. `nmt-analytics-admin/src/pages/admin/UnifiedPayments.tsx` (replace local hardcoded `bs-BA` helpers with shared locale-aware `formatCurrency`/`formatDate`, localize all headings/tabs/cards/columns/badges/filters/pagination/empty states/CSV headers, add fail-closed `role="alert"` + Retry per tab, guard ID substring)
2. `nmt-analytics-admin/src/pages/operations/Receipts.tsx` (full BS/EN localization, locale-aware currency/date, `htmlFor`/`id` labels, icon button `aria-label`s, fail-closed read recovery + Retry, modal inline validation re-localization without raw `err.message`, serialized create)
3. `nmt-analytics-admin/src/pages/operations/Contracts.tsx` (full BS/EN localization, locale-aware currency/date, `htmlFor`/`id` labels, icon button `aria-label`s, fail-closed read recovery + Retry, modal inline validation re-localization without raw `err.message`, serialized create)
4. `nmt-analytics-admin/src/pages/admin/Documents.tsx` (localize remaining `Uploaded By`/`System`/`automated`/Auth/PDF Templates banner/empty/error states, locale-aware `formatDate`, code-keyed upload errors so BS <-> EN re-localizes without raw `err.message`, fail-closed read + Retry)
5. `nmt-analytics-admin/src/pages/admin/PdfTemplateEditor.tsx` (localize remaining button/style/preview literals and add `htmlFor`/`id` bindings while preserving all existing draft/concurrency/retry contracts)
6. `nmt-analytics-admin/src/utils/business.ts` (`formatDate(dateString, locale?)`)
7. `nmt-analytics-admin/src/lib/i18n/{bs,en}.ts` (exact structural + `{token}` parity)

## Out of Scope / Guardrails

- No backend or SQL migrations; no payment gateway or external provider activation.
- Preserve existing `documents.spec.ts` and `document-templates.spec.ts` browser assertions and all TailAdmin styling.

## Verification Gates

1. `npm run lint` (`0` errors)
2. `npm test` (including `i18nParity.test.ts` and new `financeDocumentsLocale.test.tsx`)
3. `npm run build` (`tsc -b && vite build`)
4. Real Chromium Playwright across `BS/EN × light/dark × 390/768/1440`:
   - `e2e/finance-forms/finance-documents-locale.spec.ts`
   - `e2e/finance-forms/documents.spec.ts`
   - `e2e/finance-forms/document-templates.spec.ts`
5. API build & Vitest baseline confirmation (zero regressions).
