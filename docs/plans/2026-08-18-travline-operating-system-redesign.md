# Travline Travel Operating System Redesign

**Status:** Active — Phase 0 completed; Phase 1 Today queue started 2026-08-18  
**Date:** 2026-08-18  
**Protected behavior:** Existing reservations, departures, payments, documents, roles, portals, and public APIs must remain operational during the redesign.

## 1. Product decision

Travline will serve retail agencies, group-tour organizers, DMC/incoming agencies, and large tour operators through one shared data core with configurable operating capabilities.

It will not show every feature to every user. During onboarding, an agency selects one or more operating models. Travline derives a capability profile, dashboard, navigation, terminology, and default workflows from those selections. Directors can change the profile later without losing data.

Supported operating models:

- `retail_agency` — individual sales, external products, commissions, ticketing, customer service
- `group_tours` — fixed departures, passengers, installments, buses, rooming lists, guides, departure execution
- `dmc_incoming` — inquiries, tailor-made itineraries, supplier costing, quotations, confirmations, operations
- `tour_operator` — contracted inventory, allotments, charter flights, distribution, B2B partners, reconciliation

## 2. Research conclusions

The target agencies do not share one identical workflow:

- Victorius, Pohodi, and Beganović are departure-led. Their operational center is a trip with dates, passenger capacity, payments, communication, lists, and execution.
- Funky Tours and similar DMCs are inquiry-led. Their operational center is a versioned itinerary with supplier services, net costs, markup, quote approval, and delivery tasks.
- Fibula, Kontiki, Big Blue, and similar operators are inventory-led. Their operational center is contracted supply, allotments, distribution channels, high-volume bookings, and financial reconciliation.

Mature systems connect these models through the same lifecycle:

`Inquiry → Product/Itinerary → Pricing/Quote → Booking → Operations → Finance → Reporting`

Travline currently starts near the middle of that lifecycle. It has packages, departures, reservations, payments, and several operational utilities, but it lacks inquiries, a supplier catalogue, quotations, versioned itineraries, supplier booking confirmations, tasks, payables, and reconciliation.

## 3. Current-state diagnosis

### Structural problems

1. `travel_core` is a monolith. Enabling it exposes calendar, contracts, receipts, subagents, commissions, excursions, hotels, flights, and availability together.
2. Subscription entitlements and operational capabilities are conflated. A paid plan answers what a client may access; an agency profile answers what it needs to operate. These must be separate.
3. Navigation mirrors database entities rather than work. Users must understand internal system structure before completing a sale or departure.
4. The main sale wizard only supports an existing package plus existing departure. It cannot begin from an inquiry, custom trip, external supplier booking, or waitlist.
5. Several features are isolated. Hotels, flights, contracts, receipts, and excursions are pages rather than connected stages of a trip file.
6. There is no universal commercial object that carries a request from inquiry through quote, booking, operations, and settlement.
7. There is no supplier-side financial model: net cost, payable, due date, payment status, currency exposure, or margin by trip.
8. Onboarding checks whether records exist but does not configure how the agency works.

### Product gaps by lifecycle

| Lifecycle | Present | Missing or incomplete |
|---|---|---|
| Lead | Customers | Inquiries, sources, pipeline, follow-ups, conversion |
| Design | Packages, departures, package services | Versioned itinerary, day plan, reusable supplier products, custom trip |
| Price | Package price, reservation total | Net/gross pricing, markup, commission, exchange rates, quote versions |
| Sell | Reservation wizard, public widget | Quote acceptance, waitlist, option hold, external booking, omnichannel inbox |
| Operate | Calendar, hotels, flights, excursions, lists | Unified trip workspace, tasks, supplier confirmations, guide/driver assignments |
| Finance | Customer payments, installments, receipts | Supplier payables, reconciliation, refunds/credit notes, trip P&L |
| Distribute | Subagent portal | Inventory/rates for B2B, partner booking rules, channel allocation |
| Analyze | Dashboard and reports | Funnel, conversion, gross margin, operational readiness, cash exposure |

## 4. Target information architecture

The primary navigation should describe work:

1. **Today** — tasks, new inquiries, payment exceptions, supplier confirmations, upcoming departures
2. **Sales** — inquiries, quotations, bookings, customers
3. **Trips** — products, itineraries, departures, trip workspace
4. **Operations** — passenger services, accommodation, transport, guides, documents
5. **Partners** — suppliers, subagents, contracts, rates, allotments
6. **Finance** — receivables, payables, reconciliation, receipts, profitability
7. **Insights** — sales funnel, operations, finance, performance
8. **Settings** — agency profile, capabilities, team, templates, integrations

Capabilities determine which items appear. Roles determine which actions a person can perform. Subscription plans determine commercial entitlement. These are three separate controls.

## 5. Target domain model

### Shared core

- `inquiries` — the initial request and pipeline state
- `trip_files` — the universal commercial/operational case connecting inquiry, quote, booking, and delivery
- `suppliers` and `supplier_products` — hotels, transport, guides, activities, insurance, flights, fees
- `itineraries`, `itinerary_versions`, `itinerary_items` — scheduled or tailor-made trip design
- `quotes` and `quote_versions` — net, markup, gross, validity, acceptance
- `bookings` — customer commitment; existing reservations migrate toward this concept without destructive renaming
- `service_bookings` — supplier confirmations for each itinerary item
- `tasks` — owned actions with due dates and automation triggers
- `receivables` and `payables` — customer and supplier money
- `communications` — email, WhatsApp/Viber link, notes, documents, timeline events

### Mode-specific extensions

- Group tours: manifests, bus seats, rooming allocations, pickup points, group leaders
- DMC: daily itinerary, multilingual proposal, supplier requests, guide/driver assignments
- Tour operator: contracts, seasonal rates, allotments, stop-sale, releases, charter inventory, B2B allocation
- Retail: external booking references, ticketing records, commission claims, individual travel documents

## 6. Delivery roadmap

### Phase 0 — Product foundation and safety

1. Add agency operating profiles and granular capability catalogue.
2. Return profile/capabilities from `/me/context`.
3. Make navigation capability-aware while keeping a legacy fallback.
4. Separate plan entitlement, agency capability, and role permission concepts in code.
5. Add contract tests for capability resolution and route protection.

**Exit:** Every organization can represent one or more operating models without exposing irrelevant tools.

### Phase 1 — Unified daily workflow

1. Replace the dashboard with a Today work queue: inquiries, follow-ups, unpaid balances, missing traveler data, unconfirmed suppliers, imminent departures.
2. Introduce a universal quick-create action: inquiry, booking, group departure, tailor-made trip.
3. Build a trip workspace that aggregates commercial, traveler, operational, document, task, and financial state.
4. Preserve existing entity pages as secondary indexes during migration.

**Exit:** An agent can see what requires action and finish work without navigating unrelated modules.

### Phase 2 — Sales and quotation engine

1. Inquiry pipeline with source, owner, stage, value, next action, and lost reason.
2. Supplier and reusable service catalogue.
3. Itinerary builder for scheduled and tailor-made trips.
4. Net/markup/gross pricing with currencies, commissions, and margin warnings.
5. Versioned, shareable quotation with accept/decline and audit trail.
6. Convert accepted quote into booking without re-entry.

**Exit:** Travline covers the full lead-to-booking cycle for retail, group, and DMC sales.

### Phase 3 — Operations control

1. Trip workspace readiness checklist.
2. Supplier booking requests, confirmations, cancellations, and deadlines.
3. Traveler data collection and missing-document automation.
4. Transport, pickup, seating, rooms, guides, drivers, and daily run sheet.
5. Automatic manifests, rooming lists, vouchers, contracts, and traveler packs.
6. Timeline and internal task ownership.

**Exit:** A confirmed trip can be delivered from a single operational workspace.

### Phase 4 — Finance and profitability

1. Customer receivables and supplier payables ledger.
2. Payment allocation, refunds, credit notes, and reconciliation.
3. Multi-currency exchange-rate snapshots and realized differences.
4. Trip P&L: revenue, direct costs, commissions, tax, gross margin.
5. Accounting export/integration boundaries.

**Exit:** Directors know actual margin and cash exposure for every trip.

### Phase 5 — Inventory and distribution

1. Seasonal supplier contracts and rate rules.
2. Hotel/transport/flight allotments, release periods, stop-sale, and overbooking controls.
3. B2B partner portal with commission and credit rules.
4. Public booking engine and website API based on the same availability engine.
5. Channel allocation and booking-source reporting.

**Exit:** Larger tour operators can contract, package, distribute, and reconcile inventory.

### Phase 6 — Regional compliance and integrations

1. BiH document and fiscal requirements after jurisdiction-specific legal validation.
2. Serbia eTurista/fiscalization only for organizations operating in Serbia.
3. Payment gateways, WhatsApp/Viber communication, email synchronization.
4. GDS/bedbank/accounting adapters through stable provider interfaces.

## 7. First implementation slice

The first code slice is the Phase 0 capability foundation:

- add `agency_profiles` and `enabled_capabilities` organization fields;
- define a typed operating-model and capability catalogue shared by API behavior;
- derive safe default capabilities from selected profiles;
- expose profiles and capabilities through `/me/context`;
- filter current navigation using granular capabilities with `travel_core` as a temporary legacy fallback;
- add API tests for derivation and legacy compatibility.

This slice changes no existing data or core workflow. It creates the control plane required to reorganize Travline safely, one workflow at a time.

### Implementation status — completed 2026-08-18

- Migration `20260818010000_agency_profiles_capabilities.sql` applied successfully.
- Current `NMT Analytics` organization configured for all four operating models and 12 derived capabilities.
- Director Settings UI supports multi-select operating models and applies navigation changes immediately.
- `/me/context` exposes profiles, derived capabilities, and configuration status with legacy fallback.
- Operations navigation respects granular capabilities while retaining `travel_core` entitlement checks.
- API tests, API build, admin build, live health check, and desktop/mobile visual verification passed.

### Phase 1 implementation status — first slice completed 2026-08-18

- Dashboard now leads with a role-aware Today queue instead of a passive revenue chart.
- Queue priorities use real data: pending reservations, departures within seven days, departures below 30% occupancy, and outstanding balances for finance roles.
- Queue includes loading, clear, partial-error, and action states without invented deadlines or statuses.
- Revenue, booking, departure, and payment analytics remain available as secondary context.
- Mobile dashboard no longer clips later columns; all dashboard sections are available in a vertical flow.
- A global quick-create launcher is available from every authenticated page and from the dashboard primary action.
- Reservation and group-departure actions open their existing creation workflows directly through refresh-safe deep links.
- Inquiry creation is active from global quick-create and opens the Phase 2 intake workflow directly; tailor-made trip creation remains planned until the itinerary domain is implemented.

### Phase 1 implementation status — unified trip workspace started 2026-08-18

- Existing departure detail evolved into the first unified trip workspace instead of creating a duplicate route.
- The workspace now exposes real operational readiness for capacity, confirmations, payment exposure, accommodation allocation, and transport configuration.
- Commercial and operational shortcuts keep reservations, the passenger list, groups, and hotels inside the same trip context.
- Capacity uses the manifest-derived traveler total and explicitly flags over-capacity departures instead of trusting the stale `departures.booked` counter.
- Passenger manifest loading no longer fails on the nonexistent `excursion_passengers.email` column; individual rows use the linked customer email where available.
- Reservation-level fallback rows and true passenger rows now calculate traveler totals without multiplying individual passengers by reservation party size.
- Loading, empty, attention, light, dark, desktop, and mobile states were verified; API and admin automated suites pass.
- Trip-to-reservation navigation now preserves the departure context and filters the reservation index server-side.
- The scoped reservation view provides direct return to the trip workspace and an explicit escape to the global reservation index.
- New sales opened from an active trip preselect its package and departure; completed or cancelled trips cannot accept new reservations.
- Documents, tasks, supplier confirmations, payables, and reconciliation remain the next trip-workspace expansion.

### Phase 2 implementation status — inquiry pipeline completed 2026-08-18

- Added a tenant-isolated inquiry domain with row-level security, audit logging, API validation, organization-scoped search, creation, and stage updates.
- The shared intake model covers scheduled groups, tailor-made/DMC work, accommodation-only, flight-only, corporate travel, pilgrimage, excursions, transfers, and other agency requests.
- The sales board follows six explicit stages: new, qualified, proposal, follow-up, won, and lost.
- Intake records source, contact details, destination, travel dates, traveler count, budget, currency, next action, notes, owner, and lost reason without requiring a package or departure first.
- Global quick-create and the capability-aware Sales navigation now open the inquiry workflow directly.
- Empty, populated, modal, light, dark, desktop, and mobile states were verified; temporary verification data was removed after testing.
- The supplier/service catalogue follows as the next Phase 2 slice; itinerary versions, costing, quotation delivery, acceptance, and conversion remain later slices.

### Phase 2 implementation status — supplier/service catalogue completed 2026-08-18

- Added a tenant-isolated supplier directory and reusable service catalogue with row-level security and an organization-safe composite relationship between suppliers and services.
- The supplier model covers accommodation, transport, airlines, guides, activities, restaurants, insurance, visas, tickets, venues, equipment, and other partners used across all agency profiles.
- Reusable services record category, pricing unit, net price, currency, tax, default markup, validity, quantity boundaries, status, and operational notes.
- Supplier records retain location, tax identity, contacts, website, default currency, payment terms, notes, and active/inactive status.
- Added organization-scoped API search/filtering, creation, status updates, service creation, service updates, role enforcement, and audit logging.
- Added a capability-aware Suppliers workspace with a master/detail directory, inline service editor, responsive service cards, desktop table, empty/loading states, and complete Bosnian/English copy.
- Creation, retrieval, nested service loading, status changes, cascading cleanup, desktop/mobile layout, dark/light themes, and both languages were verified.
- Itinerary versions, supplier service selection, cost calculation, quotation delivery, acceptance, and booking conversion remain the next Phase 2 slices.

## 8. Verification rules

Every phase must satisfy:

- API TypeScript build and automated tests pass.
- Admin production build passes.
- Existing organization with no profile receives legacy-compatible access.
- New organization receives capabilities derived from onboarding selections.
- One workflow is browser-tested in BS and EN, desktop and mobile.
- No second workflow is changed until the first is visually and operationally verified.

## 9. Success metrics

- New inquiry recorded in under 60 seconds.
- Scheduled booking completed in under 2 minutes.
- Accepted tailor-made quote converted without duplicate entry.
- Departure readiness visible from one screen.
- Every supplier service has confirmation and payable status.
- Directors can see gross margin and cash exposure per trip.
- A new staff member can identify the next required action without training on database entities.
