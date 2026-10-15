# Task: M23 — Full Product BS/EN Localization Audit & Polish

## Metadata
- **Milestone:** M23
- **Branch:** `feature/m23-full-bs-en-audit`
- **Type:** Enhancement / Internationalization
- **Status:** In Progress
- **Created:** 2026-10-16

## Objectives
1. Eliminate hardcoded English strings across the core administration application layout and key administrative screens.
2. Ensure 100% Bosnian (`bs`) and English (`en`) parity in translation structures without breaking existing translation keys.
3. Replace hardcoded strings in:
   - Header user dropdown (`UserDropdown.tsx`)
   - Header notifications dropdown (`NotificationDropdown.tsx`)
   - Availability operational view (`Availability.tsx`)
   - Global loading workspace state (`App.tsx`)
   - Administrative entity delete notifications (`Customers.tsx`, `Packages.tsx`, `Documents.tsx`)
4. Verify complete i18n parity via automated tests and ensure all admin/api test suites pass.

## In-Scope Files
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/components/header/UserDropdown.tsx`
- `nmt-analytics-admin/src/components/header/NotificationDropdown.tsx`
- `nmt-analytics-admin/src/pages/operations/Availability.tsx`
- `nmt-analytics-admin/src/App.tsx`
- `nmt-analytics-admin/src/pages/admin/Customers.tsx`
- `nmt-analytics-admin/src/pages/admin/Packages.tsx`
- `nmt-analytics-admin/src/pages/admin/Documents.tsx`
- `nmt-analytics-admin/src/tests/i18nParity.test.ts`

## Verification Plan
1. `npx vitest run src/tests/i18nParity.test.ts`
2. `npm run lint` & `npm test` & `npm run build` in `nmt-analytics-admin`
3. `npm test` & `npm run build` in `nmt-analytics-api`
