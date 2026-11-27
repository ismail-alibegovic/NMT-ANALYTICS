# Intelligence M4 — Travline Academy (Onboarding & Contextual Help)

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`

## 1. Goal
Build **Travline Academy** — a built-in, role-aware, fully bilingual (BS/EN) onboarding, workflow guide, and module reference center inside the Admin app so agency staff (Directors, Managers, Sales Agents, Operations) immediately understand Travline's modules, workflows, financial rules, and document standards without guesswork.

## 2. Scope (In)
1. **Travline Academy Page (`/academy`):**
   - Searchable, category-filterable, role-aware learning & workflow hub.
   - Covers core Travline workflows:
     1. Agency Setup & Branding (Org settings, PDF templates, tax/bank details, staff roles)
     2. Sales & Pre-Sales Funnel (Inquiries → Quotations → Reservations / NewSaleWizard)
     3. Packages & Departures (Package templates vs dated Departures, capacity, pricing)
     4. Operations & Readiness (Room slots, hotel allocations, bus/flight seating, manifests & batch vouchers)
     5. Finance & Fiscal Truth (Payments, installment schedules, non-fiscal `Potvrda uplate` (`PU-YYYY-XXXX`) vs fiscalized receipts, refunds, departure profitability)
     6. Role & Security Guide (Director, Manager, Agent, Viewer permissions and tenant isolation)
   - Interactive role filter (`All`, `Director`, `Manager`, `Agent`, `Operations`) and deep-links directly into the relevant Travline module pages (`/packages`, `/departures`, `/reservations`, `/inquiries`, `/quotations`, `/admin/unified-payments`, `/operations/receipts`, `/admin/settings`).
2. **Bilingual BS/EN Parity:**
   - Complete Bosnian (`bs.ts`) and English (`en.ts`) translations with zero mixed-language strings.
3. **Navigation & Routing:**
   - Register `/academy` route in `App.tsx` (authenticated, available to all internal roles `viewer`+).
   - Add `Travline Academy` entry in `AppSidebar.tsx`.
4. **Tests:**
   - Unit test verifying Academy rendering, search/category/role filtering, and full BS/EN switching without missing keys.

## 3. Out of scope
- AI-powered conversational Q&A (Milestone 7).
- Backend database tables for Academy (static curated verified content so it stays fast, deterministic, and zero-migration).

## 4. Acceptance criteria
- [x] `/academy` route and sidebar entry work for all authenticated internal roles.
- [x] Search, category tabs, and role filter work cleanly in both light and dark modes.
- [x] Full BS/EN i18n parity with zero hardcoded user-facing strings.
- [x] Admin lint, `tsc --noEmit`, vitest, and `vite build` pass.
