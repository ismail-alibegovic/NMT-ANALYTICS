# M22 — Global Search & Capability-Aware Navigation

**Status:** COMPLETED  
**Priority:** P1  
**Branch:** `feature/m22-search-navigation`  
**Roadmap references:** Master Plan 2.0 §M22 (`docs/TRAVLINE_MASTER_PLAN_2_0.md`), §28/§32/§33

## 1. Goal

Make Travline fast and intuitive to operate without requiring staff to know database schemas or navigate through nested menus. When a staff member searches for any key business entity—a passenger by name or passport, a reservation, a departure, an arrangement package, a hotel, an inquiry, a quotation, or a supplier—Global Search quickly finds it and deep-links directly to its detail view. In parallel, audit the navigation layout to ensure work-based organization, complete capability-aware visibility (hiding irrelevant modules for pure retail or DMC/incoming agencies), and full Bosnian/English localization parity.

## 2. Current problem

1. **Shallow and Generic Search Routing**:
   - Selecting a reservation in `GlobalSearch.tsx` routed to the generic `/reservations` list instead of the specific `/reservations/:id` detail workspace.
   - Selecting a package routed to `/packages` instead of `/packages/:id`.
2. **Missing Entity Types**:
   - Passengers could not be searched by name, passport number, phone, or email.
   - Hotels and suppliers could not be found directly via Global Search.
   - Inquiries and quotations were missing from search results.
3. **Hardcoded UI Strings**:
   - `GlobalSearch.tsx` and `AppHeader.tsx` contained hardcoded English strings ("Search or type command...", "No results for...", shortcut badges, uppercase category names).
4. **Navigation Audit & Capability Gaps**:
   - Quotations (`/quotations`) was omitted from the sidebar navigation even though it is fully implemented and routed.
   - Mobile users had no icon trigger for Global Search in the header bar.
   - Capability filtering in the sidebar needed to reliably guard departures and tailor-made workflows based on configured agency capabilities.

## 3. Required discovery before editing

- Inspected `nmt-analytics-admin/src/components/common/GlobalSearch.tsx` and `AppHeader.tsx`.
- Inspected `nmt-analytics-admin/src/layout/AppSidebar.tsx` and agency capabilities in `nmt-analytics-api/src/lib/agencyCapabilities.ts`.
- Inspected passenger endpoints in `nmt-analytics-api/src/routes/departurePassengers.ts`.
- Inspected hotel endpoints in `nmt-analytics-api/src/routes/hotels.ts` and role permissions (`requireMinimumRole('viewer')`).
- Inspected supplier and inquiry endpoints in `nmt-analytics-api/src/routes/suppliers.ts` and `inquiries.ts`.

## 4. In scope

1. **Enhanced Global Search API & Coverage**:
   - Add search query parameter support to `GET /api/departure-passengers` (searches full name, ID document number, phone, email) scoped to tenant `org_id`.
   - Update `GET /api/hotels` to allow viewer role so all staff roles can search hotels.
   - Wire Global Search to query:
     - Customers (`/customers/:id`)
     - Passengers (`/reservations/:resId`)
     - Reservations (`/reservations/:id`)
     - Packages (`/packages/:id`)
     - Departures (`/departures/:id`)
     - Hotels (`/operations/hotels/:id`)
     - Inquiries (`/inquiries`)
     - Quotations (`/quotations/:id`)
     - Suppliers (`/suppliers`)
     - Contracts (`/operations/contracts`)
2. **Global Search UI & Keyboard Navigation**:
   - Direct deep-links to detail pages for each result.
   - Rich subtitle information (e.g. passport number for passengers, status and destination for packages/departures).
   - Category tags translated into active language (BS/EN).
   - Mobile header search button trigger.
3. **Capability-Aware Navigation**:
   - Ensure `AppSidebar.tsx` shows `Quotations` under Sales for agencies with `tailor_made_itineraries`.
   - Ensure `Departures` and other operational items respect agency capabilities.
4. **100% BS/EN Parity**:
   - Add all search-related translations to `bs.ts` and `en.ts`.
   - Translate search trigger text, empty state, and footer shortcut hints.

## 5. Out of scope

- Redesigning pages or changing typography, color themes, or layouts.
- Destructive database migrations.
- Changes to customer portal authentication or external widgets.

## 6. Domain rules

- Tenant isolation: every search query must be strictly scoped to `org_id`.
- Passengers are linked to their parent reservation; opening a passenger result opens the reservation detail view.
- Role checks: viewing and searching entities requires minimum `viewer` or `agent` role.

## 7. API requirements

- `GET /api/departure-passengers`: accept `search` param; filter `full_name`, `id_document_number`, `phone`, `email` with `.ilike`.
- `GET /api/hotels`: ensure minimum role is `viewer` for read queries.

## 8. Database / migration requirements

No schema changes or migrations required; uses existing tables and indexes (`departure_passengers`, `hotels`, `reservations`, `customers`, `packages`, `departures`, `suppliers`, `inquiries`, `quotations`, `contracts`).

## 9. Frontend / UX requirements

- Fast debounced search (250ms).
- Keyboard shortcuts: `↑`/`↓` to highlight, `Enter` to navigate, `Esc` to close, `⌘K` / `Ctrl+K` to open.
- Mobile search trigger button in header.
- Full BS and EN parity for all search categories and strings.

## 10. Tenant and security acceptance

- Organization A cannot search or read Organization B's passengers, hotels, quotations, or reservations.
- All requests use authenticated session token with `org_id` context.

## 11. Acceptance criteria

- [x] Global search returns passengers by name and passport number, deep-linking to reservation detail.
- [x] Global search links reservations directly to `/reservations/:id`.
- [x] Global search links packages directly to `/packages/:id`.
- [x] Global search covers hotels, suppliers, inquiries, and quotations with direct navigation.
- [x] All search categories, empty state, and keyboard hints are localized in BS and EN.
- [x] Sidebar includes Quotations with capability checking.
- [x] AppHeader provides mobile search button and localized search trigger placeholder.
- [x] Tests verify search functionality and translation keys.

## 12. Required tests

- API: `src/tests/departurePassengersSearch.test.ts` (3 tests passed).
- Admin: `src/tests/globalSearch.test.tsx` (3 tests passed), `src/tests/capabilityNavigation.test.tsx` (4 tests passed), `src/tests/i18nParity.test.ts` (3 tests passed).
- Verification commands pass cleanly.

## 13. Required verification commands

```bash
cd nmt-analytics-api && npm run build && npm test
cd ../nmt-analytics-admin && npm run lint && npm test && npm run build
```

## 14. Completion report

Implemented M22 Global Search and Navigation Cleanup across API and Admin. Verified 10 entity categories in GlobalSearch with direct deep-links, capability-aware sidebar navigation, mobile search trigger, and 100% BS/EN localization parity.

## 15. Completion record

- **Status:** COMPLETED
- **Branch:** `feature/m22-search-navigation`
- **Verification:** All tests passed (81 API test files, 55 admin test files, 0 lint errors, green builds).
