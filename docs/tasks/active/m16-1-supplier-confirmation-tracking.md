# M16.1 — Supplier confirmation tracking on departure cost items

**Status:** ACTIVE
**Priority:** P1
**Branch:** `feature/m16-supplier-confirmations`
**Roadmap references:** `docs/ROADMAP.md` (M16 — Documents row "Supplier confirmations"; "Next work, in order" item 2 first slice), `docs/TRAVLINE_MASTER_PLAN_2_0.md` M16.

## 1. Goal

Agencies must see whether the services they sold are actually secured with suppliers. This task adds booking/confirmation status to every departure cost item, a request/note history, and per-departure summary visibility. When complete, staff can look at a departure and immediately identify which supplier services are still unconfirmed before the departure date.

## 2. Current problem

Confirmed current behavior:

- `suppliers` and `supplier_services` catalog tables/routes exist (`nmt-analytics-api/src/routes/suppliers.ts`).
- `departure_cost_items` records real supplier costs per departure (`departureProfitability.ts`) but has no confirmation state.
- No table, route or UI records whether a supplier has confirmed a booked service, and no history of requests/notes.

Required by Master Plan M16 scope: service booking/confirmation status, supplier requests/notes/history, departure readiness impact, bulk/summary visibility. Acceptance: staff can identify unconfirmed required services before departure.

## 3. Required discovery before editing

Done in this run:

- `nmt-analytics-api/src/routes/departureProfitability.ts` — cost item CRUD, `transformCostItem`, currency guard, manager role.
- `nmt-analytics-api/supabase/migrations/20260909141847_m14_3_departure_cost_items.sql` — schema, composite FKs, RLS, grants.
- `nmt-analytics-api/src/routes/suppliers.ts` — catalog scope (not confirmation tracking).
- Admin: `src/pages/DepartureDetail.tsx` finance tab cost-items section, `src/api/departures.ts`, i18n `en.ts`/`bs.ts` `departure.finance` keys, test patterns in `src/tests/departureProfitabilityApi.test.ts` and API-side `departureProfitabilityRoute.test.ts`.

## 4. In scope

- Append-only migration adding `confirmation_status` to `departure_cost_items` (`unconfirmed | requested | confirmed | cancelled`, default `unconfirmed`).
- Append-only `supplier_confirmation_events` history table (org-scoped, departure-scoped, cost-item-scoped, status + note + actor + timestamp) with RLS org isolation and service-role grants.
- API routes under `/departures/:departureId/…`:
  - `GET /departures/:departureId/supplier-confirmations` — per-departure confirmation board: items with supplier names + status, and status counts summary (`total`, `confirmed`, `requested`, `unconfirmed`, `cancelled`, `outstanding`, `ready`).
  - `POST /departures/:departureId/cost-items/:itemId/confirmation` — set a new confirmation status with optional note; appends a history event; audit-logged; org+departure+item scoped.
  - `GET /departures/:departureId/supplier-confirmation-events` — recent history, newest first.
- `departureProfitability` responses include `confirmationStatus` per cost item.
- Admin finance tab (DepartureDetail): per-item confirmation badge, status-update modal with optional note, and a confirmation summary line over the cost items list. BS/EN i18n parity.

## 5. Out of scope

- Supplier finance/payables (M20).
- Automatic external integrations (email/SMS to suppliers) — status is set manually.
- Changes to quotations, package costing (`package_cost_items`), or reservation add-ons.
- HomeHub readiness wiring (M18) — the summary endpoint prepares for it but no HomeHub change here.
- Any visual redesign beyond the cost items section.

## 6. Domain rules

- Confirmation status belongs to the departure cost item (the concrete booked service instance), not to the catalog `supplier_services` row.
- Statuses: `unconfirmed` (default, never booked-confirmed yet), `requested` (asked supplier), `confirmed` (supplier confirmed), `cancelled` (no longer needed).
- `outstanding = unconfirmed + requested`; a departure's supplier services are `ready` when no cost item is outstanding.
- Setting a status always appends an immutable event row (who, when, status, optional note). Events are never updated or deleted.
- Every read/write is org-scoped via `org_id` + departure/item id match; supplier names resolve only within the same org.
- Currency of the cost item is untouched by confirmation changes.
- Roles: manager (same as cost item CRUD and profitability view).

## 7. Acceptance

- Migration applies cleanly after existing migrations (replay).
- API tests: summary counts, status transition + event append, org isolation (foreign departure/item → 404), invalid status → 400, events ordering.
- `npm run build` + `npm test` green in API and admin.
- Admin finance tab shows per-item status and summary; BS/EN parity test green; visual check in dev preview.
- No regression in existing profitability tests.

## 8. Verification commands

API: `npm ci && npm run build && npm test` in `nmt-analytics-api`.
Admin: `npm ci && npm run lint && npm test && npm run build` in `nmt-analytics-admin`.
