# M24 — Complete Business Scenarios

**Status:** ACTIVE  
**Priority:** P0  
**Branch:** `feature/complete-business-scenarios`  
**Roadmap references:** M13 (Flight Ops), M15 (Operational Documents), M19 (Inquiry → Quote → Booking), M20 (Supplier Payables), M24 (Complete E2E Business Scenarios).

## 1. Goal

Expand automated end-to-end business scenarios beyond the initial single bus sale pilot to prove the complete suite of Travline core operating flows:
1. **Flight group tour flow:** Flight package → departure with outbound and return flight segments → travelers with passport/travel documents → flight manifest data.
2. **Tailor-made / DMC flow:** Customer inquiry → itinerary creation with version & items → quotation snapshot & acceptance → quotation booking conversion → supplier cost item attachment & confirmation.
3. **Operational documents flow:** Authoritative generation of contracts, vouchers, and departure manifests.
4. **Cancellations, modifications & capacity release:** Reservation status cancellation releasing departure capacity; deletion protection for quotation-locked bookings; balance consistency and retry safety.

## 2. Current problem

The existing pilot suite primarily tested the bus tour New Sale path. Flight operations, tailor-made DMC quotation-to-supplier lifecycles, document generation (contracts, vouchers, manifests), and cancellation capacity releases require unified end-to-end automated scenario verification. Additionally, `GET /api/departures/:id/passengers` omitted traveler document fields (`id_document_type`, `id_document_number`, `id_document_expiry`, `nationality`, `date_of_birth`) from the returned manifest objects despite the query already selecting them.

## 3. Required discovery before editing

- API routes: `nmt-analytics-api/src/routes/flights.ts`, `departures.ts`, `reservations.ts`, `quotations.ts`, `itineraries.ts`, `inquiries.ts`, `contracts.ts`, `departureDocuments.ts`.
- Manifest endpoint: `nmt-analytics-api/src/routes/departures.ts` lines 1216–1248 (`manifest.push`).
- Capacity release: `reserveDepartureCapacityOrThrow`, `releaseReservedCapacity`, `reservationConsumesCapacity`.
- Test suites: `nmt-analytics-api/src/tests/`, `nmt-analytics-admin/e2e/`.

## 4. In scope

- Expose traveler document fields (`id_document_type`, `id_document_number`, `id_document_expiry`, `nationality`, `date_of_birth`) in `GET /api/departures/:id/passengers` manifest rows.
- Comprehensive end-to-end API scenario test suite (`nmt-analytics-api/src/tests/completeBusinessScenarios.test.ts`):
  - Flight group tour: flight segments attached to departure, passengers with passport/document records, manifest retrieval.
  - Tailor-made DMC lifecycle: inquiry creation, itinerary creation, quotation acceptance, quotation booking conversion, supplier cost confirmation.
  - Operational documents: contract generation, voucher PDF, manifest PDF.
  - Cancellation & capacity release: reservation confirmed consumes capacity; cancellation releases capacity; quotation-locked booking cannot be hard-deleted.
- Isolated Playwright E2E scenario suite (`nmt-analytics-admin/e2e/pilot-complete-scenarios.spec.ts`) validating complete business scenarios.

## 5. Out of scope

- Direct GDS/airline API integration (per M13 scope).
- Destructive database migrations (existing schema fully supports flight segments, quotations, inquiries, supplier payables, and documents).
- UI redesign of unrelated pages.

## 6. Domain rules

- Flight departures link outbound and return flight segments via `departure_flights`.
- Passenger entities (`departure_passengers`) hold identity document information required for flight manifests.
- Tailor-made quotation bookings create immutable snapshot records locked against manual total drift.
- Reservation cancellations (`cancelled` status) must release reserved capacity on the departure.
- Strict multi-tenant isolation: every query and mutation is scoped by `org_id`.

## 7. API requirements

- `GET /api/departures/:id/passengers`: include passenger document fields in manifest.
- Preserve all existing auth, role, and tenant guards.

## 8. Database / migration requirements

No schema changes needed. Existing migrations already provide all tables and foreign keys.

## 9. Frontend / UX requirements

- Maintain 100% BS/EN language parity on all user-facing screens.
- No regression on existing forms or layouts.

## 10. Tenant and security acceptance

- All queries and mutations validate authenticated organization context.
- Foreign tenant access returns 404 or 403.
- No credentials or secrets exposed in client bundles.

## 11. Acceptance criteria

- [ ] `GET /api/departures/:id/passengers` returns passport/document fields for passengers.
- [ ] Complete flight tour scenario tested end-to-end.
- [ ] Complete tailor-made DMC scenario tested end-to-end.
- [ ] Document generation (contracts, vouchers, manifests) verified.
- [ ] Cancellation and capacity release verified.
- [ ] API build and test suite pass cleanly.
- [ ] Admin lint, test, and build pass cleanly.

## 12. Required verification commands

```bash
cd nmt-analytics-api
npm ci
npm run build
npm test

cd ../nmt-analytics-admin
npm ci
npm run lint
npm test
npm run build
```
