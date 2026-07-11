# Travline (renamed to Travline) — Project Index

## Architecture

nmt-analytics-api/    — Express + Supabase backend (TypeScript)
nmt-analytics-admin/  — React + Vite + Tailwind frontend

## Live URL

https://travline.zocomputer.io

## Auth Credentials

- director role: admin@nmt.ba (password in Zo Secrets: `TRAVLINE_DIRECTOR_PASS`)
- director role: ismail@nmt.ba (password in Zo Secrets: `TRAVLINE_DIRECTOR_PASS`)
- agent role:   agent@nmt.ba (password in Zo Secrets: `TRAVLINE_AGENT_PASS`)

Plaintext passwords are intentionally NOT written here. Rotate via Supabase Auth + update the Zo Secret.

## Completed Features

### Role System

- DB roles: super_admin, director, manager, agent, viewer
- Legacy admin→director, user→agent migrated live
- ROLE_HIERARCHY: viewer &lt; agent &lt; manager &lt; director &lt; super_admin
- Backend: requireRole + requireMinimumRole middleware on all sensitive routes
- Frontend: hasAccess() helper + AuthGuard route rules + sidebar minRole filtering

### Notifications System

- DB: notifications table with RLS, indexes, CHECK constraints
- Backend: full CRUD API + auto-generation on reservation create / payment received
- Frontend: NotificationDropdown with unread badge, mark-as-read, live polling

### TuristAgent Adoption — Phase A (DONE 2026-07-04)

- Contracts (DB 028, /api/contracts, /operations/contracts) — auto-number UG-YYYY-XXXX, PDF, sign, retry-on-collision
- Calendar (/api/calendar?month=YYYY-MM, /operations/calendar) — read-only departures view
- Receipts (DB 029, /api/receipts, /operations/receipts) — FR-YYYY-XXXX, advance/final/refund, PDF, retry-on-collision
- Voucher enhancement (DB 027) — hotel_name/room_type/check_in/check_out/tour_guide; voucher PDF renders them
- Installments (DB 030, /api/reservations/:id/installments) — schedule + summary + overdue count

Cross-cutting:

- Unicode PDF fonts (DejaVu) shared lib at src/lib/pdfFonts.ts — fixes diacritics (ć č š ž đ) across all PDFs
- New sidebar section "Operacije" with role-gating (agent/manager)
- i18n bs/en updated (nav + operations blocks)
- AuditEntity union extended: contract, receipt, subagent, excursion, hotel, eturista
- All Phase B pages registered in App.tsx + sidebar with minRole manager

PDF samples: Travline/\_samples/

### TuristAgent Adoption — Phase B (DONE 2026-07-05)

- Hotels (DB 034, /api/hotels, /operations/hotels) — full CRUD with room types (single/double/triple/apartment), allocation matrix per departure, public rooms endpoint
- Package Services (DB 033, /api/package-services) — multi-service line items (hotel/transport/tour/insurance/extra) for complex arrangements
- Sub-agents (DB 031, /api/subagents, /operations/subagents) — sub-agent network management with atomic "Generate Sale" (creates reservation + contract + receipt + PDF bundle)
- Excursions (DB 032, /api/excursions, /operations/excursions) — per-passenger tracking, bulk import, bus list PDF, ruming list PDF, single passenger add/delete

Cross-cutting:

- Sidebar Phase B items (Sub-agents, Excursions, Hotels) under Operations, manager+ with role-based filtering
- App.tsx lazy routes for /operations/subagents, /operations/excursions, /operations/hotels
- Fixed bugs: excursions route missing POST/DELETE endpoints, missing org_id on excursion_passengers/hotel_rooms/hotel_allocations tables, broken import path in subagents.ts, list response bug in hotels.ts
- Fix migrations: 032b_fix_excursion_org_id.sql, 034b_fix_hotel_org_id.sql (applied live to Supabase)

### TuristAgent Adoption — Phase C (DONE 2026-07-05)

- eTurista Integration (DB 035, /api/integrations/eturista) — auto-submits guest data to government CIS system; XML/JSON payload generation from reservations; configurable endpoint per org; submission history & status tracking
- Public Booking Widget — already existed (embeddable HTML with package + departure selection + reservation form). Upgraded with hotel room booking endpoint POST /api/public/hotel-bookings (real-time availability via hotel_rooms.available)

Cross-cutting:

- eTurista card added to Integrations page (CIS / eTurista) with submission history table
- Org_settings store: eturista_endpoint, eturista_credentials
- AuditEntity union extended with eturista_submission

### UI/UX Polish Pass (2026-07-05)

- `PageToolbar` now supports `hideSearch` (optional searchValue/onSearchChange). Non-searching ops pages no longer render a dead search box.
- SubAgents/Hotels/Excursions/Contracts/Receipts: removed duplicate `PageBreadCrumb` (was redundant with `PageToolbar`).
- SubAgents: fixed `getSubAgents` API client (`return data || []` returned the list envelope object, so `length` was always undefined and the page showed DataTable's generic "No data found" instead of the proper EmptyState). Now unwraps `.data.data`. Added summary stat cards.
- Excursions: reservation selector always visible (was hidden once selected). Added client-side search via `useMemo`, summary cards (passengers/paid/debt).
- Contracts: added status filter dropdown (draft/signed/cancelled); wired to `?status=` API param.
- Receipts: added type filter dropdown (advance/final/refund).
- Calendar: legend strip (Slobodno / &lt;50% slobodno / Popunjano), grouped nav control.
- Hotels: room types count + first available badge shown inline in table.
- Frontend consistency: Hotels/Excursions now use typed API clients (`getDepartures`/`getReservations`) instead of raw `fetch()`; Dashboard uses `useNavigate` instead of `window.location.href`; Dashboard currency switched from `$` to `KM` (consistent with `formatCurrency`).
- i18n: added `hotels`, `subagents`, `excursions` keys to `file en.ts`/`file bs.ts`; Contracts/Receipts/Hotels/SubAgents/Excursions wired to i18n (`useT()`) — verified both BS and EN render correctly.
- Backend: added Express SPA fallback middleware (Express 5 — `app.use` middleware form, not `'*'` glob) so all client routes work on hard refresh / direct navigation (was 404 before).

### Dashboard Role Gating

- Agent/Viewer: only Bookings, Customers, Cancel Rate + bookings chart
- Manager+: full financial (Revenue, Avg Booking, Revenue Trend chart)

### "My Clients" (assigned_to)

- assigned_to column on reservations (migration 021)
- Auto-assigns logged-in user on reservation create (via RPC patch)
- ?assignedOnly=true filter for agents
- "Moji Klijenti" toggle in Reservations page

### Invoice PDF

- generateInvoicePDF() with org letterhead, line items, totals, QR
- route: GET /api/reservations/:id/invoice.pdf (manager+)
- "Faktura" button in Reservations table (visible to manager+)

### SMTP Email

- SmtpProvider + MockEmailProvider with runtime switching
- POST /settings/email + POST /settings/email/test (director+)
- Saved per-org in org_settings table, activated live on save

### Departure Reminders

- DB function notify_upcoming_departures() for T+1 check
- Scheduled agent runs daily at 8 AM

### Public Booking Widget API

- GET /api/public/packages — public packages listing
- POST /api/public/reservations — public reservation create
- No auth required; org-scoped via slug

### Route-Level Role Gating

- packages.ts, departures.ts, customers.ts: requireMinimumRole('agent')
- admin.ts: requireMinimumRole('director')
- payments.ts: requireMinimumRole('manager') on POST/PATCH/DELETE

### AI Assistant — Occupancy Predictions

- GET /ai/occupancy — predicts departure fill rate
- GET /ai/recommend — recommends top packages
- GET /ai/revenue-down — period-over-period revenue comparison

### Short Payment Links

- GET /paylinks/:code — public redirect to payment page
- POST /paylinks — generate short code (manager+)
- DB table: payment_links with 8-char nanoid codes

### Import/Export

- POST /api/import/:entity — CSV/XLSX import with mapping UI
- GET /api/export/all.zip — full org data export as ZIP
- Frontend ImportModal with column mapping, preview, dry-run

### Backend Hardening Pass (2026-07-05)

- **eTurista SSRF guard** (`file eturistaClient.ts`): `submitToEturista` now resolves the configured endpoint URL through `validateEturistaEndpoint()` — rejects non-http(s) schemes, userinfo (embedded creds), and hostnames that resolve to private/loopback ranges (RFC1918, RFC4193, 169.254/16 link-local, 127/8). Squelches the metadata-service / localhost exploit path. Public hostnames on standard ports are allowed; failures throw a descriptive error that bubbles up as the existing 502 response.
- **Ruming-list route fix** (`file excursions.ts`): route previously asserted `hotel_allocations.departure_id = :id` while the front-end (and bus-list) passes a reservation UUID — so ruming-list always returned empty. The handler now resolves `departure_id` from the reservation first (reservations → departures), then queries allocations by departure_id, returning a real PDF.

### Sidebar Restructure (NEW 2026-07-06)

Old flat sidebar (16 items in 3 sections "MENI/OPERACIJE/SISTEM") reorganized into 4 logical groups:

- **PRODAJA** ( sales flow): Dashboard, Klijenti, Paketi, Rezervacije, Polasci
- **OPERACIJE**: Kalendar, Ugovori, Računi, Subagenti, Ekskurzije, Hoteli
- **FINANSIJE**: Plaćanja, Fakturisanje, Izvještaji, Integracije
- **SISTEM**: Audit zapisi, Dokumenti

### Departure Detail Page (NEW 2026-07-06)

New route `/departures/:id` (file: `file nmt-analytics-admin/src/pages/DepartureDetail.tsx`). Single-screen context for every departure:

- 4 tabs: Pregled (overview + summary stats), Putnici (full manifest table), Grupe (groups by hotel/agent), Hoteli (rooms by hotel)
- Backend endpoints:
  - `GET /api/departures/:id` — base departure + package
  - `GET /api/departures/:id/passengers` — full guest manifest (reservations + excursion_passengers + payments + customer + agent)
  - `GET /api/departures/:id/groups` — aggregated groups (`{ byHotel, byHa`)

### Schema Quirks Found (2026-07-06)

When writing Supabase queries, use only columns that actually exist on the live DB:

- `payments` columns: `id, reservation_id, amount, payment_date, created_at, org_id, currency, status, provider, payment_method, refund_reason, refunded_at, installment_number, due_date, remaining_after` — NO `type`, `method`, `occurred_at`, `note`
- `reservations` columns: standard set + `hotel_name, room_type, check_in, check_out, tour_guide, assigned_to` — NO `customer_email` (use joined `customers.email`)
- `hotels` columns: `id, name` — NO `stars` column
- FK aliases: `customers!reservations_customer_id_fkey` works; `profiles:assigned_to!reservations_assigned_to_fkey` does NOT (assigned_to is a plain UUID with no FK constraint — fetch agent names separately)
- PostgREST schema cache may be stale after migrations: `excursion_passengers` table exists on DB but PostgREST returned PGRST205 until cache reloaded (workaround: read by primary query only, no complex join with that relation)

## Security

- Helmet security headers (CSP disabled for SPA)
- CORS verified — allows zo.computer/zo.space origins
- Rate limiting: authRateLimit (60/min), strictRateLimit (10/15min)
- JWT authentication via Supabase
- Zod validation on all request bodies
- Global error handler with structured responses

## Live Supabase

- Project ref: hacutwknfgufrqlgdiia
- Org: d9c9c298-9c09-4b0e-a91c-483758431d74 (NMT Analytics)

## Useful Paths

- DB migrations (LIVE — sole source of truth): `nmt-analytics-api/supabase/migrations/` (Supabase CLI timestamp format). Never write to `supabase/sql/` or `docs/sql/` — those are archived in `docs/archive/legacy-sql/`.
- Role types: src/types/roles.ts (both api + admin)
- Notifications API: src/routes/notifications.ts
- AuthGuard: admin/src/components/auth/AuthGuard.tsx
- Import routes: src/routes/import.ts
- Export routes: src/routes/export.ts
- Financial truth docs (MUST READ before touching payments): `file docs/archive/nmt-analytics-api/FINANCIAL_TRUTH_FIELDS.md`, `file docs/archive/nmt-analytics-admin/PAYMENT_CORRECTION_FLOWS.md`

### Contextual Sidebar (NEW 2026-07-06)

The sidebar is now hidden on the hub/homepage routes and only appears once
the user enters a section. The visible sidebar items match the active
section's group, not the full nav tree:

- `/`, `/home`            → NO sidebar (clean hub view)
- `/sales` + sales pages  → SALES group (Dashboard, Klijenti, Paketi, Rezervacije, Polasci)
- `/operations*`          → OPERACIJE group (Kalendar, Ugovori, Računi, Subagenti, Ekskurzije, Hoteli)
- `/payments`, `/reports`, `/integrations`, `/reservations` → FINANSIJE group
- `/admin/*`              → SISTEM group (Audit zapisi, Dokumenti)

Implementation:

- `SidebarContext` exports `activeScope` + `setActiveScope` + `scopeFromPath(pathname)` that
  maps a route to one of 'sales' | 'operations' | 'finance' | 'admin' | null.
- `AppLayout` syncs `activeScope` from `useLocation()` and conditionally renders
  `<AppSidebar/>` + `<Backdrop/>` (left margin reset to 0 on the hub).
- `AppSidebar` early-returns null when `activeScope === null`, and otherwise only renders
  the items belonging to the active scope (each scope gets its own `*Items` array; all
  arrays include a 'Home' link back to `/home`).
- `AppHeader` hamburger toggle is hidden on the hub (`activeScope === null`).

Deployed live on https://travline-sprypine.zocomputer.io (verified both hub and a section).

### Nova Prodaja Wizard (DONE 2026-07-06)

5-step reservation creation flow replacing `CreateReservationModal`. Triggered by the
"+ Nova rezervacija" button on `/reservations`. File: `file admin/src/components/reservations/NewSaleWizard.tsx`.

Steps: Aranžman (package card picker) → Termin (departure card picker, capacity badge, transport type) → Varijante (optional package variants grid + Prijevoz dropdown + Tip smještaja dropdown) → Klijent (existing-customer search + new-customer fields + party size + total + notes) → Pregled (review summary → "Potvrdi prodaju").

Backend support (migrations 036 + 037, applied live):

- `packages.transport_type`, `transport_capacity`, `variants` (jsonb array)
- `departures.transport_type` ('bus'|'flight'|'none')
- `package_services.hotel_id`, `room_type`, `option_key`
- `reservations.options` (jsonb), `notes`, `package_option_id`, `transport_type`, `excursion_ids`
- `reserve_capacity_atomic(departure_id, org_id, party_size)` RPC — oversell-safe, used by POST /reservations when status='confirmed'

Schema Migration files: `file supabase/sql/036_package_options_and_transport.sql`, `file supabase/sql/037_reservation_options.sql` (also in `supabase/migrations/20260706010000_*` / `20260706020000_*`).

Backend dev-mode note: when `DEV_BYPASS_AUTH=true` and `req.user.id` is the stub `00000000-...-000000` UUID, `POST /api/reservations` writes `assigned_to = NULL` (since the stub is not in `auth.users`). In production with a real JWT, `assigned_to` falls back to `req.user.id` as before. Do not let `assigned_to` be the stub UUID — it fails the FK to `users`.

Verified end-to-end on https://travline-sprypine.zocomputer.io — full wizard renders, creates reservation with options/notes/hotel_name preserved.

### Faza 1 — Konsolidacija i čišćenje (DONE 2026-07-09)

- **DB migrations consolidated:** 59 legacy SQL files (`supabase/sql/` + `docs/sql/`) archived to `docs/archive/legacy-sql/`. `nmt-analytics-api/supabase/migrations/` is now the sole source of truth (14 live migrations untouched).
- **Dead code removed:** `nmt-analytics-api/src/routes/public.ts.bak` (tracked but orphaned), `file nmt-analytics-admin/src/tests/reservationPayments.test.js` (duplicate of `file .ts`), two root-level `file reseed_2026*.ts` files (contained leaked Supabase service_role key — moved to `nmt-analytics-api/scripts/archive/`, gitignored via `.gitignore` `scripts/archive/` pattern).
- **Package manager:** `bun.lock` files removed from both packages (npm is canonical per CI).
- **Docs consolidated:** 75+ `file .md` files archived to `docs/archive/` by package. Only `file AGENTS.md` remains active.
- **Template debris removed:** 6 unreferenced ecommerce components (`DemographicCard`, `EcommerceMetrics`, `MonthlySalesChart`, `MonthlyTarget`, `RecentOrders`, `StatisticsChart`) + 2 unused SVG icons (`file task-icon.svg`, `file chat.svg`) + their exports.
- **Security (partial):** Plaintext demo passwords removed from `file AGENTS.md` (now references Zo Secrets `TRAVLINE_DIRECTOR_PASS`/`TRAVLINE_AGENT_PASS`). `.gitignore` updated with `.env*.local` pattern in `nmt-analytics-api/`. Leaked service_role key removed from working tree (history scrub pending — `git filter-repo` or BFG, deferred until Supabase key rotation).
- **Build verified:** `tsc --noEmit` passes for both `nmt-analytics-api` and `nmt-analytics-admin`. `vite build` passes.

### Fiscal Compliance Layer (DONE 2026-07-10)

Abstract fiscal compliance provider interface at `nmt-analytics-api/src/lib/fiscal/`:

- `file types.ts` — `FiscalProvider` interface, `FiscalMarket` type (`RS`|`HR`|`BA`), shared types
- `file registry.ts` — `FiscalRegistry` class with provider registration + `getForOrg(orgId)` (reads org_settings.fiscal_market)
- `file index.ts` — re-exports `fiscalRegistry`
- `file eturista-provider.ts` — RS adapter (refactored from `file eturistaClient.ts`, reads key-value org_settings, SSRF guard preserved)
- `file fiskalizacija-hr-provider.ts` — HR adapter stub (ready for HR Fiskalizacija 2.0 implementation)

Migration `file supabase/migrations/20260710010000_fiscal_compliance_layer.sql` (applied live):

- `org_settings.fiscal_market` (text\[\]) + `hr_fiscal_endpoint`/`hr_fiscal_cert` columns
- `fiscal_submissions` table (unified `org_id`+`market`-scoped submission log with RLS)
- Backward-compat view `eturista_submissions_view` for old eturista_submissions references

Routes updated: `file nmt-analytics-api/src/routes/eturista.ts` — uses registry with legacy fallback, writes to `fiscal_submissions`
Entry

echo "Done"

### Fiscal Compliance Layer (DONE 2026-07-10)

Abstract fiscal compliance provider interface at :

- —  interface,  type (RS|HR|BA), shared types
- —  class with provider registration +  (reads org_settings.fiscal_market)
- — re-exports
- — RS adapter (refactored from , reads key-value org_settings, SSRF guard preserved)
- — HR adapter stub (ready for HR Fiskalizacija 2.0 implementation)

Migration  (applied live):

- (text\[\]) + / columns
- table (unified org_id+market-scoped submission log with RLS)
- Backward-compat view  for old eturista_submissions references

Routes updated:  — uses registry with legacy fallback, writes to

### Fiscal Compliance Layer (DONE 2026-07-10)

Abstract fiscal compliance provider interface at `nmt-analytics-api/src/lib/fiscal/`:

- `file types.ts` — FiscalProvider interface, FiscalMarket type (RS|HR|BA), shared types
- `file registry.ts` — FiscalRegistry class with provider registration + getForOrg(orgId)
- `file index.ts` — re-exports fiscalRegistry
- `file eturista-provider.ts` — RS adapter (refactored, reads key-value org_settings, SSRF guard preserved)
- `file fiskalizacija-hr-provider.ts` — HR adapter stub (ready for HR Fiskalizacija 2.0)

Migration `file 20260710010000_fiscal_compliance_layer.sql` (applied live):

- org_settings.fiscal_market + hr_fiscal_endpoint/hr_fiscal_cert columns
- fiscal_submissions table (unified org-scoped submission log, RLS)
- Backward-compat view eturista_submissions_view

Routes updated: `file nmt-analytics-api/src/routes/eturista.ts` — uses registry with legacy fallback

## Improvement Plan Progress (2026-07-11)

### Phase 0 — Security (DONE 2026-07-11)

- **Git history scrubbed:** Leaked Supabase `service_role` JWT key removed from ALL git history via `git filter-repo` (was in `reseed_2026.ts` / `reseed_2026_v2.ts` → now `REDACTED_SUPABASE_SERVICE_ROLE_KEY`). Force-pushed to origin.
- **Key rotation:** Supabase service_role key must be rotated in dashboard (see `docs/TRAVLINE_IMPROVEMENT_PLAN.md` Phase 0). Until rotated, the old key is still valid even though it's no longer in git.
- `.env.example` files contain only placeholders, no real keys.
- Auth credentials in `AGENTS.md` reference Zo Secrets, not plaintext.

### Phase 1 — Consolidation & Self-Service Signup (PARTIALLY DONE 2026-07-11)

Previously completed (2026-07-09): DB migration consolidation, dead code removal, template debris removal, docs archive.

New (2026-07-11):

- **DB migration `20260711010000_self_service_signup.sql`:** `handle_new_user()` trigger on `auth.users` → auto-creates `organizations` row, `profiles` row (role='director'), default `org_modules`, and `org_branding` row. Slug auto-generated from org name.
- **`org_branding` table:** logo_url, brand_color, brand_color_secondary, custom_pdf_header, custom_pdf_footer — used by PDF generation routes.
- **API `POST /auth/signup`:** Validates org name, email, password → creates org → Supabase auth.signUp → trigger seeds everything. Returns session on success.
- **Frontend `SignUpForm.tsx`:** Wired to API with org name field, loading state, error handling, redirect to `/signin?registered=1` on success.
- **SignInForm:** Shows success banner when `?registered=1` param present.
- **i18n:** New keys `orgName`, `enterOrgName`, `signingUp` added to en.ts + bs.ts.