# P2 Batch A: Configuration & Access Administration BS/EN Localization, Locale Formatting, Fail-Closed Recovery & Accessibility

- **Branch:** `fix/i18n-admin-configuration-batch`
- **Base (`origin/main`):** `3f525b5` (after PR #173, #174, #175)
- **Status:** Implemented & verified locally (CI running on PR branch)

## Scope (Bounded)

Admin-only BS/EN localization, locale-aware date/currency formatting, accessibility bindings, and fail-closed read/save error recovery across the Configuration & Access Administration screens listed in `docs/operations/final-i18n-inventory.md` ("Batch A"):

1. `nmt-analytics-admin/src/pages/admin/Settings.tsx` (remaining hardcoded literals, currency option labels, plan load fallback, voucher badge/agency fallback, Message Templates subsection + safe localized errors)
2. `nmt-analytics-admin/src/pages/admin/AuditLogs.tsx` (full BS/EN localization, `htmlFor`/`id` filter labels, locale-aware `formatDate`, fail-closed read error + Retry instead of false empty table, deduplicated search filter fetch, safe `entity_id` substring guard)
3. `nmt-analytics-admin/src/pages/Profile.tsx` (full BS/EN localization, `PageMeta`, localized role names, fail-closed load recovery blocking blank editable form, serialized submit with draft retention and no raw `err.message` leakage)
4. `nmt-analytics-admin/src/pages/portal/PortalSettings.tsx` (remaining BS/EN strings, localized role label, code-keyed validation/save `role="alert"` that re-localizes live on BS <-> EN switch while preserving drafts)
5. `nmt-analytics-admin/src/pages/admin/Integrations.tsx` (move `CIS / eTurista` card inside the responsive grid container, full BS/EN localization, locale-aware `formatCurrency` & date formatting, inline safe `eTurista` history error handling without raw `err.message` leakage)
6. `nmt-analytics-admin/src/components/integrations/IntegrationCard.tsx` (localized badge/action labels)
7. `nmt-analytics-admin/src/components/integrations/ConfigureIntegrationModal.tsx` (localized labels/toast/preview-only notice)
8. `nmt-analytics-admin/src/utils/business.ts` (`formatDate(dateString, locale?)` backward-compatible locale support)
9. `nmt-analytics-admin/src/lib/i18n/{bs,en}.ts` (exact structural + `{token}` parity)

## Out of Scope / Guardrails

- No backend or SQL migrations (hosted DB/backup blockers remain unchanged).
- No activation of SMTP/email, SMS, payment gateways, or external integrations.
- No unrelated visual redesign; preserve existing TailAdmin cards, tables, dark/light tokens, and existing `organizationSettingsSafety.test.tsx` / `organization-settings.spec.ts` contracts.

## Verification Gates

1. `npm run lint` (`0` errors)
2. `npm test` (including `i18nParity.test.ts`, `organizationSettingsSafety.test.tsx`, and new `adminConfigurationLocale.test.tsx`)
3. `npm run build` (`tsc -b && vite build`)
4. Real Chromium Playwright across `BS/EN × light/dark × 390/768/1440`:
   - `e2e/finance-forms/admin-configuration-locale.spec.ts`
   - `e2e/finance-forms/organization-settings.spec.ts`
   - `e2e/finance-forms/onboarding-staff.spec.ts`
5. API build & Vitest baseline confirmation (zero regressions).
