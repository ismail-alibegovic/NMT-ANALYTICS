# Phase 0 — UX Audit Findings

**Date:** 2026-08-13
**Audited by:** Browser screenshots (light + dark) + codebase review + direct navigation
**Scope:** All 20+ admin pages, competitor UIs (6 competitors)

---

## 1. Current State Summary

Travline has 38 API routes and 14+ frontend page groups. The backend is production-quality. The frontend is functional but has systematic UX issues.

### What's Working

- Dark mode + light mode toggle (localStorage-persisted)
- i18n BS/EN across all 350+ keys
- Responsive layout (mobile sidebar collapses)
- ⌘K global search palette
- 3-step NewSaleWizard (package+term, details, review)
- Contextual sidebar (hidden on hub, appears inside sections)

### What's Broken

- **Settings pages 404** — `/settings` and `/settings/pdf-templates` return "Site unavailable" for test user
- **Operations pages identical** — 10 operations pages (commission-rules through documents) render identical empty states with no data — indistinguishable from each other
- **Hub too sparse** — 7290-byte screenshot, mostly whitespace with zero-data widgets
- **No demo data** — every page shows "Nema rezervacija" / "No packages found" / "No customers found"

---

## 2. UX Problems by Severity

### 🔴 CRITICAL

#### 2.1 Contextual Sidebar Disorientation

**Problem:** The sidebar disappears on the hub and only appears when you enter a section. When it appears, it only shows items from that section. This means:
- User arrives at hub → no navigation visible
- Clicks "Sales" workspace button → sidebar slides in showing only Sales items
- User wants to check a contract → must first navigate to Operations scope
- No breadcrumb shows the current scope

**Why this matters:** TravelCollab and AgTravelSoft show full navigation at all times. Users know where everything is. Travline's design requires discovering how to switch scopes.

**Fix:** Keep the contextual filtering but always show the sidebar. On the hub, show all groups collapsed to headers. When entering a section, auto-expand that group.

#### 2.2 All Operations Pages Identical

**Problem:** 10 pages under Operations (calendar, contracts, receipts, sub-agents, commission rules, excursions, hotels, flights, availability) all render as "No data" empty states. Visually indistinguishable.

**Why this matters:** New users land on these pages and see nothing. There's no guided path to populate data. Competitors use demo data, onboarding checklists, or guided first-actions.

**Fix:** Add guided empty states per page with a "Create first X" prominent button and 1-sentence explanation of what this page does.

#### 2.3 Hub Doesn't Drive Action

**Problem:** The hub has the right structure (revenue hero, metric ledger, upcoming departures, shortcuts) but with zero data it's just empty cards. The "New reservation" button is the only clear action.

**Why this matters:** The hub is the most-visited page. It should make the user productive in 3 seconds. Competitors like TravelCollab lead with "Počnite sa radom u 4 laka koraka" (Start working in 4 easy steps).

**Fix:** Add "Quick start" section on hub for new orgs: 1. Add package → 2. Create departure → 3. Make reservation → 4. Generate documents. Each step links to the relevant page.

#### 2.4 Settings Routes Broken

**Problem:** `/settings` (Branding) and `/settings/pdf-templates` return "Site unavailable" for authenticated test user. These routes exist in App.tsx but don't render.

**Root cause:** Possibly missing from the route table or require director-level access that the test user doesn't have. Test user is a fresh signup → role may be 'agent', not 'director'.

**Fix:** Verify route registration and role requirements. Settings should be accessible to directors (test user may need role promotion).

### 🟡 HIGH

#### 2.5 Workflow Doesn't Match Agency Reality

**Problem:** The sidebar groups (Sales → Operations → Finance → System) are logical for developers but wrong for agency workers. Agency workflow is: **Find package → Check availability → Book → Manage passengers → Handle payments → Print documents.** The sidebar forces users to jump between groups.

**Why this matters:** TravelCollab's interface leads users through a linear flow. Travline makes users figure out the workflow themselves.

**Fix:** Add a "Quick Actions" dock or workflow bar that follows the natural sequence, regardless of which sidebar group they're in.

#### 2.6 No Data Visualization Without Data

**Problem:** The revenue hero on the hub renders an empty area chart and KM 0. The metric ledger shows all zeros. These only become useful after months of real data.

**Why this matters:** New agencies evaluating Travline during a trial see nothing. They can't imagine the value.

**Fix:** Add demo/seed data toggle. Show realistic sample data that resets when they import real data.

#### 2.7 Filter Controls Inconsistent

**Problem:** Some pages have status filters (reservations), some have type filters (receipts), some have date ranges (departures), some have none (packages, customers). The filter bar position and style varies.

**Fix:** Standardize `DataFilterBar` component used across all list pages.

### 🟢 MEDIUM

#### 2.8 Empty States Use Generic Language

**Problem:** Every empty state says "Nema rezervacija — Nije pronađena nijedna rezervacija za odabrane filtere." This is technically correct but doesn't help the user.

**Fix:** Differentiate between "no data exists yet" and "filters eliminated all results." The first should prompt creation, the second should suggest widening filters.

#### 2.9 No Breadcrumbs or Context Indicators

**Problem:** Users can't see their navigation path. If they deep-link to a departure detail page, they don't know which package it belongs to at a glance.

**Fix:** Add breadcrumb bar below header showing: Hub > Packages > Package Name > Departure Name.

#### 2.10 Tables Don't Support Row Actions Consistently

**Problem:** Some tables have inline actions (reservations: confirm/cancel), others require opening a modal (packages, customers). No consistent pattern.

**Fix:** Standardize: primary action on row click (open detail), secondary actions as dropdown menu (Edit, Delete, Duplicate).

---

## 3. Competitor UX Patterns to Steal

### TravelCollab (travelcollab.com)
- **"Počnite sa radom u 4 laka koraka"** — numbered onboarding flow on landing page
- **Dashboard preview image** — shows potential state, not empty state
- **Pricing page** with clear tiers
- **Real client logos** (Bečej Prevoz, Zvuk Putovanja, Olimpturs, etc.)
- **"3.5× veća efikasnost"** — quantified value proposition

### Turist Agent (turistagent.com)
- **Persona-based testimonials** — Ana, Dimitrije, Esat & Armin, Haris, Aleksandar, Emina
- **"Avantura, ne administracija!"** — clear emotional tagline
- **Feature icons** with 1-line descriptions

### AgTravelSoft (agtravelsoft.com)
- **"TravelOS" launch** with AI chatbot + online booking — future-focused positioning
- **"Do kraja 2026. primamo samo pet agencija"** — scarcity marketing
- **Multi-language** (SR/HR/EN/GR)

### Aurora Turist (auroraturist.com)
- **Desktop software screenshot** as main visual — shows actual interface, not abstract illustrations
- **Clear feature checklist** with integrations highlighted (CIS, NBS, fiscal)

### Sintesys (sintesys.hr)
- **ISO 27001 certification badge** — enterprise trust signal
- **Client logo wall** (Agera, Ambassador, Aplicon Tours, Globtour, Elite Travel)
- **"Više od 25 godina iskustva"** — longevity as trust signal

---

## 4. Priority Fix Order

1. **Fix settings routes** (blocker — can't configure branding or PDFs)
2. **Add guided empty states** to all pages (unlocks usability for new orgs)
3. **Restore full sidebar always visible** with collapsed groups on hub
4. **Add "Quick Start" workflow on hub for new orgs**
5. **Standardize filter bar component**
6. **Add demo/seed data capability**
7. **Standardize row actions pattern**
8. **Add breadcrumbs**

---

## 5. Competitor Screenshots

Located in: `docs/ux-audit/competitors/`
- turistagent.com.png (580 KB)
- auroraturist.com.png (123 KB)
- travelcollab.com.png (599 KB)
- agtravelsoft.com.png (1.3 MB)
- sintesys.hr.png (695 KB)
- program-agencija.net.png (40 KB — SSL error, site inaccessible)

## 6. Travline Screenshots

Located in: `docs/ux-audit/screenshots/light/`
- 01-hub.png (captured via Zo browser)
- Remaining screenshots pending stable browser session

*Full screenshot set will be completed when auth session is reliable across agent-browser restarts.*
