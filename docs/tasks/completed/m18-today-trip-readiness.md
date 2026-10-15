# M18 — Today / Trip Readiness Unified Operational Alerts

**Status:** COMPLETED  
**Priority:** P0  
**Branch:** `feature/today-trip-readiness`  
**Roadmap references:** M18 (Today / Trip Readiness), M06 (Operational Readiness), M12 (Bus Seating), M16 (Supplier Confirmations).

## 1. Goal

Turn real departure operational data into immediate, actionable readiness alerts in HomeHub and operational views. Consolidate operational checks into a single batched endpoint (`GET /api/departures/readiness-summary`) covering:
1. **Bus seating:** Unassigned passengers on bus departures (`unassignedSeats`).
2. **Rooming & accommodation:** Unassigned guests, split/partial passenger groups, and unconfigured accommodation.
3. **Travel documents:** Passports/IDs missing or expiring before departure/return.
4. **Flight operations:** Missing outbound/return flight itinerary configurations.
5. **Capacity warnings:** Departures with full or overbooked capacity.
6. **Supplier confirmations:** Outstanding unconfirmed cost items.

Every alert links directly to the exact destination workspace tab needed to resolve it.

## 2. Current problem

HomeHub previously attempted to compute operational alerts by issuing up to 18 individual waterfall requests across near departures on the client side (`getDeparture`, `getDeparturePassengers`, `generateRoomingProposal`), while `readiness-summary` was only used for supplier confirmations and was restricted to managers. Furthermore, `readiness-summary` omitted bus seat assignments (`unassignedSeats`), capacity stats (`capacity`, `booked`, `isCapacityFull`), and explicit accommodation configuration flags, causing missing signals for bus tour organizers and non-manager agents.

## 3. Required discovery before editing

- API route: `nmt-analytics-api/src/routes/departures.ts` (`GET /departures/readiness-summary`).
- Client API types: `nmt-analytics-admin/src/api/departures.ts` (`ReadinessDeparture`, `ReadinessSummary`).
- Dashboard page: `nmt-analytics-admin/src/pages/Hub/HomeHub.tsx`.
- Localization dictionaries: `nmt-analytics-admin/src/lib/i18n/bs.ts` and `en.ts`.

## 4. In scope

- Extend `GET /api/departures/readiness-summary` to query passenger `seat_number` and departure `capacity, booked`, returning:
  - `hasBusTransport` (boolean)
  - `unassignedSeats` (number)
  - `hasAccommodation` (boolean)
  - `accommodationConfigured` (boolean)
  - `capacity` (number)
  - `booked` (number)
  - `isCapacityFull` (boolean)
- Update `ReadinessDeparture` interface in `nmt-analytics-admin/src/api/departures.ts`.
- Add i18n keys in `bs.ts` and `en.ts`:
  - `alertSeatingUnassigned`: '{count} putnika nema dodijeljeno sjedište' / '{count} passengers need seat assignment'
  - `alertCapacityFull`: 'Kapacitet popunjen ({booked}/{capacity})' / 'Capacity full ({booked}/{capacity})'
- Refactor `HomeHub.tsx` to construct readiness alerts directly from `getReadinessSummary` for all operational roles with direct deep-linking tabs (`?tab=finance`, `?tab=hotels`, `?tab=passengers`, `?tab=overview`).
- Verification via unit/integration tests in API and Admin.

## 5. Out of scope

- Mechanical redesign of HomeHub visual components or card layouts.
- Destructive schema changes.

## 6. Domain rules

- Bus seating alerts only apply when `capabilities.hasBusTransport` is true.
- Travel document alerts only apply when `capabilities.needTravelDocuments` is true.
- Supplier confirmation issues remain server-side gated to roles with supplier/financial visibility (`canReadSuppliers`).
- Every alert must have an actionable `href` targeting the appropriate tab on the departure workspace.

## 7. Acceptance criteria

- [x] `GET /api/departures/readiness-summary` returns seating, accommodation, capacity, documents, flights, and supplier signals in a single call.
- [x] HomeHub displays unified readiness alerts with correct links for bus seating, accommodation, documents, flights, and suppliers.
- [x] 100% BS/EN language parity maintained across new alert keys.
- [x] API test suite passes (`npm test`).
- [x] Admin lint, test, and build pass (`npm run lint`, `npm test`, `npm run build`).

## 8. Required verification commands

```bash
cd nmt-analytics-api
npm test
npm run build

cd ../nmt-analytics-admin
npm run lint
npm test
npm run build
```
