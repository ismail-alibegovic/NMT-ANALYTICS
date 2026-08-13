# Travline Competitive Plan — From MVP to Best-in-Region

**Date:** 2026-08-13  
**Status:** Active  
**Supersedes:** `TRAVLINE_FINAL_PLAN.md` (completed sprints), `TRAVLINE_UX_REDESIGN_PLAN.md` (historical/reverted)

---

## Current State

Sprints 1–5 are done. Backend is deep (38 API routes, multi-org, RLS, audit, fiscal, AI endpoints). Frontend functions but is not competitive — workflow is unintuitive, many features are hidden or poorly positioned, visual language is flat and generic, and there's zero public presence.

This plan fixes that, in order of user impact.

**Guiding principle:** Build for the agency worker. Every screen must answer "what does an agent actually need to do right now?" — not "what data do we have to display?"

**Hard rule (from the reverted UX redesign):** No broad mechanical refactors across 20+ pages. One page at a time. Visual diff before and after. Show Ismail before touching a second page.

---

## Phase 0 — Foundation Audit (2 days)

Before changing anything, we need ground truth on every page's current state.

### 0.1 — Screenshot every current page
- Dashboard (hub)
- Reservations list
- Nova Prodaja wizard (all 3 steps)
- Packages list + create/edit
- Departures list + detail page (all 4 tabs)
- Customers list + detail
- Calendar
- Contracts list
- Receipts list
- Sub-agents list
- Excursions list + detail
- Hotels list + create/edit
- Reports page
- Integrations page
- Settings / PDF templates
- Audit logs
- Documents
- Customer portal routes (/portal/*)

**Output:** Screenshot library at `Travline/docs/ux-audit/screenshots/` — light + dark for each.

### 0.2 — Click-path audit
For each page, record:
- What's the most common action? (e.g. "create reservation" — can it be done in ≤2 clicks from the hub?)
- What's hidden behind a click/tab that should be visible? (e.g. transport type, hotel allocation, payment status)
- What's visible but rarely used? (e.g. CSV import button on an empty table)
- What's confusing or redundant? (e.g. two places to find the same data)

**Output:** `Travline/docs/ux-audit/click-paths.md` — one section per page, bullet list of findings.

### 0.3 — Competitor screenshot library
Capture the actual admin interfaces (not landing pages) of:
- TravelCollab (has a demo video — screenshot from it)
- Aurora Turist (has a demo screenshot on landing page)
- AgTravelSoft (has a dashboard mockup)

**Output:** `Travline/docs/ux-audit/competitors/` — what real agency workers see when they log in.

---

## Phase 1 — Core Workflow: The Agent's Day (2 weeks)

This is the highest-impact phase. An agent's real workday is: check what's happening today → handle new bookings → process payments → resolve issues. Travline currently forces them to navigate between 5+ pages for this.

### 1.1 — Hub becomes the command center (3 days)

**Current state:** The hub shows KPI cards + shortcuts. It's a dashboard, not a control surface.

**Target:** The hub should be the first and last place an agent goes. Everything should start here.

**Specific changes:**

1. **"Šta je danas?" — Today panel** (top-left, replaces the empty Revenue hero for agents)
   - Today's departures (clickable → departure detail)
   - Today's check-ins (from hotel reservations)
   - Today's excursions
   - No data? Show "Nema današnjih aktivnosti" — not an empty chart

2. **"Hitno" — Needs attention** (top-right, replaces one of the KPI cards)
   - Overdue payments (clients who should have paid)
   - Unconfirmed reservations older than 48h
   - Departures with <20% capacity within 7 days
   - Each item is clickable → takes you directly to resolve it

3. **Quick-action bar** (below the hero, replaces the Workspaces grid)
   - + Nova rezervacija (opens wizard directly)
   - + Nova uplata (quick payment form)
   - + Novi klijent (quick customer form)
   - Calendar mini-view (3-month strip, today highlighted, departures as dots)

**Files touched:**
- `nmt-analytics-admin/src/pages/Hub/Dashboard.tsx` (or `Home.tsx` — verify current file)
- New components: `TodayPanel.tsx`, `NeedsAttention.tsx`, `QuickActions.tsx`
- New API endpoints if needed (overdue payments query, urgent departures query)

**Verification:** Agent logs in → sees today's work → clicks one thing → resolves it. No dead ends.

### 1.2 — Nova Prodaja wizard: real agent flow (3 days)

**Current state:** 3-step wizard (Aranžman+Termin → Detalji → Pregled). It works but feels like a form, not a sales tool.

**Target:** The wizard should feel like a conversation with the client. Agent asks questions → fills in answers → system does the rest.

**Specific changes:**

1. **Step 1: "Šta klijent traži?"** — rename from "Aranžman + Termin"
   - Package cards should show: destination image, price from, next departure date, seats left
   - After selecting a package, departures should appear instantly with real-time capacity
   - Add a "Brza rezervacija" mode: agent types destination + date → system suggests matching packages/departures

2. **Step 2: "Detalji putovanja"** — rename, restructure vertically
   - **Putnici section FIRST** (not buried below): party size, room preference, transport preference
   - **Klijent section SECOND**: search existing or create new inline (no modal)
   - **Dodatne usluge** section (collapsed by default): excursions, insurance, extras
   - **Cijena** updates in real-time in a sticky sidebar as you fill the form

3. **Step 2 → Step 3 transition:** "Potvrdi" button should show a summary toast (not a full new step) with: customer name, departure, party size, total, payment due. One-click confirm. Option to "Prikaži detalje" if they want the full review.

**Files touched:**
- `nmt-analytics-admin/src/components/reservations/NewSaleWizard.tsx`
- New: `QuickReservationSummary.tsx` (replaces Step 3 full page)
- API: optionally a `/api/search/suggest` endpoint for fast typeahead

**Verification:** Time a mock sale. Agent should go from "klijent zove" to "potvrđeno" in under 90 seconds.

### 1.3 — Calendar becomes interactive (2 days)

**Current state:** Calendar is a read-only grid. You see departures but can't do anything with them.

**Target:** Calendar is the primary visual planning surface.

**Specific changes:**

1. **Click a departure dot** → mini-preview card (destination, capacity bar, next actions)
2. **Click an empty day** → "Dodaj polazak za ovaj datum" shortcut
3. **Drag to select a date range** → shows all departures in that range
4. **Color-coding:** Green = >50% sold, Yellow = 20-50%, Red = <20% (within 14 days), Gray = far future
5. **Filter strip above calendar:** by package, by transport type, by status

**Files touched:**
- `nmt-analytics-admin/src/pages/Operations/Calendar.tsx` (or wherever the calendar route lives)
- New: `DeparturePreviewCard.tsx`
- New: `CalendarFilterStrip.tsx`

**Verification:** Agent opens calendar → sees 3 red departures next week → clicks one → sees it's at 15% → clicks "Kontaktiraj klijente" → reservation list filtered to that departure's interested leads.

### 1.4 — Surface hidden features (2 days)

**Problem:** Transport type, hotel allocation, package variants, excursion links — these exist in the DB and API but are hidden behind tabs, dropdowns, or completely absent from the booking flow.

**Specific changes:**

1. **Transport type visible on departure cards** (bus icon, flight icon — not just text)
2. **Hotel allocation visible on departure detail** — room type grid with available/booked counts, click to allocate
3. **Package variants shown as chips on the package card** (e.g. "3 varijante: Standard, Premium, All-inclusive")
4. **Excursion upsell in the reservation detail** — "Dodaj ekskurziju" button with available excursions for that departure's destination

**Files touched:**
- `DepartureCard` component (wherever rendered)
- `DepartureDetail.tsx` (Putnici and Hoteli tabs)
- `PackageCard` component
- `ReservationDetail` (if exists) or reservation row expansion

**Verification:** Agent creating a reservation should never need to open a separate page to see transport type, hotel rooms, or available excursions.

---

## Phase 2 — Visual Identity & Polish (1.5 weeks)

Travline looks like a generic admin panel. Competitors (TravelCollab especially) feel like travel products — warmer, more visual, more spacious. The dark mode is good but the design language needs to feel like *travel software*, not a database frontend.

### 2.1 — Design token refresh (1 day)

**Current state:** Flat gray cards (`border-gray-200`, `bg-white`, `dark:border-gray-800`) — clean but clinical.

**Target:** Keep the dark foundation but introduce a travel-appropriate accent system.

**Changes:**

1. **Define a Travline brand token set** in `tailwind.config.ts` or `theme.json`:
   ```js
   colors: {
     brand: {
       50:  '#eff6ff',   // light bg
       100: '#dbeafe',
       500: '#3b82f6',   // primary CTA
       600: '#2563eb',   // hover
       700: '#1d4ed8',   // active
     },
     travel: {
       sun:    '#f59e0b',  // amber — warmth, highlights
       sea:    '#0ea5e9',  // sky blue — links, info
       forest: '#10b981',  // emerald — success, confirm
       coral:  '#ef4444',  // red — urgent, overdue
     }
   }
   ```

2. **Replace brand-500-only usage** with contextual colors: confirm = forest, urgent = coral, info = sea

3. **Cards get a subtle warm tint** in dark mode (not pure gray — `gray-900` with a `2%` amber overlay or warmer gray like `neutral-900`)

**Files touched:**
- `nmt-analytics-admin/tailwind.config.ts` (or `postcss.config.js` depending on Tailwind version)
- Global `index.css` (card base styles)

### 2.2 — Typography & spacing pass (2 days)

**Current state:** Working but inconsistent. Some pages have good hierarchy, others are walls of text.

**Changes:**

1. **Page headers unified:** Every page gets: icon + title + description + action button — same layout, same spacing
2. **Data density reduced:** Empty states shouldn't be "Nema rezervacija" in small text — they should be a centered illustration + helpful message + CTA
3. **Tables get zebra striping** (subtle, `bg-gray-50/50` on even rows) for scanability
4. **Numbers aligned right** in table columns (prices, counts, dates)
5. **Status badges standardized:** same pill shape, same position, same animation

**Files touched:**
- `PageToolbar.tsx` (unify the header pattern)
- `EmptyState.tsx` (enhance with icons + CTAs)
- `DataTable.tsx` (zebra, alignment)
- `StatusBadge.tsx` (if exists; standardize)

### 2.3 — Loading & empty state design (1 day)

**Current state:** Spinners and "Nema podataka" messages. Generic.

**Changes:**

1. **Skeleton cards** for dashboard widgets (not spinners — skeleton conveys structure)
2. **Empty states with action:** "Još nema rezervacija" → illustration + "Kreiraj prvu rezervaciju" button
3. **Loading skeleton for tables:** 5 gray rows that mimic the actual row height
4. **Transition animations:** pages fade in (200ms), cards slide up on load (staggered)

**Files touched:**
- New: `SkeletonCard.tsx`, `SkeletonTable.tsx`
- `EmptyState.tsx` enhancement
- `AppLayout.tsx` (page transition wrapper)

### 2.4 — Mobile responsiveness audit (2 days)

**Current state:** Admin panel "works" on mobile but wasn't designed for it. Agents use phones.

**Changes:**

1. **Test every page at 375px width** — fix any horizontal overflow, collapsed tables, unreachable buttons
2. **Bottom nav bar for mobile** (not hidden sidebar): 4 icons — Početna, Nova prodaja, Kalendar, Klijenti
3. **Wizard must work on mobile** — stacked layout, not side-by-side
4. **Tables become card lists on mobile** (not shrunken tables)

**Files touched:**
- `AppLayout.tsx` (mobile nav)
- `NewSaleWizard.tsx` (responsive layout)
- `DataTable.tsx` (card-list fallback)
- All list pages (verify responsive)

---

## Phase 3 — Regional Must-Haves (1.5 weeks)

These are the features Balkan agencies expect as table stakes. Without them, Travline can't compete regardless of UX quality.

### 3.1 — NBS kursna lista integration (2 days)

**What:** Daily exchange rate feed from National Bank of Serbia. Used by every RS agency for multi-currency pricing.

**Implementation:**
1. Backend: `GET /api/integrations/nbs-rates` — fetch + cache NBS XML feed, return current rates
2. Frontend: Currency selector on reservation form (RSD/EUR/USD/CHF), auto-conversion
3. DB: `org_settings.nbs_rates_enabled` flag (per-org)

**File:** New `nmt-analytics-api/src/routes/nbs.ts`, new card on Integrations page.

**Source:** NBS publishes daily XML at `https://www.nbs.rs/kursnaListaModul/srednjiKurs.faces` (or a simpler endpoint — verify).

### 3.2 — IPS QR code payments (2 days)

**What:** Generate IPS QR codes for instant payments (NBS IPS system). Every Serbian bank supports this. TravelCollab already has it.

**Implementation:**
1. Backend: `POST /api/payments/qr` — generate IPS QR payload (JSON → base64 image)
2. Frontend: "Plati putem IPS QR" button on payment form, shows QR code + amount
3. Print-ready: QR code included in invoice PDF

**File:** New `nmt-analytics-api/src/routes/ips.ts`.

**Spec:** IPS QR standard — beneficiary, amount, currency, payment code, purpose. Reference: https://ips.nbs.rs/

### 3.3 — Fiskalni računi (RS fiscalization) (3 days)

**What:** Electronic fiscal receipts via Serbian Tax Administration (Poreska uprava). Legal requirement for all RS agencies.

**Current state:** Travline generates PDF receipts but they're not fiscalized. The fiscal compliance layer exists (`src/lib/fiscal/`) but only eTurista is live.

**Implementation:**
1. Research RS fiscalization API requirements (SUF/Sistema za upravljanje fiskalizacijom)
2. Implement `FiskalizacijaRSProvider` in `src/lib/fiscal/`
3. Wire into receipt generation flow
4. Test with sandbox endpoint

**Note:** This may require a qualified electronic certificate (posedovanje kvalifikovanog elektronskog sertifikata) per agency. Interface slot already ready in the fiscal layer.

### 3.4 — WhatsApp share button / Viber integration (1 day, basic)

**What:** Agents need to send booking confirmations to clients. Clients are on Viber/WhatsApp, not email.

**Implementation:**
1. **Quick start:** WhatsApp share link on reservation detail — pre-fills message with booking details
2. **Next step (post-launch):** Viber Business API integration for automated messages
3. **Wire `whatsapp://` and `viber://` deep links** into the "Pošalji klijentu" action

**File:** Modified `ReservationDetail` or reservation actions dropdown.

---

## Phase 4 — Public-Facing Product (2 weeks)

Travline currently has no public face. Agencies can't discover it, trial it, or buy it. This phase makes it a real SaaS product.

### 4.1 — Public landing page (3 days)

**What:** A standalone marketing site at `travline.app` (or a zo.space route at `sprypine.zo.space/travline`, or a dedicated Zo Site).

**Pages needed:**
1. **Home:** Hero (headline + subhead + CTA), feature grid (6 cards with icons), testimonial carousel, pricing section, FAQ, footer
2. **Features:** Detailed feature list with screenshots (not a bullet list — show the product)
3. **Pricing:** 3 tiers (Free trial → Pro → Enterprise), feature comparison matrix
4. **Contact / Demo:** Form for booking a demo call

**Design:** Dark background (match Travline's admin aesthetic), bold accent colors, Inter font, clean spacing. Reference: TravelCollab's landing page structure + Travline's own dark aesthetic.

**Implementation:** Zo Site (Vite + React + Tailwind) — NOT a zo.space route. This needs its own domain potential.

**Command:**
```bash
# Create the site
# Will be a Zo Site at /home/workspace/Travline/travline-site/
```

### 4.2 — Testimonials & case studies (2 days)

**Problem:** Turist Agent has 7 real testimonials with names, photos, and stories. Travline has zero.

**What to do (before you have real clients):**
1. Write case-study personas based on the agency types Travline targets:
   - "Mirsad, vlasnik incoming agencije u Sarajevu" — 15 apartmana, 3 sub-agenta, prešao sa Excela
   - "Jelena, menadžerka u Beogradu" — 200+ putnika godišnje, koristi CIS integraciju
   - "Marko, DMC operater u Zagrebu" — kompleksni aranžmani, hoteli, transferi
2. Write their transformation stories (before → after Travline)
3. Publish on the landing page

**After first real client:** Replace persona stories with real testimonials. Photo + name + agency + quote.

### 4.3 — Self-service trial onboarding (2 days)

**Current state:** Signup works (`POST /auth/signup`) but there's no guided onboarding. A new agency sees an empty dashboard and has no idea what to do.

**What to add:**
1. **Onboarding checklist** (already partially built — verify current state):
   - ✅ Kreiran nalog
   - ⬜ Dodaj logo i brendiranje
   - ⬜ Kreiraj prvi paket
   - ⬜ Dodaj prvi polazak
   - ⬜ Kreiraj prvu rezervaciju
   - ⬜ Podesi eTurista (ako je RS agencija)
   - ⬜ Pozovi tim
2. **Demo data option:** "Učitaj demo podatke" — seeds 3 packages, 5 departures, 10 customers, 3 reservations. Agency can explore with real-looking data.
3. **Guided tour:** 5-step product tour overlay (optional, click-through)

**Files touched:**
- `OnboardingChecklist.tsx` (enhance existing)
- New: `DemoDataSeeder.tsx` (frontend trigger for a seeding API)
- Backend: `POST /api/onboarding/seed-demo` (director only)

### 4.4 — Customer booking widget → real product (2 days)

**Current state:** Embeddable HTML widget exists (`GET /api/public/packages`, `POST /api/public/reservations`). It's functional but bare.

**What to upgrade:**
1. **Widget configurator:** Agency sets colors, logo, which packages to show, language
2. **Widget looks like real booking, not an API test:** Styled with agency's branding, mobile-first, search + filter
3. **"Postavi na svoj sajt" page in admin:** Copy-paste `<script>` tag, preview
4. **Widget analytics:** How many views → clicks → bookings from the widget

**Files touched:**
- `/public/widget.html` (rewrite as a styled SPA)
- New: `WidgetSettings.tsx` in admin
- New: `GET /api/public/widget-config/:orgSlug` endpoint

---

## Phase 5 — AI Features (1 week)

AgTravelSoft's TravelOS is betting on AI as their differentiator. Travline has AI endpoints but nothing customer-facing. This phase makes AI a feature, not a footnote.

### 5.1 — AI Chatbot for agency websites (3 days)

**What:** An embeddable chatbot that answers booking questions 24/7 on the agency's website.

**Implementation:**
1. Backend: `POST /api/ai/chat` — receives message, searches packages/departures by intent, returns structured response
2. Frontend: Embeddable chat widget (like Intercom/Drift, but branded for the agency)
3. Capabilities: answer "imate li aranžman za Grčku u julu?", suggest packages, collect contact info, notify agent via email

**Model:** Use the existing AI routes pattern. Can call OpenAI/OpenRouter for natural language understanding.

### 5.2 — Occupancy Prediction → Actionable (1 day)

**Current state:** `GET /ai/occupancy` predicts fill rate. It's an API endpoint, not a feature.

**What to add:**
1. **Departure cards show prediction:** "Predviđena popunjenost: 85% ⬆" with trend arrow
2. **Alert when prediction drops:** "Polazak za Antaliju 15.08. je pao sa 60% na 40% predikcije — kontaktiraj klijente"
3. **Recommendation engine integrated into the hub:** "Top 3 paketa za promociju ovog mjeseca" based on occupancy data

### 5.3 — Smart search in the admin panel (1 day)

**What:** The ⌘K palette already exists but only searches by exact match. Upgrade it.

**Changes:**
1. **Fuzzy search** — "grcka jul" should find "Ljetovanje Grčka 2026"
2. **Intent-based results** — typing "klijenti koji duguju" should filter reservations with outstanding balances
3. **Action shortcuts** — typing "nova rezervacija" should open the wizard directly

---

## Phase 6 — Distribution & Growth (1 week)

With the product competitive, the focus shifts to getting agencies to use it.

### 6.1 — Demo environment (1 day)

**What:** A public demo at `demo.travline.app` with pre-loaded data. No signup required.

**Implementation:**
- Separate org with demo data (read-only)
- Auto-resets nightly
- Link from landing page: "Isprobaj demo"

### 6.2 — Referral program (1 day)

**What:** Existing agencies get 1 month free for each agency they refer.

**Implementation:**
- Referral codes generated per org
- Tracking via `?ref=CODE` on signup
- Admin UI to see referral stats

### 6.3 — Documentation & help center (2 days)

**What:** Agencies need docs. Currently there's nothing.

**Pages:**
- Getting started guide
- Feature guides (how to create a reservation, how to set up eTurista, etc.)
- FAQ
- Video walkthroughs (screen recordings)

**Implementation:** Simple markdown-powered docs site as part of the landing page (or a `/docs` route in the Zo Site).

### 6.4 — Agency directory / lead generation (1 day)

**What:** A public directory of agencies using Travline (opt-in). This gives agencies a reason to be listed and brings SEO traffic.

**Implementation:**
- Agency profile page (logo, description, contact, packages)
- Search by destination, agency type
- "Powered by Travline" badge

---

## Phase 7 — Advanced Features (Post-Launch, 3-6 months)

These are not required for launch but are necessary to become the *best* solution in the region.

### 7.1 — OTA Channel Manager
- Booking.com, Airbnb, Expedia API integration
- iCal sync for availability
- Real-time rate push
- Booking import → auto-creates reservations in Travline

### 7.2 — Proposal Builder
- Visual trip proposal designer
- Drag-drop itinerary builder
- Modular pricing calculator
- Branded PDF export
- Client approval workflow

### 7.3 — Mobile PWA
- Offline-capable reservation access
- Push notifications for departure reminders
- Quick payment capture (scan/swipe)

### 7.4 — HR Fiskalizacija (Croatia)
- The stub exists in `src/lib/fiscal/fiskalizacija-hr-provider.ts`
- Implement when first Croatian agency signs up

### 7.5 — BA ESET (Bosnia)
- Blocked until FBiH sub-laws (~Aug 2027)
- Interface slot ready

---

## Timeline Summary

| Phase | Duration | Cumulative | Key Deliverable |
|---|---|---|---|
| **0 — Audit** | 2 days | 2 days | Screenshot library, click-path analysis |
| **1 — Core Workflow** | 2 weeks | 2.5 weeks | Redesigned hub, wizard, calendar, surfaced features |
| **2 — Visual Identity** | 1.5 weeks | 4 weeks | Design tokens, typography, empty states, mobile |
| **3 — Regional Must-Haves** | 1.5 weeks | 5.5 weeks | NBS rates, IPS QR, fiscal receipts, WhatsApp |
| **4 — Public-Facing** | 2 weeks | 7.5 weeks | Landing page, testimonials, onboarding, booking widget |
| **5 — AI Features** | 1 week | 8.5 weeks | AI chatbot, occupancy predictions, smart search |
| **6 — Distribution** | 1 week | 9.5 weeks | Demo, referrals, docs, directory |
| **7 — Advanced** | 3–6 months | — | OTA, proposals, mobile, HR fiscal, BA ESET |

**Total to competitive launch: ~10 weeks.**

---

## Execution Rules

1. **One page at a time.** Never refactor 20+ files in a single commit. Never trust `tsc` + `vite build` green light alone — visual regressions are invisible to the compiler.

2. **Visual diff before and after.** For every page change: screenshot the current state, make changes, screenshot the new state, compare side by side.

3. **Show Ismail before moving on.** After each page is done, verify in-browser together. Do not touch page 2 until page 1 is approved.

4. **Preserve existing functionality.** Never remove working features to "simplify." The user's rule: "do not do unnecessary redesigns or broad rewrites; change only what was requested."

5. **Build vertical slices.** Each task should produce a visible, testable improvement. No "infrastructure" tasks that don't change the user experience.

6. **Dark mode always.** Every change must work in both light and dark mode. Test both.

7. **i18n always.** New strings must have BS + EN keys. Never hardcode text.

---

## First Task: Phase 0.1

Start by taking screenshots of every current page. This gives us a baseline to compare against and identifies the worst-offending pages first.

**Action:** Open the admin panel, navigate to each route, capture light + dark screenshots. Save to `Travline/docs/ux-audit/screenshots/`.
