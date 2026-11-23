# Commercial P1 — Hotel allocation edit/operator reload and bus vehicle create/edit/reload integrity

**Status:** ACTIVE  
**Priority:** P0/P1 integrity and workflow reliability  
**Branch:** `fix/commercial-allocation-edit-and-transport-integrity` from verified `origin/main` (`43da03c`, PR #171 documentation checkpoint; latest application main `2432002`, PR #170).  
**Roadmap references:** `docs/TRAVLINE_FINAL_ROADMAP.md` (P0 transactional integrity, P1 existing hotel/inventory/transport workflows, P2 BS/EN parity for changed copy, P4 migration-order/preflight ledger); `docs/operations/commercial-workflow-coverage.md`.

## 1. Goal

Make departure hotel allocation editing (`PATCH /api/departures/:id/accommodation-allotments/:itemId` and `DepartureAccommodationAllotment` / `HotelDetail`) and departure bus vehicle configuration (`GET/PUT /api/departures/:departureId/vehicle` and `ManualBusSeating`) atomic, tenant-safe, auditable, fail-closed on read/migration failures, and consistent across save and reload in both Bosnian and English.

## 2. Confirmed current problems (reproduced before repair)

### A. Hotel allocation edit / operator → reload
1. **Non-atomic partial mutation on `ROOM_SLOT_OCCUPIED` (P0/P1 data integrity):** `updateDepartureAccommodationAllotment` updates `hotel_allocations.rooms_reserved` first and then calls `sync_departure_room_slots_atomic` in a second database statement. When reducing rooms fails with `ROOM_SLOT_OCCUPIED` (or any sync error), the reduced `rooms_reserved` remains committed while `departure_room_slots` keeps the old higher slot count, corrupting subsequent reloads and breaking `GET /api/departures/:id/room-slots`.
2. **Unserialized sold-room check:** `soldRooms` is checked in application code before updating `hotel_allocations` without holding a `FOR UPDATE` row lock against concurrent reservations.
3. **Weak validation & missing audit on allotment edit:** `PATCH /api/departures/:id/accommodation-allotments/:itemId` uses `z.coerce.number().int().min(0)` (coercing `""`/`null`/`false` to `0`, accepting unbounded counts and unknown keys), omits UUID validation on route params, and does not write an audit log entry.
4. **Operator UI gaps (`DepartureAccommodationAllotment.tsx`, `HotelDetail.tsx`):** Failed initial allotment read has no retry action; save conflicts (`ALLOTMENT_BELOW_RESERVED`, `ROOM_SLOT_OCCUPIED`) surface raw English backend text on Bosnian screens; same-tick double submit is not ref-locked; room input lacks accessible label and `max=1000` validation; money formatting hardcodes `bs-BA`; `HotelDetail.tsx` still truncates departure lookups at `limit=200` instead of using the counted `getAllocationDepartures()` helper from PR #170.

### B. Transport (bus vehicle) create / edit / reload
1. **Registration number cannot be cleared on edit:** `update_vehicle_atomic` uses `CASE WHEN p_registration_number IS NULL THEN registration_number ELSE p_registration_number END`, so clearing `registrationNumber` (`null` / `""`) silently retains the old plate in PostgreSQL while the UI shows an empty input until reload restores the old value.
2. **GET vs PUT seat-list reload mismatch & missing `org_id` seat filter:** `update_vehicle_atomic` returns only `is_active = true` seats, while `GET /api/departures/:departureId/vehicle` queries `departure_vehicle_seats` without `.eq('org_id', orgId)` and without `.eq('is_active', true)`, causing deactivated seats to reappear after reload when vehicle capacity is reduced.
3. **Validation & missing audit on vehicle PUT:** `PUT /api/departures/:departureId/vehicle` accepts whitespace-only `vehicleLabel` and unknown keys, skips UUID validation, and writes no audit log.
4. **Fail-open read error & form bugs (`ManualBusSeating.tsx`):** When `GET /api/departures/:departureId/vehicle` fails, `vehicle` stays `null` and the UI renders an editable blank "Configure Vehicle" form (fail-open) with no retry action and the wrong error message (`vehicleSaveFailed`). Vehicle save lacks a synchronous ref lock, `<fieldset disabled>`, integer `1..500` validation, success toast, and form synchronization from the saved response; vehicle save failures fall back to seat-assignment error copy (`assignError`); language changes re-trigger `loadVehicle` and discard unsaved drafts.

## 3. In scope

- Append-only migration `nmt-analytics-api/supabase/migrations/20261123120000_atomic_allotment_and_vehicle_integrity.sql`:
  - Service-only `SECURITY DEFINER SET search_path = ''` RPC `public.update_departure_accommodation_allotment_atomic(uuid, uuid, uuid, integer)` performing row-locked (`FOR UPDATE`) org/departure-scoped sold-room validation, allotment update, and `sync_departure_room_slots_atomic` inside a single PostgreSQL transaction (atomic rollback on any conflict/failure).
  - Updated `public.update_vehicle_atomic(uuid, uuid, text, text, int, text)` preserving the exact 6-argument signature and service-only ACL, pinning `SET search_path = ''`, rejecting blank labels and out-of-range capacities, and supporting explicit registration clearing via empty string `''` (while `NULL` preserves existing value for omitted-field compatibility).
- API route hardening in `nmt-analytics-api/src/routes/departures.ts` and `nmt-analytics-api/src/lib/departureAccommodation.ts`:
  - Fail closed with `503 MIGRATION_PENDING` if the atomic RPC is missing (`PGRST202` / `42883`); no non-atomic fallback.
  - Strict Zod validation, UUID route param checks, bounded counts (`0..1000` rooms, `1..500` seats), audit logging via `logAction`, and `org_id` + `is_active = true` filtering on `GET /api/departures/:departureId/vehicle`.
- Admin operator UI repairs:
  - `nmt-analytics-admin/src/components/departures/DepartureAccommodationAllotment.tsx`
  - `nmt-analytics-admin/src/pages/HotelDetail.tsx`
  - `nmt-analytics-admin/src/components/operations/ManualBusSeating.tsx`
  - BS/EN parity in `nmt-analytics-admin/src/lib/i18n/{bs,en}.ts` for all new/changed strings.
- Automated verification:
  - Reproduction and regression unit/HTTP tests in API and admin.
  - Rollback-only PostgreSQL contract script `nmt-analytics-api/scripts/allocation-vehicle-integrity.sql` wired into `migration-replay.sh` and `.github/workflows/staging-acceptance.yml`.
  - Real Chromium Playwright browser matrix (BS/EN × light/dark × 390/768/1440) for both allocation edit/operator reload and bus vehicle create/edit/reload.
  - Real-Auth isolated acceptance test `nmt-analytics-admin/e2e/pilot-allocation-vehicle-workflow.spec.ts`.
- Document the confirmed 2026-11-23 hosted Supabase migration gap (115 hosted vs 120→121 repo) and verifiable preflight / migration-order / recovery ledger without running hosted mutations.
- **P0 CI prerequisite addendum (`GHSA-mrwp-f3q8-3g9p`):** Surgical compatible lockfile resolution bump of `follow-redirects` `1.16.1` → `1.16.2` in `nmt-analytics-api/package-lock.json` and `nmt-analytics-admin/package-lock.json` (no other package changes, no major upgrades, no weakening of `npm audit --omit=dev --audit-level=high`).

## 4. Out of scope

- Applying any migration to hosted/production Supabase or modifying real agency data.
- Adding any fallback that bypasses transactional RPC integrity.
- Redesigning `DepartureDetail.tsx`, `Hotels.tsx`, `RoomingWorkspace.tsx`, or flight/seating algorithms.
- Activating SMTP/SMS/payment gateways or adding new roadmap modules.

## 5. Tenant and security acceptance

- Cross-org allotment edit and vehicle read/write return `404` and leave target-org rows unchanged.
- `GET /api/departures/:departureId/vehicle` explicitly scopes `departure_vehicle_seats` by `org_id`.
- Both RPCs have `SET search_path = ''`, `REVOKE ALL` from `PUBLIC, anon, authenticated`, and `GRANT EXECUTE` only to `service_role`.
- No secrets, `.env` values, or raw SQL diagnostics are returned to clients.

## 6. Acceptance criteria

- [x] Pre-repair defects reproduced via failing tests before source repairs (12/12 failing tests on `origin/main` `43da03c`).
- [x] Reducing an allotment when removed slots are occupied returns `409 ROOM_SLOT_OCCUPIED` and leaves `hotel_allocations.rooms_reserved` and `departure_room_slots` unchanged on reload (API + SQL contract + lock-verified two-session concurrency script; live PG17 execution queued for CI).
- [x] Reducing an allotment below active reserved rooms returns `409 ALLOTMENT_BELOW_RESERVED` and leaves database state unchanged.
- [x] Valid allotment edit persists, syncs room slots, writes an audit entry, and survives reload.
- [x] Vehicle create → edit (including clearing registration number and changing capacity) → reload persists exact values and active seats only, writes an audit entry, and enforces capacity/occupancy conflicts.
- [x] Failed initial reads for allotments and vehicles fail closed with localized alert + working retry button (never blank editable create form).
- [x] Failed saves preserve operator drafts, map error codes to localized BS/EN messages, dynamically re-localize visible conflict banners on live BS ↔ EN toggle without clearing drafts, and prevent same-tick duplicate submissions.
- [x] BS and EN dictionary parity and browser matrix (390/768/1440 × light/dark × BS/EN) pass with screenshot review.
- [x] Full API build/strict/tests and Admin lint/tests/build pass under official Node 24 LTS (host limitations noted honestly below).

## 7. Local verification checkpoint (Node 24.22.3)

- **Pre-repair reproduction:** 12/12 failing tests confirmed on `origin/main` `43da03c` (7 API + 5 admin).
- **Initial temporary host baseline (Node 26.13.1 — NOT final):** 121/122 API files (1,119/1,124 tests; 5 `productionEnvironment.test.ts` failures strictly due to Node 26 vs required Node 24 LTS); admin 76/76 files (575/575 tests with temporary `--no-webstorage` flag).
- **Final local verification under official Node 24 LTS (`v24.22.3`, SHA-256 verified in `/tmp/node24`) after clean `npm ci` (`follow-redirects@1.16.2`):**
  - Shell syntax checks (`bash -n allocation-slot-concurrency.sh` & `bash -n migration-replay.sh`): **PASS**
  - Clean `npm ci` + security audits:
    - API `npm ci` (`follow-redirects@1.16.2`): **PASS**; `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high`: **PASS (0 high/critical; 5 pre-existing moderate transitive advisories in `glob`/`minimatch` via `archiver@7.x` requiring breaking major `archiver@8.0.0`, intentionally untouched)**
    - Admin `npm ci` (`follow-redirects@1.16.2`): **PASS**; `npm audit --omit=dev --audit-level=high`: **PASS (0 vulnerabilities)**; `npm audit --audit-level=high`: **PASS (0 high/critical; 7 pre-existing moderate dev-only advisories in `minimatch` via `typescript-eslint`, intentionally untouched)**
  - API strict serverless `tsc --project ../tsconfig.json --noEmit`: **PASS**
  - API NodeNext `tsc --project ../tsconfig.json --noEmit --module NodeNext --moduleResolution NodeNext`: **PASS**
  - API `npm run build`: **PASS**
  - API `npm test`: **124/124 files, 1,139/1,139 tests PASS** (including `productionEnvironment.test.ts` 11/11, `allocationEditAndVehicleIntegrity.test.ts` 7/7, and `allocationSlotConcurrencyGuard.test.ts` 8/8 testing fail-closed host/DB/flag/URL guards, rejection of Docker bridge `172.x` server IPs, container-loopback identity, and CI workflow wiring)
  - Admin `npm run lint`: **0 errors, 50 warnings** (matching `main` baseline)
  - Admin `npm test`: **77/77 files, 581/581 tests PASS** (zero runtime workarounds; includes live BS ↔ EN conflict-banner re-localization + draft preservation in `allocationAndVehicleRecovery.test.tsx` 6/6)
  - Admin `npm run build`: **PASS**
  - Real Chromium Playwright matrix (`playwright.finance-forms.config.ts`): **36/36 PASS** (`allocation-vehicle.spec.ts` 12/12 including live BS ↔ EN toggle while `ROOM_SLOT_OCCUPIED` and `VEHICLE_CHANGE_CONFLICT` alerts are visible with preserved drafts + `hotel-allocation.spec.ts` 12/12 + `hotel-read.spec.ts` 12/12 across BS/EN × light/dark × 390/768/1440; `bs-dark-390` and `en-light-1440` screenshots reviewed)
- **Not executed locally (exact blockers):**
  - PostgreSQL 17 migration replay (`migration-replay.sh`), rollback SQL contract (`allocation-vehicle-integrity.sql`), live two-session PostgreSQL execution of `allocation-slot-concurrency.sh` (wired via `docker exec` inside disposable `$REPLAY_CONTAINER` in `.github/workflows/ci.yml` and `supabase_db_nmt-analytics-api` in `.github/workflows/staging-acceptance.yml` over each container's own `127.0.0.1:5432` loopback so `inet_server_addr()` remains strictly loopback without widening to `172.x`), and real-Auth isolated Supabase acceptance (`pilot-allocation-vehicle-workflow.spec.ts`): `docker` and `psql` are not installed on this local host; ready to run on GitHub CI once published via the user's GitHub connector.
  - Hosted Supabase migrations (115 hosted vs 120→121 repo; FREE plan with no backups): NOT applied and NOT authorized. See [hosted-migration-preflight-ledger.md](../../operations/hosted-migration-preflight-ledger.md).
