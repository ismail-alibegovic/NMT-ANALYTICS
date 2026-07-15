# Travline — Comprehensive Plan to Final Product

**Date:** 2026-07-15  
**Status:** Working master plan. Every task here is grounded in the actual codebase state as of HEAD (`3c4ee55`) + the 5 uncommitted `20260715*` migrations.

---

## 0. Reading Order for the Next Agent

1. This document (`TRAVLINE_FINAL_PLAN.md`) — the sprint plan.
2. `AGENTS.md` § "Next: Resume Here" — current blockers and open decision.
3. `docs/TRAVLINE_IMPROVEMENT_PLAN.md` — original productization plan (source of truth for phasing).
4. `docs/archive/legacy-sql/001_init.sql` — root cause of the RLS recursion (only consult if you must touch `profiles`/`organizations` policies).

---

## 1. Foundations (Do These Before Anything Else)

### F-1. Apply the 5 uncommitted 20260715 migrations

All five already live in the DB per the AGENTS.md entry; do NOT reapply unless a fresh env requires it. Verify the live state instead:

```bash
# Verify column exists
curl -G "$SUPABASE_URL/rest/v1/organizations?select=id,plan&limit=3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE"
# Should return rows with plan='pro'
```

If a later session reports the recursion 500 again, re-apply `20260715020000` → `20260715020001` → `20260715020002` → `20260715020003` in order via the Supabase dashboard SQL editor (single statements — see AGENTS.md note about the WAF).

### F-2. Rotate the Supabase service_role key

The Phase 0 residual. Steps:
1. Supabase dashboard → Project Settings → API → "Reveal service_role key" → rotate / regenerate.
2. Update the Zo secret `TRAVLINE_SUPABASE_SERVICE_ROLE` in `/?t=settings&s=advanced`.
3. Restart the Travline service.
4. Confirm `/api/health` returns 200 with the new key.

**Owner action (Ismail):** rotate in dashboard. Done by you, not me.

### F-3. Stop the migration friction permanently

Write an apply-migrations script in this repo so future migrations don't depend on the WAF-blocked Management API path. Already one exists at `con_gYj1cT60liYymZPg/apply_migration.py` — promote a copy into `nmt-analytics-api/scripts/apply_migrations.py` with a brief usage README. This prevents the "migrations don't get applied" bug class.

---

## 2. Sprint 1 — Audit & Module Gating Completion (Workflow hygiene)

**Goal:** Every mutative backend route is audit-logged. Every premium module is gated on both backend (already done) and frontend. Clean demo debris out of the admin build.

**Effort estimate:** 2.5 days

### Sprint 1 tasks

#### 1.1 Audit log wrapping — 13 unmapped routes
The following route files have mutative handlers (`POST`/`PUT`/`PATCH`/`DELETE`) but no `auditLog` import. Add an `auditLog` wrapper to every mutative handler in each:

| Route file | Mutative handlers | Audit entity |
|---|---|---|
| `routes/emailSettings.ts` | 2 (POST/PATCH smtp config) | `email_settings` |
| `routes/notifications.ts` | 2 (mark as read, mark all) | `notification` |
| `routes/paylinks.ts` | 1 (POST generate link) | `paylink` |
| `routes/installments.ts` | 0 reads — verify, may be an alias for reservations/installments subroute | `installment` if applicable |
| `routes/documents.ts` | 4 (CRUD) | `document` |
| `routes/transactions.ts` | 3 | `transaction` |
| `routes/import.ts` | 2 (POST entity, dry-run) | `import` |
| `routes/public.ts` | 2 (POST reservation, hotel booking) | `public_reservation` |
| `routes/signup.ts` | 1 (POST /auth/signup) | `organization` |
| `routes/debug.ts` | 1 | debug — keep **unlogged** (dev-only, will be deleted in Sprint 1.5) |
| `routes/metrics.ts` | 0 | no audit needed (read-only diagnostics) |
| `routes/me.ts` | 0 | no audit needed (read-only) |
| `routes/health.ts` | 0 | no audit needed (read-only) |

**Pattern:** import `auditLog` from `middleware/auditLogger`, antwith one per mutation:
```ts
const auditXCreate = auditLog('CREATE', 'entity', undefined, (req) => req.body?.name);
router.post('/', authenticateToken, requireMinimumRole('agent'), auditXCreate, handler);
```

**Verify:** `grep -L "audit" nmt-analytics-api/src/routes/*.ts` after the work shows only `debug.ts`, `metrics.ts`, `me.ts`, `health.ts`, `index.ts` (no real mutative routes).

#### 1.2 Frontend module gating — `<ModuleGuard moduleKey="..." />`

The backend `requireModule()` middleware exists. The frontend has no equivalent. Customers on `trial` plan shouldn't see `analytics`, `sub_agents`, `hotels`, `excursions`, `waivers`, `proposals` in the sidebar.

**Deliverable:** new component `nmt-analytics-admin/src/components/auth/ModuleGuard.tsx`:
```tsx
// Reads org plan + org_modules from a new GET /auth/me response extension
export function ModuleGuard({ moduleKey, children, fallback = null }) {
  const { enabledModules } = useAuth();
  if (!enabledModules.includes(moduleKey)) return <>{fallback}</>;
  return <>{children}</>;
}
</> }
```

**Backend change:** extend `routes/me.ts` to return `enabled_modules` array (from `org_modules` where `enabled = true`). Frontend `AppContext` stores it.

**Apply ModuleGuard to:**
- Sidebar items: wrap each premium item (`Subagents`, `Ekskurzije`, `Hoteli`, `Waivers`, `CommissionRules`, `Reports`, `AI`)
- Route elements in `App.tsx` for the same pages (frontend route gate — backend already gates)

**Effort:** 0.5 day for the component + wiring, 0.5 day for sidebar filtering.

#### 1.3 Audit log viewer — already exists at `pages/admin/AuditLogs.tsx`

Verify it can filter by entity, action, user, date range. If filters are missing, add them — this is the compliance surface; it needs to be usable by an auditor.

**Effort:** 0.5 day (verification, may already be done).

#### 1.4 Remove demo debris (Faza 1 leftover)

Final cleanup items not fully done in the 2026-07-09 consolidation:

- `routes/debug.ts` — delete after audit log work completes (dev-only, was used for testing only)
- `components/common/GridShape.tsx` — template demo widget, not referenced in active routes
- Mock avatar images at `public/images/user/user-XX.jpg` — referenced nowhere; remove from build (keep in git for now in case an `Avatar` component uses one)
- `form/form-elements/` directory — legacy template form kit superseded by `form/Form.tsx` + `form/input/`. Audit references first; remove unused files.

**Verify before deletion:** `grep -r "<filename basename>" nmt-analytics-admin/src/**/*.{ts,tsx}` — no matches = safe to delete.

#### 1.5 API `npm audit` — uuid/exceljs

Two moderate vulnerabilities in `nmt-analytics-api`: `uuid < 11.1.1` via `exceljs`. Exceljs is used for XLSX export. Pin exceljs to a version that pulls a fixed `uuid`:

```bash
cd nmt-analytics-api
npm install exceljs@4.4.0  # check changelog — 4.4.0 ships uuid ^11
npm audit
```

If `exceljs` 4.4.0 has breaking changes, restrict imports to CSV-only via a runtime flag and remove exceljs temporarily.

**Effort:** 0.25 day.

**Sprint 1 deliverables:**
- ✅ All 11 real mutative routes audit-logged
- ✅ Frontend module gating works for trial vs pro vs full
- ✅ Audit log viewer usable for compliance
- ✅ Demo debris removed
- ✅ Zero API audit vulnerabilities

---

## 3. Sprint 2 — Real-Time Availability + Pricing Invoice (The "agent UX" win)

**Goal:** Agents see live seat availability. Customers browse departures with real-time capacity.

**Effort estimate:** 3 days

### Sprint 2 tasks

#### 2.1 `GET /api/availability/:departureId` — new route

**File:** `nmt-analytics-api/src/routes/availability.ts`

Returns:
```json
{
  "departure_id": "uuid",
  "capacity": 50,
  "booked": 23,
  "available": 27,
  "transport_type": "bus",
  "rooms": [
    { "hotel_id": "...", "hotel_name": "...", "room_type": "double", "total": 10, "allocated": 8, "available": 2 }
  ],
  "seats_occupied": ["1A", "1B", "2A"]
}
```

Backend reads from `reservations.confirmed_count` (RPC `reserve_capacity_atomic` already locks capacity). Add this as read-only — no new writes, just an aggregation query.

Register in `routes/index.ts`. Role gate: `requireMinimumRole('agent')`.

**Effort:** 0.5 day.

#### 2.2 Departure availability dashboard (frontend)

**File:** `nmt-analytics-admin/src/pages/DepartureAvailability.tsx` (new)

Color-coded departure cards:
- 🟢 green: ≥ 20% available
- 🟡 orange: 1–20% available
- 🔴 red: full

Pulls from `GET /departures` + `GET /availability/:id` in parallel. Replaces the current "booked/capacity" badge with a clickable card opening the seat map.

Add to sidebar under OPERACIJE → "Dostupnost" (BS) / "Availability" (EN). Wire i18n.

**Effort:** 1 day.

#### 2.3 Seat map integration into departure detail

The `SeatMap.tsx` component already exists (built 2026-07-11). Two issues to fix:

1. Seat map currently displays **only for `transport_type === 'bus'`**. Add a numeric grid fallback for `flight` (1A..3F) — already in the component, verify it works.
2. Public booking widget availability — verify the existing `GET /public/packages` and `POST /public/reservations` endpoints correctly decrement capacity. Trace through `reservations.ts` POST handler; it should call `reserve_capacity_atomic(departure_id, org_id, party_size)` and reject 409 on oversell. Verify by manually testing the public widget.

**Effort:** 1 day.

#### 2.4 Invoice PDF enhancement

Existing `/api/reservations/:id/invoice.pdf` generates invoices. Add:

- Multi-line items from `reservations.options` (variants, transport, hotel extras)
- Itemized totals (subtotal, VAT if applicable, grand total)
- Optional QR for payment link

**File:** `nmt-analytics-api/src/lib/pdfTemplateConfig.ts` + `pdfGenerator.ts` — extend `generateInvoicePDF` to consume `package_services` rows for line items.

**Effort:** 1 day.

**Sprint 2 deliverables:**
- ✅ Agents see live availability before booking
- ✅ Seat map works for both bus (visual) and flight (numeric grid)
- ✅ Invoices show itemized services
- ✅ Public booking widget respects capacity atomically

---

## 4. Sprint 3 — Customer Self-Service Portal (The "sellable" milestone)

**Goal:** Each external tenant signs up, signs in, and manages their own organization without admin access. This is the single biggest gap between "internal tool" and "sellable product."

**Effort estimate:** 5–6 days

### Sprint 3 tasks

#### 3.1 Portal layout & branding

**Files:**
- `nmt-analytics-admin/src/layout/PortalLayout.tsx` (new)
- `nmt-analytics-admin/src/components/portal/BrandingProvider.tsx` (new)

The portal is a separate React Router layout branch — NOT a separate React app. Reuses `AppContext`, `AuthService`, all existing API clients. Driven by `org_branding` — primary/accent colors, logo, display name. Existing branding is already wired into PDFs (done 2026-07-11); now wire it into the UI shell.

The portal auto-detects branding via `GET /settings/branding` on mount, applies CSS variables to `PortalLayout` root.

**Effort:** 1 day.

#### 3.2 Portal routes

| Route | Page | Purpose |
|---|---|---|
| `/portal/dashboard` | `pages/portal/Dashboard.tsx` | Org stats: active reservations, upcoming departures, pending payments |
| `/portal/packages` | `pages/portal/PortalPackages.tsx` | CRUD packages — role-gated to `director` |
| `/portal/departures` | `pages/portal/PortalDepartures.tsx` | CRUD departures + passenger manifest uploads |
| `/portal/reservations` | `pages/portal/PortalReservations.tsx` | Book passengers, manage payments |
| `/portal/customers` | `pages/portal/PortalCustomers.tsx` | Customer directory |
| `/portal/settings` | `pages/portal/PortalSettings.tsx` | Branding editor, SMTP config, eTurista credentials |

These pages reuse the existing API clients (`api/customers.ts`, `api/departures.ts`, etc.) — they're just lighter UI shells around the same data. NO new backend routes needed; existing routes are already `org_id`-scoped.

**Effort:** 3 days total (each page ~0.5 day).

#### 3.3 Role scoping within portal

The portal uses the same Supabase auth. A `director` sees everything in their org; an `agent` sees only their assigned reservations (`assigned_to`); a `viewer` is read-only.

Frontend already has `hasAccess()` helper and `AuthGuard`. Extend `AuthGuard` to also check `moduleKey` (from Sprint 1.2's `ModuleGuard`).

**Effort:** 0.5 day.

#### 3.4 Onboarding checklist UX

`OnboardingChecklist.tsx` exists (`components/common/`). Wire it to portal dashboard:

- Add first package ✓
- Schedule first departure ✓
- Configure SMTP (or skip) ✓
- Configure eTurista (RS) or fiscal provider ✓

Each item links to the relevant portal page. Polling `GET /onboarding/status` (exists) for completion.

**Effort:** 0.5 day.

**Sprint 3 deliverables:**
- ✅ Customer signs up → gets branded portal
- ✅ Full CRUD within their org via portal
- ✅ Onboarding checklist drives first-day setup
- ✅ Branding, role scoping, module gating all work in portal context
- ✅ **This is the "you can demo to customers" milestone.**

---

## 5. Sprint 4 — Stripe Billing (Optional, after first paying client)

**Goal:** Self-serve subscription payments. Only build once you have ≥ 5 paying clients to validate the plan.

**Effort estimate:** 2 days

### Sprint 4 tasks

#### 5.1 Stripe webhook route

**File:** `nmt-analytics-api/src/routes/stripeWebhook.ts` (new)

Subscribes to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Raw body parsing (signature verification requires the raw body — must mount BEFORE `express.json()`).

Save webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `/?t=settings&s=advanced`.

**Effort:** 0.5 day.

#### 5.2 Plan update endpoint

`POST /billing/subscribe` (director-only) — creates Checkout Session, returns URL. Frontend calls this from a "Nadogradi plan" / "Upgrade plan" button in Settings.

Updates `organizations.plan` + `organizations.subscription_status` + Stripe customer ID.

**Effort:** 0.5 day.

#### 5.3 Stripe Connect onboarding (space side)

Since Zo has native Stripe integration, prefer using the `create_stripe_product` tool for the catalog items. Per Ismail's direction: do NOT build a reseller dashboard, only basic billing for now.

**Effort:** 1 day (mostly manual Stripe dashboard setup + webhook wiring).

**Sprint 4 deliverables:**
- ✅ Tenants can subscribe to plans
- ✅ Webhooks update `organizations.plan` automatically
- ✅ Failed payments trigger email dunning (uses existing SMTP provider)

---

## 6. Sprint 5 — Quality & Cleanup

**Goal:** Production-grade confidence in the critical paths. No regressions in financial calculations, PDFs, or capacity logic.

**Effort estimate:** 2 days

### Sprint 5 tasks

#### 6.1 Test setup

**Watch out:** the admin `package.json` has no `test` script today. Choose: bring in Vitest (recommended, lightweight, Vite-native) or extend the existing `reservationPayments.test.ts` to run under a new test runner.

Decision: add Vitest to admin + a `test` script.

```json
"scripts": { "test": "vitest run" },
"devDependencies": { "vitest": "^1.0.0", "@testing-library/react": "^14.0.0" }
```

**Effort:** 0.5 day (config only).

#### 6.2 Critical path tests

Write integration tests for:

1. **Atomic capacity reservation** — `reserve_capacity_atomic(departure_id, org_id, party_size)`:
   - Successfully reserves when seats available
   - Returns error when oversold
   - Concurrent calls don't oversell (use a test loop)

2. **Installment calculation**:
   - Advance + final + refund totals reconcile
   - `remaining_after` field updates correctly

3. **PDF generation**:
   - Contract PDF renders with diacritics (ć č š ž đ)
   - Receipt PDF currency = `KM` (Bosnian Mark) — not `$`
   - Invoice PDF renders org branding colors

**Files:** `nmt-analytics-admin/src/tests/critical.test.tsx` (frontend), `nmt-analytics-api/src/tests/critical.test.ts` (API)

**Effort:** 1.5 days.

#### 6.3 Sentry monitoring

Add Sentry SDK to both packages. Surface silent failures per-tenant. Free tier is sufficient for early stage.

**File:** `nmt-analytics-api/src/middleware/sentry.ts` (new), `nmt-analytics-admin/src/lib/sentry.ts` (new). Environment variable `SENTRY_DSN` in `/?t=settings&s=advanced`.

**Effort:** 0.25 day.

#### 6.4 Cleanup dead code

- `routes/debug.ts` — delete
- `routes/doctor.ts` — delete if unused (was a diagnostic helper)
- `public/images/user/avatar-XX.jpg` — delete templates
- `bun.lock` already removed; verify no `.bun.lockb` lingered

**Effort:** 0.25 day.

**Sprint 5 deliverables:**
- ✅ Vitest runs in both packages
- ✅ Critical paths (capacity, installments, PDFs) have coverage
- ✅ Sentry captures errors
- ✅ Dead code removed

---

## 7. Optional / Strategic (Not in timeline)

These were in the original `TRAVLINE_IMPROVEMENT_PLAN.md` §5.3 but are deferred per Ismail's directive (message "Do not build yet: reseller dashboard, AI chatbot, bus visual seat map, mobile app, and Stripe billing [for first five clients]"):

| Feature | When to revisit |
|---|---|
| Reseller / affiliate dashboard | After ≥ 10 tenants; only if a customer asks |
| AI chatbot module | After live customers have pricing data to parse; scope narrowly — one format, one language, confidence flags |
| Bus visual seat map drag-and-drop | Currently click-assign; upgrade later if agents request visual editing |
| Mobile app | PWA or responsive portal; offline companion (`Vamoos`-style) is Phase 5+ |
| Stripe Connect for resellers | Manual invoicing suffices for first 5 clients per directive |
| Proposal builder | Stash exists (`BROKEN_wip_proposal_builder_...`); revisit only if individual luxury package customers want visual offers |
| KEPTA evidencija (RS) | Confirm legal applicability to BiH first |
| FBiH ESET fiscal adapter | Wait for sub-laws (target ~31.8.2027); interface slot ready in `src/lib/fiscal/` |

---

## 8. Timeline — Honest Estimate

| Sprint | Days | Cumulative | Milestone |
|---|---|---|---|
| Foundations (F-1 key rotation, F-3 migration script) | 0.5 | 0.5 | Production secure |
| **Sprint 1** — Audit + module gating + cleanup | 2.5 | 3 | Compliance-ready |
| **Sprint 2** — Availability + invoice items | 3 | 6 | Strong agent UX |
| **Sprint 3** — Customer self-service portal | 5.5 | 11.5 | **Sellable product** ✅ |
| Sprint 4 — Stripe billing (optional) | 2 | 13.5 | Monetizable |
| Sprint 5 — Quality + tests + Sentry | 2 | 15.5 | Production-grade |

**Realistic ranges (with buffer for debugging, iteration, Ismail review):**

| Outcome | Working days | Calendar weeks (5-day) |
|---|---|---|
| Minimum sellable (Foundations + Sprint 1 + Sprint 3 essentials) | ~8 | ~1.5 weeks |
| Sellable product with great agent UX (Sprints 1, 2, 3) | ~11 | ~2.2 weeks |
| Polished production-grade (everything above + Sprints 4 & 5) | ~15 | ~3 weeks |

### Your question: "How long to final project?"

- **Minimum demoable sellable:** ~1.5 weeks of focused daily work = ~8 working days. Time to first paying customer demo.
- **Full polished product (Stripe, tests, Sentry, cleanup):** ~3 weeks of focused daily work = ~15 working days. Time to production SaaS with billing and confidence.
- **Realistic with iteration buffer (visuals not matching spec first pass, debugging RLS recursions, etc.):** add ~40% → **2 weeks minimum, ~4–5 weeks polished**.

If you work on this full-time every day, you can demo to your first paying customer in **10–14 days** and have a polished production SaaS in **4–5 weeks**. If part-time (2 hours/evening), double those numbers.

---

## 9. Critical Risks (Non-technical)

1. **The migration friction.** Migrations not being applied because the management API is WAF-blocked. Mitigation: foundation task F-3 (write `apply_migrations.py` into the repo).
2. **Visual iterations.** Per Ismail's profile, work often needs 2–3 visual passes before it matches the spec. This adds time. Buffer ~30% per UI sprint.
3. **Supabase key rotation.** This is the one root-cause blocker waiting on Ismail (dashboard access). Until it's done, the production env is technically already rotated; the dashboard rotation is just hygiene.
4. **Scope creep from deferred features.** Customers may ask for AI chatbot or reseller dashboard before the platform is ready. Per directive: resist. Manual invoicing and basic portal first.

---

## 10. Decision Matrix — Which Sprint First?

**Recommended order:** F-1 → F-3 → Sprint 1 → Sprint 2 → Sprint 3 → Sprint 5 → Sprint 4.

Sprint 5 (tests/Sentry) before Sprint 4 (Stripe) — because Stripe is a sensitive financial path that needs test coverage before you ship it.

Sprint 4 (Stripe) is optional until you have 5 paying clients, so it's the last thing before considering the project "fully done."

**Anti-pattern to avoid:** Don't build the customer portal (Sprint 3) before fixing audit logging (Sprint 1). A compliance-gap with multiple tenants is worse than a compliance gap with one tenant.

---

## 11. Quick Reference — What's Already Done (Don't Rebuild)

| Done | Migrations | Files |
|---|---|---|
| Role hierarchy + backend gating (93 uses of `requireMinimumRole` across routes) | — | `middleware/requireRole.ts`, `requireOrgContext.ts` |
| Module gating on backend | `20260715010000` | `middleware/requireModule.ts` + `lib/planModules.ts` |
| Fiscal compliance layer | `20260710010000` | `lib/fiscal/{types,registry,index,eturista-provider,fiskalizacija-hr-provider}.ts` |
| eTurista + SSRF guard | `20260705010000` | `lib/eturistaClient.ts` |
| Sub-agent portal tokens | `20260712020000` | `routes/subAgentPortal.ts` |
| Partner-type commission rules | `20260712010000` | `routes/commissionRules.ts` |
| Passenger waivers | `20260711220000` | `routes/waivers.ts`, `pages/PublicSignWaiver.tsx` |
| Passengers PATCH + seat assignment | — | `routes/excursions.ts`, `components/operations/SeatMap.tsx` |
| PDF template editor | `20260711020000` | `pages/admin/PdfTemplateEditor.tsx` |
| Self-service signup + onboarding checklist | `20260711010000` | `routes/signup.ts`, `components/common/OnboardingChecklist.tsx` |
| Org branding wired into 4 PDF generators | `20260711010000` | `lib/orgBranding.ts` + 4 PDF routes |
| i18n BS/EN (~350 keys) | — | `lib/i18n/{bs,en,context}.tsx` |
| RLS recursion fix | `20260715020xx` (×4) | `get_my_org_id()` / `get_my_role()` |
| Tailwind i18n + dark mode + global ⌘K + sidebar navigation UX | — | Multiple |

Do not re-implement any of these. Reference the existing files when extending them.
