# Travline — Baseline Audit (Codex Task 000)

Audit date: 2026-08-31
Audit source: `origin/main` (commit `d18c6bb`)
Scope: repository baseline vs. `TRAVLINE_MASTER_ZAHTJEVI` (42 sections)

> This is a documentation-only task. No code changed.

---

## 0. Executive summary

The codebase is in a healthy, deployable state. Builds, tests, and CI are green. The core vertical slice described in section 42 of the master requirements is substantially implemented end-to-end: package → departure → reservation → passengers → groups → payments → rooming → seating → flight ops → documents/communication all have backend routes, frontend screens, migrations, and tests.

The remaining work clusters into **four clear buckets**:

1. **Smart Reservation Flow (section 10)** — the "key addition" in the master spec. The New Sale wizard exists and captures passengers, but it does not yet *adapt the form to the selected package* (progressive disclosure, flight-vs-bus travel-document logic, package-scoped hotels/room options/optional services).
2. **Golden dataset + agency demo accounts + onboarding** (sections 35–38) — not implemented as specified.
3. **Polish gaps** — ~71 hardcoded Bosnian strings that bypass i18n; 3 BS-only translation keys; no package variants model (section 30); no migration version-tracking RPC.
4. **Verification discipline** (section 39) — CI is complete, but live browser + Supabase parity checks are not yet a documented routine.

---

## 1. Baseline health (verified)

| Check | Result |
|---|---|
| API TypeScript build (`npm run build`) | ✅ PASS |
| API tests (`npm test`) | ✅ 297 passed / 35 files |
| Admin lint (`npm run lint`) | ✅ 0 errors / 50 warnings |
| Admin tests (`npm test`) | ✅ 111 passed / 16 files |
| Admin build (`npm run build`) | ✅ PASS (14.33s) |
| Migrations | 77 append-only `.sql` files |
| CI workflow (`.github/workflows/ci.yml`) | 6 jobs: lint-api, test-api, lint-admin, test-admin, migration-replay (Postgres 15), docker-build |
| GitHub parity | `main` == `origin/main`, 0 divergence |
| Supabase connection | ✅ live (`hacutwknfgufrqlgdiia.supabase.co`) |

---

## 2. Architecture invariants (verified)

- **API-first** — business mutations go through the Express 5 API. Verified: 55 route modules under `nmt-analytics-api/src/routes/`, all mounted with `authenticateToken`.
- **Tenant isolation** — every tenant-scoped route uses `requireOrgContext`. Routes without it are correctly public/internal only: `health`, `index`, `internal`, `public`, `publicFormsHandlers`, `signup`. No tenant route is missing org scoping.
- **Internal jobs protected** — `/internal/jobs/process-scheduled-campaigns` guarded by `SCHEDULED_CAMPAIGNS_CRON_SECRET` with `timingSafeEqual`.
- **Auth** — session/JWT protections intact; `DEV_BYPASS_AUTH` is `false` in prod configs.
- **Append-only migrations** — confirmed by naming convention and CI replay job.

---

## 3. Feature coverage matrix

Backend route modules present and complete (CRUD unless noted):

| Area | Route | Status |
|---|---|---|
| Packages | `packages.ts` | ✅ CRUD + export |
| Hotels (catalog) | `hotels.ts`, `packageHotels.ts` | ✅ |
| Package services | `packageServices.ts` | ✅ CRUD |
| Departures | `departures.ts` | ✅ |
| Reservations | `reservations.ts` | ✅ |
| Passengers | `departurePassengers.ts` | ✅ CRUD |
| Groups | `passengerGroups.ts` | ✅ CRUD + members |
| Rooming | `rooming.ts` | ✅ proposal + atomic apply (RPC) |
| Seating | `seats.ts` | ✅ auto-assign / group-assign / clear-all |
| Accommodation | `accommodation.ts` | ✅ buildings/floors/rooms + assign/move |
| Flights | `flights.ts` | ✅ CRUD + reorder + departure-scoped |
| Payments | `payments.ts` | ✅ CRUD + void/refund/dashboard |
| Installments | `installments.ts` | ✅ per reservation |
| Contracts | `contracts.ts` | ✅ CRUD + PDF |
| Receipts | `receipts.ts` | ✅ CRUD + refund + PDF |
| Documents | `documents.ts`, `departureDocuments.ts` | ✅ upload/download/generate/voucher + manifest/rooming-list PDFs |
| Communication | `communicationSend.ts` | ✅ recipients preview + send |
| Templates | `messageTemplates.ts` | ✅ CRUD + duplicate |
| Campaigns | `campaigns.ts` | ✅ CRUD + preview + schedule + send |
| Automations | `automationRules.ts` | ✅ CRUD + toggle + execution engine |
| Public Forms | `publicForms.ts` | ✅ CRUD + submissions + public slug |
| Inquiries | `inquiries.ts` | ✅ CRUD + role gating |
| Itineraries | `itineraries.ts` | ✅ CRUD + versions + items |

Frontend screens present: full route map (auth, portal, admin, operations, communication, settings), Communication Center with 6 tabs, DepartureDetail with 5 tabs + seat map + flights + accommodation, NewSaleWizard with passenger capture, GlobalSearch in header, Hub scopes.

---

## 4. Gaps vs. master requirements

### 4.1 Smart Reservation Flow (section 10) — the key remaining work

Currently the New Sale wizard (`NewSaleWizard.tsx`) captures passengers and can create a group, but the form is **static** — it does not adapt to the selected package/departure. Specifically missing:

- **10.1 Progressive disclosure** — no field visibility driven by package content; no "Fill in later" missing/incomplete marking.
- **10.2 Flight package travel docs** — passport number/expiry/issuing authority/DOB/nationality not auto-surfaced for flight departures.
- **10.3 Bus + international logic** — no structured `travel_requirements` (domestic/international + required document) on package/departure; no rule that international bus travel still requires passport fields.
- **10.4 Accommodation in New Sale** — hotels/room types are not filtered to the package's actual allotment; availability is not shown inline.
- **10.5 Optional services** — package-scoped optional services not auto-offered.
- **10.6** — the "understand what is being sold" goal is not met yet.

This is the single most important remaining functional item and aligns with the master's "KLJUČNI DODATAK" framing.

### 4.2 Golden dataset / demo accounts / onboarding (sections 35–38)

- **35 Golden E2E dataset** — not present. No deterministic `travline_golden_demo_2027` ownership marker, no Antalya/Istanbul/Dubai/Budva/Mostar fixtures.
- **36 Golden seed safety** — seed scripts exist (`seed.ts`, `seed_demo.ts`) but are not deterministic/idempotent-with-ownership-marker as specified.
- **37 Agency demo accounts** — no separate onboarding-ready empty tenants.
- **38 Onboarding standard** — not codified as an acceptance checklist.

### 4.3 Polish / correctness gaps

- **i18n parity** — 3 keys exist in BS only (`bookingsOverTime`, `exportData`, `unknownPackage`); ~71 hardcoded Bosnian literals in `.tsx` files (e.g. `Svi statusi`, `Preuzmi fakturu`, `Bez prijevoza`, `Broj osoba`) bypass the i18n layer.
- **Package variants (section 30)** — no variants/options model distinct from accommodation.
- **Migration version tracking** — no `schema_migrations` table or version RPC for parity checks.

### 4.4 Verification discipline (section 39)

- CI is complete and green.
- Live browser verification and Supabase parity are not yet a recorded routine (documentation says `NOT VERIFIED` until browser test, but there is no checklist artifact enforcing it).

---

## 5. Readiness to start master requirements

**Status: READY.**

The baseline is green, GitHub is the single source of truth, and Supabase is connected and usable. Recommended execution order, aligned to section 41 (`Razvojni redoslijed`) and the gaps above:

1. **Smart Reservation Flow (section 10)** — highest value, directly in the "KLJUČNI DODATAK".
2. Package variants (section 30) + travel-requirements model (10.3).
3. Golden dataset + seed safety + agency demo accounts + onboarding (35–38).
4. i18n parity sweep + hardcoded-string cleanup (section 32).
5. E2E hardening + verification routine (39, 42).

---

## 6. Known issues / intentionally deferred

- 50 admin lint warnings (exhaustive-deps) — non-blocking, pre-existing.
- Dev/test/bootstrap orgs present in the live Supabase org list (e.g. `demo-travel`, `elite-travel`) — data hygiene, not a security issue; clean up during golden-seed work.
- Chunk-size warnings on admin build — non-blocking.

## 7. 96-point evidence matrix (full coverage)

| ID | Area | Status | Evidence | User-visible gap | Recommended action |
|---|---|---|---|---|---|
| A1 | Create passenger | DONE | `departurePassengers.ts` POST + NewSaleWizard capture | — | — |
| A2 | Edit passenger | DONE | PATCH `/:id`; DepartureDetail doc editor + updateDeparturePassenger | — | — |
| A3 | Delete passenger | DONE | DELETE `/:id` | — | — |
| A4 | Delete→seat dependency | PARTIAL | delete route; `seat_number` null-safe; seat clear via seats.ts | No explicit move-seat-on-delete UX in UI | Verify seat reallocation on delete |
| A5 | Delete→group dependency | PARTIAL | group members FK; not auto-orphaning on delete | Deleted pax may leave orphan group member rows | Confirm FK ON DELETE behavior |
| A6 | Delete→rooming dependency | PARTIAL | accommodation assignments separate; no cascade | Orphan room assignment possible | Guard on delete |
| A7 | Customer↔reservation↔passenger | DONE | distinct tables/routes: `customers`, `reservations`, `departure_passengers` | — | — |
| A8 | Contextual traveler fields | MISSING | static form fields only (nationality/passport always) | Always shows doc fields regardless of trip type | Smart Reservation Flow (10.1–10.3) |
| A9 | Passenger→reservation nav | PARTIAL | DepartureDetail passengers tab; reservation link unconfirmed browser | — | Browser verify |
| A10 | Reservation→passenger nav | PARTIAL | ReservationDetail exists with detail screen | — | Browser verify |
| B11 | Package service combos | DONE | `packageServices.ts` CRUD; packageHotels; flights; transport_type | — | — |
| B12 | Services usable from UI | DONE | PackageDetail / editor modal + accommodation panel | — | — |
| B13 | Departure inherits defaults | DONE | departure creation + package→departure allotment flow | — | — |
| B14 | Departure override w/o package mutate | DONE | `departure_accommodation_allotments` migration; allotment panel overrides | — | — |
| B15 | Reservation snapshots | DONE | `quotation_snapshots` + `versioned_itineraries` migrations | — | — |
| C16 | Transport type modeled | DONE | `transport_type` on departures; `departure_flights`; `bus_seat_categories` | — | — |
| C17 | Bus/vehicle resource mgmt | MISSING | no dedicated `vehicles`/`fleet` table | No concrete bus/vehicle CRUD | Decide if needed (P2.4) |
| C18 | Vehicle capacity integration | PARTIAL | `capacity` + `transport_type` on departure; seat map uses it | No fleet-level resource management | — |
| C19 | Manual bus seating | DONE | `SeatMap.tsx` interactive + `seats.ts` endpoints | — | — |
| C20 | Automatic bus seating | DONE | POST `/seats/auto-assign` via `batch_update_seats_atomic` RPC | — | — |
| C21 | Keep groups together (seating) | DONE | POST `/seats/group-auto-assign/:groupId` + `seating_preference` | — | — |
| C22 | Split group visibility | PARTIAL | group colors + membership; split flag not strongly surfaced | Split state not prominent in UI | Verify UI flag |
| C23 | Flight ≠ bus seating | PARTIAL | flights separated; generic seat-map risk | Possible seat-map misuse on flight departures | Guard by transport_type |
| D24 | Group CRUD | DONE | `passengerGroups.ts` GET/POST/PATCH/DELETE | — | — |
| D25 | Add/remove members | DONE | POST/DELETE `/passenger-groups/:id/members` | — | — |
| D26 | Unassigned pax visible | DONE | DepartureDetail quickFilter `unseated`/`noRoom` | — | — |
| D27 | Group colors/identity/prefs | DONE | `autoColor()`; `seating_preference`; `accommodation_pref` | — | — |
| D28 | Cross-departure rejected | DONE | groups scoped by `departure_id` + `org_id` | — | — |
| D29 | Cross-org rejected | DONE | all group queries `.eq('org_id', orgId)` | — | — |
| D30 | Group→seating+rooming | DONE | seats + rooming read group `seating_preference`/members | — | — |
| E31 | Hotels reusable | DONE | `hotels.ts`, `packageHotels.ts` | — | — |
| E32 | Package hotel/room options | DONE | `package_hotels` + room options in package editor | — | — |
| E33 | Departure hotel allocation | DONE | `departure_accommodation_allotments` + panel UI | — | — |
| E34 | Room capacity enforced | DONE | room slot capacity + release migration; apply RPC validates | — | — |
| E35 | Manual room assignment | DONE | `accommodation.ts` assign/move endpoints | — | — |
| E36 | Unassigned traveler workflow | DONE | quickFilter `noRoom` | — | — |
| E37 | Move travelers between rooms | DONE | `/accommodation/assignments/:id/move` | — | — |
| E38 | Automatic rooming | DONE | `/departures/:id/rooming/proposal` → `apply` (atomic RPC) | — | — |
| E39 | Auto-rooming keeps groups | DONE | rooming algorithm reads group membership | — | — |
| E40 | Split-group rooming visible | PARTIAL | group identity retained in assignments; split not strongly surfaced | — | Verify UI |
| E41 | Full-room conflict semantics | PARTIAL | atomic RPC returns conflict detail | Verify 409 vs 500 on full room | Test full-room scenario |
| F42 | Flight CRUD workflow | DONE | `flights.ts` CRUD + FlightsPage + modal | — | — |
| F43 | Flights→package/departure | DONE | departure-scoped `/departures/:id/flights` + link/unlink | — | — |
| F44 | Flight doc capture | PARTIAL | passport/id_document fields on passenger | Not auto-surfaced for flight departures | Smart flow 10.2 |
| F45 | Passport authority/validity | PARTIAL | `id_document_expiry` + type; no issuing authority field | Missing `id_document_authority` | Add field (10.2) |
| F46 | Readiness missing-data signals | PARTIAL | `document_readiness` migration; quickFilter `docAttention` | Partial readiness UI | Wire full readiness dashboard |
| F47 | Expiry warning | PARTIAL | `document_readiness` supports it | UI warning not surfaced | Wire warning UI |
| F48 | Non-flight not burdened | MISSING | static form shows doc fields always | Inappropriate doc requirements on bus/domestic | Smart flow 10.1/10.3 |
| G49 | Manual communication | DONE | `communicationSend.ts` POST `/communication/send` | — | — |
| G50 | Org sender config | DONE | `emailSettings.ts`, `smsSettings.ts` | — | — |
| G51 | Email provider boundary | DONE | `lib/email` service + config | — | — |
| G52 | SMS provider boundary | DONE | `lib/sms` service | — | — |
| G53 | Templates | DONE | `messageTemplates.ts` CRUD + duplicate + TemplateEditorModal | — | — |
| G54 | Recipient resolution | DONE | `recipientResolver.ts` + `/communication/recipients/preview` | — | — |
| G55 | Recipient org scope | DONE | resolver + route under `requireOrgContext` | — | — |
| G56 | No cross-departure leak | DONE | resolution scoped to departure + org | — | — |
| G57 | Communication history | DONE | `communicationHistory.ts` + HistoryPanel | — | — |
| G58 | Campaigns | DONE | `campaigns.ts` CRUD + schedule + send + CampaignsTab | — | — |
| G59 | Automation/scheduling | DONE | `automationRules.ts` + `automationExecution.ts` + cron endpoint | — | — |
| G60 | SMS length/UX | PARTIAL | SMS provider present; length UX not confirmed | SMS char limit UI | Verify |
| G61 | CC BS/EN parity | PARTIAL | i18n present; 3 BS-only keys + hardcoded strings | Minor parity gaps | i18n sweep (section 32) |
| G62 | Context links to workflows | PARTIAL | history panel reachable from DepartureDetail | Partial deep-linking | Verify |
| H63 | Public Forms nav | DONE | `/settings/public-forms` route + sidebar | — | — |
| H64 | Staff manage forms | DONE | PublicForms page + builder | — | — |
| H65 | Copy/share link | DONE | public slug route; copy/share present | — | — |
| H66 | Permissions correct | DONE | role gating (`requireMinimumRole`) tested | — | — |
| H67 | Token→form/org server-side | DONE | `publicFormsHandlers.ts` resolves slug → `org_id` server-side | — | — |
| H68 | Submission handler wired | DONE | `/public/forms/:slug` POST → `submit_public_form` RPC | — | — |
| H69 | Submission→inquiry | DONE | submission storage + inquiry pipeline | — | — |
| H70 | No silent commercial objects | DONE | submit RPC creates submission only (not reservations) | — | — |
| H71 | Forms BS/EN | PARTIAL | i18n present; shared parity gaps with G61 | Minor | i18n sweep |
| I72 | Today/Needs Attention real data | PARTIAL | HomeHub + dashboard stats endpoint | Data freshness unverified | Verify dashboard |
| I73 | Upcoming departure warnings | PARTIAL | departure calendar view | Partial | Verify readiness |
| I74 | Balance/payment exceptions | PARTIAL | `payments/dashboard` endpoint | Partial | Wire exceptions on dashboard |
| I75 | Missing traveler/doc signals | PARTIAL | `document_readiness` + quickFilter | Not surfaced on dashboard | Wire signals |
| I76 | Unassigned group/seat/room signals | PARTIAL | quickFilter `unseated`/`noRoom` | Not surfaced on dashboard | Surface on dashboard |
| I77 | Quick-create actions | PARTIAL | NewSaleWizard present | Full workflow reachability unverified | Verify |
| I78 | Global search | PARTIAL | `GlobalSearch.tsx` component in AppHeader | Search depth unverified | Verify search scope |
| I79 | Capability-aware nav | DONE | `ModuleGuard` + plan-tier gating | — | — |
| I80 | Duplicate/legacy nav | PARTIAL | Hub scopes + direct routes coexist | Possible legacy duplication | Cleanup (P8.2) |
| I81 | Integrations page real | PARTIAL | Integrations page exists | Placeholder risk | Verify content |
| J82 | Hardcoded BS strings | PARTIAL | ~71 literals found (Svi statusi, Preuzmi fakturu, Bez prijevoza...) | Mixed-language UI | i18n sweep (section 32) |
| J83 | Hardcoded EN strings | PARTIAL | some EN literals (All Entities, Ignore column) | Mixed-language UI | i18n sweep |
| J84 | Translation key parity | PARTIAL | 3 BS-only keys (bookingsOverTime, exportData, unknownPackage) | Missing EN translations | Add EN keys |
| J85 | Mixed-language pages | PARTIAL | Reservations, SubAgents, AuditLogs, Payments, modals affected | Inconsistent locale | i18n sweep |
| J86 | No broad UI refactor needed | DONE | strings need localization, not structural overhaul | — | — |
| K87 | Auth login protections | DONE | P10.2 DONE/PROTECT; auth tests pass | — | — |
| K88 | No protected calls on public auth | DONE | public auth routes isolated | — | — |
| K89 | Full relationship chain traceable | DONE | all routes + migrations + tests present | — | — |
| K90 | Tenant boundary tests | DONE | role/RBAC tests + `requireOrgContext` coverage | — | — |
| K91 | Missing E2E flows | PARTIAL | no Playwright/Cypress suite | No browser E2E | Add E2E (sections 39/42) |
| K92 | Legacy NMT naming | PARTIAL | dirs `nmt-analytics-*`; production org `NMT Analytics` | Cosmetic, not behavioral | Rename only when safe |
| L93 | GitHub main source of truth | DONE | `main` == `origin/main`; Vercel/ZO are consumers | — | — |
| L94 | Vercel full-stack on main | DONE | `vercel.json` + `api/index.ts` + scripts all on main | — | — |
| L95 | Vercel independent of ZO | DONE | self-contained config (env in vercel.json, no ZO dependency) | — | — |
| L96 | Server env var names | DONE | `TRAVLINE_SUPABASE_URL/ANON/SERVICE_ROLE_KEY`, `ADMIN_URL`, `SCHEDULED_CAMPAIGNS_CRON_SECRET`, `DEV_BYPASS_AUTH` | — | — |

## 8. Main vs unmerged work

**On `main` (verified):**
- All 23 backend route areas listed in section 3
- Communication Center: 6 tabs (overview, send, campaigns, templates, history, automation)
- Automation rules CRUD + execution engine + cron endpoint
- Campaigns CRUD + schedule + send
- Vercel full-stack deployment (`vercel.json`, `api/index.ts`, scripts)
- 77 append-only migrations

**Stale origin branches (work already on main, safe to prune):**
- `feature/communication-automation` (origin) — automation engine + internal jobs route + campaign scheduling; already merged via the communication-center-2/final-polish merge.
- `infra/vercel-independent*` (origin, 3 branches) — Vercel deployment; already on main.

**Only in docs (no code evidence on main):**
- Package variants model (section 30 of master requirements)
- Golden dataset spec (section 35)
- Agency demo accounts spec (section 37)


---

## 9. Completion report

**Branch:** `audit/codex-baseline`
**Date:** 2026-08-31
**Implementation summary:** Documentation-only baseline audit of all 96 points against the master requirements (`TRAVLINE_MASTER_ZAHTJEVI`). No business code changed.

**Files changed:**
- `docs/audits/TRAVLINE_BASELINE_AUDIT.md` (new) — full 96-point evidence matrix + feature coverage + gap analysis + readiness assessment
- `docs/ROADMAP.md` — 28 status updates from VERIFY to evidence-based DONE/PARTIAL/MISSING/UNVERIFIED_RUNTIME

**Migrations:** None (audit only)

**API build/test:** tsc clean + 297 tests PASS (35 files)

**Admin lint/test/build:** 0 errors / 50 pre-existing lint warnings + 111 tests PASS + build PASS

**Docker/CI:** CI workflow covers migration-replay + Docker build on push to main

**Supabase:** Connected and verified (`hacutwknfgufrqlgdiia.supabase.co`)

**GitHub parity:** `main` == `origin/main` (0 ahead/behind). Zo workspace matches GitHub

**Unmerged work assessment:**
- `feature/communication-automation` — already on `main` via a prior merge
- `infra/vercel-independent*` (3 branches) — Vercel deployment already on `main`
- No dangling critical work; all branches are superseded-by-main or historical

**Known issues:**
- ~71 hardcoded Bosnian strings in `.tsx` files bypass the i18n layer
- 3 BS-only i18n keys without EN equivalents
- No browser E2E test suite (Playwright/Cypress)
- No golden seed dataset (sections 35–38 of master requirements)
- 50 pre-existing admin lint warnings (exhaustive-deps)

**Readiness for master requirements:** STARTING READY. No blocking cleanup needed. Recommended first task: Smart Reservation Flow (section 10 of master requirements).
