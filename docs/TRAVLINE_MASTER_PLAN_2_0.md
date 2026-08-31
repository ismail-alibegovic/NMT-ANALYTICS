# TRAVLINE MASTER PLAN 2.0

**Status:** Canonical product + implementation plan  
**Purpose:** single planning document for humans and coding agents  
**Rule:** this document is context, not permission to implement everything. An agent may implement **only the task ID explicitly named in the prompt**.

---

# 0. HOW TO USE THIS DOCUMENT

Travline must be developed as a connected travel-agency operating workflow, not as a collection of isolated CRUD pages.

This file has two jobs:

1. define the canonical product/business logic;
2. split implementation into small, extractable tasks (`M00`, `M01`, `M02`...) that can be sent to an agent one at a time.

## 0.1 Agent execution rule

When an agent receives this full file, it must read it for context but **must not start work from the roadmap by itself**.

The implementation prompt must always contain:

```text
ACTIVE TASK: Mxx — <task name>
```

The agent may implement only that task.

If it finds a problem outside the active task:

- document it;
- do not fix it;
- stop scope expansion.

## 0.2 Source-of-truth rule

For every task, the agent must inspect current code, migrations and tests before changing anything. Documentation expresses product intent, but current code determines implementation reality.

GitHub `main` remains source of truth after completed/merged work. Feature work uses a task branch and PR. Applied database migrations are immutable; schema changes are append-only.

## 0.3 Completion rule

A user-facing task is not complete because TypeScript compiles.

Completion requires, where applicable:

- correct business behavior;
- tenant isolation;
- API/server-side enforcement of critical rules;
- automated tests;
- BS/EN parity;
- build/CI;
- real browser verification;
- persistence check after refresh/reopen;
- no unrelated regression.

Without browser verification, status is **NOT VERIFIED**.

---

# 1. PRODUCT POSITIONING

Travline is a cloud operating system for travel agencies and tour operators.

It should support four operating models through one shared core:

- **Retail agency** — customer sales, external travel services, documents, commissions and service follow-up.
- **Group-tour organizer** — fixed departures, passenger manifests, capacity, installments, buses, flights, accommodation, seating and rooming.
- **DMC / incoming / tailor-made** — inquiry-led workflow, itinerary, supplier services, quotation, confirmations and operational delivery.
- **Tour operator** — contracted inventory, allotments, departures, distribution, supplier finance and reconciliation.

Not every agency needs every module. Capabilities determine which workflows are visible; role permissions determine what a user may do; subscription entitlement determines commercial access. These three concepts must remain separate.

---

# 2. INDUSTRY WORKFLOW PRINCIPLES

Travline should follow the way mature tour-operator systems organize work:

```text
Inquiry / demand
    ↓
Product or itinerary
    ↓
Pricing / quotation where needed
    ↓
Booking / reservation
    ↓
Traveler data
    ↓
Customer payments
    ↓
Supplier confirmations / service delivery
    ↓
Departure operations
    ↓
Manifests / rooming / transport lists / documents
    ↓
Trip execution
    ↓
Supplier payments / reconciliation / profitability
```

Important product conclusions:

- A **booking/reservation** is a commercial commitment, not the same object as a passenger.
- A **departure** is a dated operational instance, not just a date field on a package.
- A **package/product** defines what can be sold; a departure defines what is actually operating on a specific date.
- Traveler information should be collected progressively. Do not require every passport/document field at sale time when it is not needed yet.
- Operations must ensure every traveler receives the services actually sold to them.
- Supplier confirmation status, manifests, rooming lists, bus lists, flight lists and payment status belong to the same trip context.
- Customer receivables and supplier payables are different financial flows.
- Do not force a fixed-group-tour agency through quotation logic if it does not need it; do not force a DMC into a package-only workflow.

---

# 3. CANONICAL DOMAIN MODEL

## 3.1 Customer

Customer is the commercial contact / buyer / payer.

A customer may or may not be a traveler.

## 3.2 Passenger / traveler

Passenger is a person traveling on a specific booking/departure context.

`departure_passengers.id` is the canonical operational identity for:

- passenger manifest;
- groups;
- bus seating;
- rooming;
- flight readiness;
- traveler document status;
- communication targeting.

Do not use customer ID as a substitute for passenger ID.

## 3.3 Package / Product

Package is a reusable commercial template / product family.

It may define:

- title and destination;
- duration/default dates;
- base price / currency;
- default sales capacity;
- included services;
- accommodation templates;
- optional services/add-ons;
- itinerary/default program;
- transport intent/defaults;
- travel-document requirements/defaults;
- commercial variants where genuinely needed.

A package is **not** an operational manifest.

## 3.4 Departure

Departure is the dated sellable/operational instance of a package.

It owns operational state such as:

- actual travel dates;
- sellable capacity;
- real passengers/reservations;
- transport configuration for that operating option;
- accommodation allotments;
- flights;
- vehicle/seat map where relevant;
- groups;
- rooming;
- operational readiness;
- supplier confirmations;
- operational documents.

Package changes must not silently rewrite existing departures. Defaults are materialized/snapshotted and departure overrides are explicit.

## 3.5 Reservation / Booking

Reservation is the commercial booking connecting:

- customer;
- departure;
- travelers;
- commercial price;
- accommodation requirements;
- optional services;
- payment plan/status;
- source/owner/notes;
- booking snapshot required for historical accuracy.

## 3.6 Supplier and supplier service

Supplier is a reusable partner: hotel, transport company, airline, guide, activity provider, insurer, restaurant, etc.

Supplier service is the reusable thing the supplier provides.

Package/departure configuration should reference supplier/catalog data where practical rather than duplicating supplier identities in every booking.

---

# 4. CRITICAL TRANSPORT DECISION

Transport must not be modeled as one ambiguous dropdown that mixes three different concepts.

Travline must distinguish:

1. **Transport mode used by the itinerary** — bus, flight, train, ship, transfer, mixed.
2. **A sellable transport alternative** — e.g. customer may buy the same Antalya product by bus OR by flight.
3. **Operational transport segment/resource** — actual bus, flight leg, transfer, carrier, vehicle, times.

## 4.1 Same package offered by bus and by flight

Preferred model:

- keep one commercial package/product family;
- create separate sellable departure/offer instances when transport alternatives have separate capacity/inventory/operations.

Example:

```text
Package: Antalya Summer 2027

Departure option A:
10–17 Jun 2027 — BUS — capacity 50

Departure option B:
10–17 Jun 2027 — FLIGHT — capacity 30
```

The New Sale flow selects the correct departure option. It should **not ask for transport again later** because transport is already determined by the chosen sellable departure.

This prevents mixing:

- bus seat capacity;
- flight allotment/capacity;
- different prices;
- different manifests;
- different operational requirements.

## 4.2 Truly mixed itinerary

A trip that genuinely uses several transport segments, e.g. bus transfer + flight + local transfer, is not the same as “bus OR flight”.

Such a departure may be `mixed` and later use explicit transport segments.

## 4.3 Consequence for New Sale

In the canonical workflow there should normally be **no separate transport selector in the passenger step**.

Package + departure selection determines the sold transport configuration.

If a future product requires reservation-level transport choices inside the same departure, that must be introduced as a dedicated model with independent capacity rules — not by reusing a generic string field.

---

# 5. CAPACITY MODEL

Capacity is an operational safety rule, not a decorative counter.

## 5.1 Departure sales capacity

Each departure has a sellable passenger capacity.

Canonical occupancy is actual capacity-consuming travelers on the departure.

Primary source: `COUNT(departure_passengers.id)` for bookings with materialized passenger rows.

Compatibility fallback may use reservation party size only for older booking data where no passenger rows exist. Never double-count both.

## 5.2 Hard rule

```text
booked_passengers <= departure.capacity
```

The rule must be enforced server-side and atomically.

Frontend warnings alone are insufficient.

## 5.3 Resource-specific capacity

Departure sales capacity does not replace resource inventory.

Travline must separately validate:

- hotel rooms/room-type allotments;
- bus seats / vehicle capacity;
- contracted flight allotment if Travline controls it;
- optional service capacity where applicable.

A booking succeeds only if every required constrained resource can satisfy the requested quantity.

## 5.4 Future capacity maturity

Long term, availability can be derived from the tightest constrained resource where appropriate, but the first reliable implementation should keep a clear departure sales cap plus independent resource guards rather than introducing a complex global optimizer.

---

# 6. ACCOMMODATION MODEL

Canonical chain:

```text
Hotel catalog
    ↓
Package accommodation template
    ↓
Departure accommodation allotment
    ↓
Reservation accommodation requirement
    ↓
Passenger mapping
    ↓
Operational room slots
    ↓
Rooming
    ↓
Final supplier rooming list
```

## 6.1 Hotel catalog

Hotel is persistent supplier/catalog identity:

- name;
- destination/location;
- stars/category;
- supplier/contact reference where available;
- basic operational notes.

Do not create a new hotel identity per package.

## 6.2 Package accommodation template

A package specifies which hotels and room types it sells.

Typical room options:

- Single;
- Double;
- Triple;
- Apartment;
- Studio;
- Suite;
- custom agency-defined type when needed.

Template data may include:

- room type;
- capacity per room;
- default/allotted room count;
- net cost;
- sell price / supplement;
- currency;
- conditions/notes.

## 6.3 Departure allotment

Departure receives a snapshot/materialized allotment from the package and can override it without changing the package template.

Inventory counts **rooms**, not passengers.

For each allocation expose conceptually:

```text
Total contracted/allotted rooms
Sold rooms
Available rooms
Capacity per room
Potential person capacity
```

Do not confuse “rooms reserved from supplier” with “rooms sold to customers”. Existing confusing field names may remain temporarily for compatibility, but UI/API semantics must be explicit.

## 6.4 Reservation accommodation requirement

Reservation stores what was sold, e.g.:

```text
1 × Double
2 × Single
```

If two identical Single rooms are sold, use one requirement row with `roomCount = 2`, not duplicate identical rows.

The requirement records passenger mapping.

## 6.5 Rooming

Accommodation requirement answers:

> What rooms did the customer buy?

Rooming answers:

> Which traveler sleeps with whom in which operational room slot?

These are different stages and must not be collapsed.

Physical hotel room number is optional and may be entered later when the supplier assigns actual rooms.

---

# 7. CANONICAL NEW SALE WORKFLOW

New Sale should minimize duplicate choices and expose only relevant fields.

Recommended flow:

```text
1. Trip
   Package + Departure
        ↓
2. Customer & Travelers
        ↓
3. Accommodation (only if departure offers accommodation)
        ↓
4. Add-ons (only if package/departure offers optional services)
        ↓
5. Price & Payment Terms
        ↓
6. Review & Create Booking
```

## 7.1 Step 1 — Trip

User chooses:

- package/product;
- dated departure/operating option.

Departure cards/options should show enough information to distinguish choices:

- date;
- transport mode/label;
- price where different;
- remaining capacity;
- status.

Do not ask the same transport decision again after departure is selected.

## 7.2 Step 2 — Customer & Travelers

Collect the minimum information required to create the booking.

Required baseline:

- customer/booker identity;
- customer contact;
- number of travelers;
- traveler names when available.

Traveler detail should be progressive.

Passport, issuing authority, expiry, nationality, DOB and similar data should appear only when relevant or may be marked **Fill in later**.

The booking should not fail only because a traveler has not yet sent passport data unless the agency explicitly configures that field as required at booking time.

## 7.3 Step 3 — Accommodation

Do not show accommodation in an earlier step.

Show only departure accommodation allocations that can actually be sold.

For every option show:

- hotel;
- stars/category;
- room type;
- sell price/supplement;
- available rooms;
- room capacity.

Selection must create the canonical accommodation requirement and passenger mapping.

If no accommodation is offered, skip the step automatically.

If accommodation is optional, provide an explicit “No accommodation / own arrangement” option only when the package allows it.

## 7.4 Step 4 — Add-ons

Show only optional services belonging to the selected package/departure.

Examples:

- excursion;
- transfer;
- insurance;
- baggage;
- meal;
- visa service;
- ticket/activity.

Do not show a global catalog of unrelated services during a booking.

## 7.5 Step 5 — Price & payment terms

Booking should calculate a transparent price breakdown:

```text
Base trip price
+ accommodation supplements/options
+ add-ons
- discount (if permitted)
= booking total
```

Payment terms may be:

- full payment;
- deposit;
- installments;
- manual/custom schedule where supported.

Creating a reservation must not require an actual payment transaction unless the agency workflow explicitly demands it.

## 7.6 Step 6 — Review

Show a human-readable summary before create:

- trip/departure;
- customer;
- travelers;
- accommodation;
- add-ons;
- total;
- payment terms;
- missing traveler information warnings.

Then create all booking-domain records atomically or with rollback-safe orchestration.

---

# 8. TRAVELER READINESS / SMART DATA COLLECTION

Do not overload New Sale with all operational fields.

Travline should separate **booking creation** from **departure readiness**.

## 8.1 Travel requirement profile

Package/departure should carry structured requirements such as:

- domestic/international;
- passport/travel document required;
- DOB required;
- nationality required;
- visa-related information required;
- emergency contact required;
- other agency-configured traveler fields.

Transport may provide defaults but must not be the sole rule.

Incorrect rule:

```text
bus = no passport
flight = passport
```

Correct rule:

```text
trip/departure requirements determine required traveler data
```

## 8.2 Fill in later

Missing non-blocking data becomes a readiness task/warning.

Examples:

- passport missing;
- passport expiry too close;
- DOB missing;
- rooming incomplete;
- seat unassigned;
- balance overdue;
- supplier confirmation pending.

The system should help staff finish the trip later rather than forcing fake data during the sale.

---

# 9. PASSENGER GROUPS

A group/party is an operational relationship between travelers on one departure.

Examples:

- family;
- friends;
- school/class;
- company/team;
- leader + participants.

A group may store:

- name;
- color/visual identity;
- members;
- seating preference;
- rooming preference;
- notes;
- lock/manual decisions where relevant.

Group membership must never cross departures or organizations.

---

# 10. BUS / VEHICLE OPERATIONS

Bus operations apply only when the departure actually uses agency-controlled road transport.

Core model:

- reusable vehicle/resource where practical;
- seat-map/configuration;
- capacity;
- departure assignment;
- traveler seat assignment;
- manual locks;
- pickup/boarding information later.

## 10.1 Automatic seating rule

```text
locked/manual seats first
    ↓
groups next
    ↓
remaining travelers last
```

The algorithm should:

- never exceed vehicle/seat capacity;
- never overwrite locked seats;
- try to keep group members together;
- otherwise keep them as close as practical;
- clearly flag split groups;
- be deterministic/reviewable where possible.

Do not show a bus-style seat map for flight-only departures.

---

# 11. FLIGHT OPERATIONS

Flight Ops should represent real flight context, not a generic “flight” label.

Core data:

- carrier;
- flight number;
- origin/destination airport;
- outbound/return/segment direction;
- scheduled times;
- booking/reference notes where relevant;
- traveler readiness/document status.

For flight-based products Travline may track contracted seat allotment where an operator owns inventory, but ordinary retail/DMC workflows may only need flight records and traveler manifests. Do not assume every flight is inventory controlled by the agency.

---

# 12. MANUAL AND AUTOMATIC ROOMING

## 12.1 Operational room slots

Departure allotments create logical room slots, e.g.:

```text
Double 01
Double 02
Single 01
...
```

These are operational planning slots, not necessarily physical hotel room numbers.

## 12.2 Manual rooming

User can assign travelers to valid slots while respecting:

- departure;
- organization;
- reservation accommodation requirement;
- room type;
- room capacity;
- passenger mapping;
- locked/manual assignment rules.

## 12.3 Automatic rooming

Automatic rooming comes only after manual rooming is stable.

Rules:

- preserve locked/manual assignments;
- respect purchased room requirements;
- respect room capacities;
- use groups/party relationships as preference;
- never silently force invalid rooming;
- return a deterministic proposal for review before apply;
- report unresolved travelers/conflicts.

---

# 13. SUPPLIER OPERATIONS — IMPORTANT FUTURE CORE

Travline must eventually track whether the services sold to travelers are actually confirmed with suppliers.

This is a major difference between a simple CRM and a real travel operating system.

For each relevant service/departure, track lifecycle such as:

```text
Not requested
Requested
On option / pending
Confirmed
Changed
Cancelled
```

Examples:

- hotel allotment confirmation;
- bus/transport confirmation;
- flight/service confirmation;
- guide/activity booking;
- transfer booking.

Supplier communication/history should live in the same trip/service context.

Do not build this into New Sale. It belongs to post-sale operations / trip workspace.

---

# 14. FINANCE

Travline must separate:

## 14.1 Customer receivables

- booking total;
- installments;
- paid amount;
- remaining amount;
- due dates;
- payment records;
- refund/credit behavior later.

Statuses should derive from real ledger state rather than being manually guessed.

## 14.2 Supplier payables

Later phase:

- supplier net cost;
- due date;
- amount paid;
- remaining supplier balance;
- currency;
- reconciliation.

## 14.3 Profitability

Later phase:

```text
Revenue
- direct supplier cost
- commissions/fees where applicable
= gross margin
```

Do not mix customer payment status with supplier payment status.

---

# 15. DOCUMENTS

Documents must use authoritative booking/trip data, not maintain a duplicate business state.

Core documents:

- contract;
- voucher;
- invoice/receipt as legally appropriate;
- passenger manifest;
- rooming list;
- bus list;
- flight list;
- traveler pack later.

Final rooming list should export supplier-ready PDF and Excel where required.

---

# 16. COMMUNICATION

Communication must be contextual.

Targets may include:

- customer;
- one traveler;
- selected travelers;
- passenger group;
- entire departure;
- suppliers later.

Requirements:

- tenant-safe recipient resolution;
- departure-safe selection;
- organization sender settings;
- communication history;
- templates;
- channel constraints such as SMS length;
- BS/EN UI parity.

Automations should be driven by real events/readiness states, e.g. payment reminder or missing passport, not invented generic alerts.

---

# 17. INQUIRIES, QUOTATIONS AND TAILOR-MADE WORK

Fixed group tours and tailor-made travel should share data but not the same mandatory workflow.

## Fixed group booking

Typical fast path:

```text
Package → Departure → Reservation
```

## Tailor-made / DMC

Typical path:

```text
Inquiry → Itinerary → Supplier costing → Quote → Acceptance → Booking
```

Travline should support both through agency capabilities.

Do not force quotation/versioning into every fixed departure sale.

---

# 18. PUBLIC FORMS / WEBSITE BOOKING

Public forms are an intake channel.

A request/inquiry form should normally create an inquiry, not silently create a confirmed booking.

A true public booking engine is a separate later feature and must use the same canonical availability/capacity/price rules as internal New Sale.

Website integration should support embeddable widgets/API for WordPress and other sites without creating a second business logic stack.

---

# 19. DEPARTURE / TRIP WORKSPACE

Departure Detail should become the operational center for a dated trip.

It should make these states understandable from one context:

- occupancy / remaining capacity;
- reservations;
- passenger manifest;
- missing traveler data;
- groups;
- transport/seating where relevant;
- accommodation inventory;
- rooming;
- flights;
- payment exposure;
- supplier confirmation state;
- communications;
- operational documents;
- tasks/readiness.

Avoid creating separate disconnected pages for every operational object if users then have to reconstruct the trip mentally.

---

# 20. DASHBOARD / TODAY

Dashboard should answer:

> What needs attention today?

Examples based on real data:

- new inquiry/follow-up;
- upcoming departure with incomplete travelers;
- overdue customer balance;
- unconfirmed supplier service;
- rooming incomplete;
- bus seating incomplete;
- passport/travel-data missing;
- capacity nearing limit.

No fake warnings or arbitrary deadlines unsupported by data.

---

# 21. GLOBAL SEARCH

Search should locate operational entities a staff member actually looks for:

- customer;
- traveler/passenger;
- reservation;
- package;
- departure;
- hotel/supplier.

Search results should navigate directly into the correct context.

---

# 22. INTERNATIONALIZATION AND UX

Travline supports Bosnian and English as first-class UI languages.

Rules:

- no mixed-language screen;
- no hardcoded strings where i18n is established;
- parity tests for new keys;
- actionable error messages;
- loading/empty/error states;
- no broad UI redesign inside functional tasks;
- one workflow/page at a time with browser verification.

The UI should be clean and operational, not visually busy. Progressive disclosure is preferred over presenting every possible field at once.

---

# 23. DATA AND SECURITY INVARIANTS

Non-negotiable:

- every tenant-owned read/write scoped to authenticated org;
- no cross-org relationships;
- server-side enforcement of capacity/money/security/business-critical rules;
- no secrets in browser/repository/logs;
- API-first mutations;
- append-only migrations;
- audit significant mutations using existing conventions;
- preserve applied history;
- no production-wide data reset in feature tasks;
- deterministic, explicitly scoped seed operations only.

---

# 24. DEMO / TEST DATA STRATEGY

Two different concepts:

## 24.1 Golden E2E dataset

Purpose: prove Travline end-to-end.

Characteristics:

- deterministic;
- repeatable;
- idempotent;
- tenant-safe;
- explicit ownership marker;
- realistic linked records;
- safe fictional traveler data.

It should eventually cover:

- package/departure;
- accommodation inventory;
- reservation/passengers;
- groups;
- payments;
- bus case;
- flight case;
- travel readiness;
- rooming;
- supplier operations.

## 24.2 Clean demo tenant

Purpose: allow an agency/user to create everything themselves.

It should start empty/onboarding-ready and must not be confused with the golden E2E tenant.

---

# 25. WHAT WE SHOULD NOT BUILD / WHAT TO AVOID

Avoid these architecture traps:

1. **Do not duplicate transport selection.** If departure determines bus/flight, do not ask again later.
2. **Do not treat `bus` as “passport not needed”.** Travel requirements determine documents.
3. **Do not treat package variant as hotel.** Accommodation has its own model.
4. **Do not use customer as passenger.** Separate commercial contact from traveler.
5. **Do not treat room allotment as rooming.** Sold inventory and who sleeps together are separate.
6. **Do not use stale denormalized counters as authority** when canonical relational data exists.
7. **Do not require all traveler data at sale time.** Use readiness/fill-later.
8. **Do not implement every supplier/inventory concept inside New Sale.** Sale should remain fast.
9. **Do not make every agency use the same workflow.** Capabilities adapt the product.
10. **Do not create a second API/business logic for website widgets.** Reuse canonical services.
11. **Do not build global integration mocks that look live.** Integrations must expose real configured state.
12. **Do not mix customer receivables and supplier payables.**
13. **Do not broad-refactor while fixing one workflow.**
14. **Do not mark a feature DONE without browser/runtime proof.**

---

# 26. IMPLEMENTATION ROADMAP — EXTRACTABLE TASKS

The following tasks are deliberately small enough to be extracted and sent individually.

Each task contains its own boundary. The coding agent must still inspect the current code before implementation.

---

## M00 — BASELINE FREEZE AND MASTER-PLAN ALIGNMENT

### Goal
Establish the exact current repository/runtime state before starting Master Plan implementation.

### Scope

- inspect current `main` plus any open PR intended to become baseline;
- identify which PR23-era changes are already merged vs branch-only;
- reconcile current code with this Master Plan;
- classify old `DONE` roadmap statements as `VERIFIED`, `PARTIAL`, `LEGACY`, or `UNVERIFIED` based on current evidence;
- create/update active task docs only; no product code changes.

### Do not

- refactor code;
- change DB;
- fix discovered product bugs.

### Acceptance

- one evidence-based baseline document;
- exact starting SHA;
- exact known open blockers;
- no code changes.

---

## M01 — PACKAGE / DEPARTURE / TRANSPORT CANONICALIZATION

### Goal
Remove ambiguity between package transport defaults, sellable departure options and true mixed transport.

### Scope

- audit current `packages.transport_type`, `departures.transport_type`, `package_services`, flights and vehicle models;
- define one canonical API contract;
- make New Sale treat departure as the selected operating transport option;
- eliminate redundant transport selection after departure choice;
- ensure same package may have multiple departures on same dates with different transport/capacity without data collision;
- preserve `mixed` for true multi-segment trips, not customer alternatives.

### Do not

- build full transport-segment engine unless current code already has one;
- implement automatic seating;
- redesign package editor broadly.

### Acceptance

- Bus-only departure: no extra transport question;
- Flight-only departure: no extra transport question;
- same package can expose distinct Bus and Flight departure choices;
- capacities remain independent;
- BS/EN/browser verified.

---

## M02 — DEPARTURE OCCUPANCY AND CAPACITY CONTRACT

### Goal
Make capacity authoritative everywhere.

### Scope

- canonical occupancy from departure passengers with controlled legacy fallback;
- server-side atomic hard capacity enforcement;
- create/edit/direct passenger-add paths use same rule;
- list/detail/API all show the same occupancy;
- active/cancelled status behavior explicitly documented/tested.

### Do not

- solve accommodation/seat inventory here;
- create new analytics redesign.

### Acceptance

- no successful write can produce `booked > capacity`;
- no double count;
- concurrency test;
- browser list/detail consistent.

---

## M03 — NEW SALE CORE WIZARD STRUCTURE

### Goal
Create a clean booking flow without duplicate/irrelevant choices.

### Scope

Canonical steps:

```text
Trip
Customer & Travelers
Accommodation (conditional)
Add-ons (conditional)
Price & Payment Terms
Review
```

- remove accommodation from earlier passenger/details step;
- remove redundant transport selector if departure already determines transport;
- conditionally skip irrelevant steps;
- preserve package/departure context;
- explicit validation message instead of silently disabled Next.

### Do not

- add passport readiness engine;
- add automatic rooming/seating;
- build public checkout.

### Acceptance

- user understands why Next is blocked;
- no duplicate transport/accommodation decision;
- browser-complete booking flow works.

---

## M04 — NEW SALE ACCOMMODATION SELECTION

### Goal
Make departure accommodation actually sellable from New Sale.

### Scope

- load only current departure allotments;
- select hotel/room option;
- roomCount;
- guestsExpected;
- passenger mapping;
- availability validation;
- multi-line requirements;
- persistence on reopen;
- atomic inventory release/rebook on edit.

### Do not

- assign operational room slots;
- auto-room passengers.

### Acceptance

Example four travelers:

```text
1 × Double → 2 travelers
2 × Single → 2 travelers
```

Inventory decreases by rooms sold, not guest count. No overbooking.

---

## M05 — OPTIONAL SERVICES / ADD-ONS IN NEW SALE

### Goal
Offer only add-ons belonging to selected product/departure.

### Scope

- audit `package_services` and current add-on concepts;
- distinguish included vs optional service;
- selectable quantity where relevant;
- pricing contribution;
- reservation persistence/snapshot.

### Do not

- build supplier confirmation lifecycle;
- expose entire supplier catalog in New Sale.

### Acceptance

- unrelated package services never appear;
- total updates correctly;
- reopen preserves selection.

---

## M06 — TRAVELER READINESS / FILL-IN-LATER

### Goal
Collect only relevant traveler data and track missing operational information after sale.

### Scope

- structured package/departure travel requirements;
- relevant document fields;
- missing-data readiness state;
- Fill in later;
- edit passenger later;
- domestic/international distinction;
- flight defaults but not hardcoded transport-only logic.

### Do not

- implement visa-rule database by country;
- make uncertain legal assumptions automatically.

### Acceptance

- international bus can request passport;
- domestic bus can omit it;
- flight booking can save when passport is allowed later;
- missing information is visible before departure.

---

## M07 — RESERVATION DETAIL AS COMMERCIAL SOURCE OF TRUTH

### Goal
Make booking detail reflect exactly what was sold.

### Scope

- customer;
- travelers;
- departure;
- accommodation requirements;
- add-ons;
- price breakdown;
- payment state;
- booking snapshot;
- missing readiness items;
- clear links back to trip/departure.

### Do not

- redesign every reservation index/table;
- implement operational rooming here.

### Acceptance

New Sale → Reservation Detail → Edit → Reopen remains consistent.

---

## M08 — PASSENGER GROUPS HARDENING

### Goal
Make groups reliable input for operations.

### Scope

- create/edit/delete group;
- canonical departure passenger membership;
- visual color/identity;
- preferences;
- lock/manual semantics where needed;
- cross-departure/org protection;
- safe passenger removal behavior.

### Do not

- implement automatic seating/rooming in same task.

### Acceptance

Groups are stable and can be consumed by later algorithms.

---

## M09 — MANUAL ROOMING WORKSPACE

### Goal
Provide reliable human-controlled room assignment before automation.

### Scope

- room slots derived from departure allotments;
- compatible traveler pool;
- drag/select assignment;
- capacity/type validation;
- requirement compatibility;
- unassigned traveler visibility;
- manual/locked assignments;
- optional physical room number.

### Do not

- automatic rooming.

### Acceptance

Manual rooming handles complete departure without invalid state.

---

## M10 — AUTOMATIC ROOMING

### Goal
Create reviewable rooming proposals.

### Scope

- preserve locked/manual;
- respect purchased room requirements;
- group-aware preference;
- capacity safe;
- deterministic proposal;
- stale proposal/conflict protection;
- explicit unresolved list;
- apply only after review.

### Acceptance

No invalid assignment; no silent override of manual work.

---

## M11 — VEHICLE / MANUAL BUS SEATING

### Goal
Stabilize the bus operational model before automation.

### Scope

- departure vehicle assignment;
- real capacity/seat layout;
- canonical passenger seat assignment;
- locked/manual seats;
- unassigned passenger list;
- correct behavior only on road-transport departures.

### Do not

- auto seating yet;
- flight seat map.

### Acceptance

Manual seating can complete a bus departure safely.

---

## M12 — GROUP-AWARE AUTOMATIC BUS SEATING

### Goal
Assign seats automatically in a useful agency manner.

### Scope

```text
locked/manual
→ groups
→ remaining travelers
```

- adjacency/closest-possible rule;
- split-group warning;
- deterministic proposal/apply;
- capacity/conflict safety.

### Acceptance

Groups are prioritized, solo travelers filled afterward, manual work preserved.

---

## M13 — FLIGHT OPS + TRAVELER MANIFEST READINESS

### Goal
Connect flight data to the departure and travelers.

### Scope

- outbound/return/segment flight records;
- carrier/number/airports/times;
- departure linkage;
- passenger readiness view;
- missing document indicators;
- supplier/PNR note fields only if supported by current domain.

### Do not

- emulate airline seat maps;
- implement GDS integration.

### Acceptance

Flight departure shows real legs and traveler readiness without unrelated bus UX.

---

## M14 — PAYMENTS / INSTALLMENTS CANONICALIZATION

### Goal
Make customer receivables understandable and reliable.

### Scope

- booking total;
- installments/payment schedule;
- payment records;
- paid/remaining;
- status derived consistently;
- cancellation/refund gaps documented;
- reservation/departure finance visibility.

### Do not

- supplier payables;
- accounting integration.

### Acceptance

Total = paid + remaining with auditable payment history.

---

## M15 — OPERATIONAL DOCUMENTS

### Goal
Generate documents from authoritative state.

### Scope

- contract;
- voucher;
- invoice/receipt where current domain supports it;
- passenger manifest;
- rooming list PDF/Excel;
- bus/flight lists where appropriate.

### Do not

- invent jurisdiction-specific fiscal rules.

### Acceptance

Generated document matches current reservation/departure data and regenerates consistently.

---

## M16 — SUPPLIER SERVICE CONFIRMATIONS

### Goal
Ensure the agency can see whether sold services are actually secured.

### Scope

- service booking/confirmation status;
- supplier requests/notes/history;
- departure readiness impact;
- hotel/transport/activity confirmation examples;
- bulk/summary visibility.

### Do not

- supplier finance yet;
- automatic external integrations unless already configured.

### Acceptance

Staff can identify unconfirmed required services before departure.

---

## M17 — COMMUNICATION WORKFLOW CONNECTION

### Goal
Connect existing Communication Center to customer/reservation/departure work.

### Scope

- contextual recipients;
- passenger/group/departure targeting;
- templates/history;
- reminders from real state;
- sender settings;
- safe recipient boundaries.

### Acceptance

Communication is reachable from the trip/booking context and recipient resolution is safe.

---

## M18 — TODAY / TRIP READINESS

### Goal
Turn operational state into actionable work.

### Scope

Readiness signals only from real data:

- missing traveler documents;
- overdue balances;
- incomplete rooming;
- incomplete bus seating;
- unconfirmed suppliers;
- upcoming departures;
- capacity warnings.

### Acceptance

Every alert links to the exact action/context needed to resolve it.

---

## M19 — INQUIRY → QUOTE → BOOKING CONNECTION

### Goal
Complete the sales lifecycle for DMC/tailor-made agencies without slowing fixed package sales.

### Scope

- inquiry conversion;
- itinerary/version relationship;
- quote/pricing state;
- accepted quote conversion without duplicate data entry;
- capability-aware availability of workflow.

### Do not

- force quotes into fixed New Sale.

---

## M20 — SUPPLIER PAYABLES + TRIP PROFITABILITY

### Goal
Add the supplier side of finance.

### Scope

- supplier cost/payable;
- due/payment status;
- currency snapshot;
- trip cost rollup;
- revenue vs cost margin.

### Acceptance

Director can see customer receivables separately from supplier liabilities and margin.

---

## M21 — PUBLIC BOOKING ENGINE / EMBEDS

### Goal
Expose selected products externally using the same business rules as internal booking.

### Scope

- public trip availability;
- embeddable website flow;
- booking request/booking mode explicitly defined;
- canonical capacity/inventory/pricing APIs;
- WordPress-friendly embedding.

### Do not

- duplicate booking logic in frontend widget;
- bypass agency review for inquiry-style forms.

---

## M22 — GLOBAL SEARCH + NAVIGATION CLEANUP

### Goal
Make Travline easy to operate without learning database structure.

### Scope

- useful global search;
- work-based navigation;
- capability-aware visibility;
- remove only proven duplicate/dead navigation.

### Do not

- broad visual redesign.

---

## M23 — FULL BS/EN PRODUCT AUDIT

### Goal
Remove mixed-language UX after core workflows stabilize.

### Scope

- route-by-route audit;
- errors/loading/empty/modals;
- date/number/currency formatting;
- parity tests.

### Do not

- combine with functional redesign.

---

## M24 — GOLDEN E2E + PRODUCTION HARDENING

### Goal
Prove the complete supported flow end to end.

### Golden scenarios

At minimum:

1. **Bus group tour** — package → bus departure → passengers → group → accommodation → payments → manual/auto seating → rooming → documents.
2. **Flight group tour** — package → flight departure → travelers → passport readiness → accommodation → payments → flight manifest → rooming.
3. **Tailor-made/DMC** — inquiry → itinerary/quote → booking → suppliers → travelers → payments → operations.

### Acceptance

- deterministic seed;
- tenant safety;
- browser E2E;
- no major console/runtime errors;
- auth/session smoke;
- `/api/health`;
- no secrets in client bundle;
- recovery/error states tested.

---

# 27. TASK EXTRACTION TEMPLATE

When creating a prompt from this Master Plan, use this structure:

```text
TRAVLINE — <TASK NAME>

ACTIVE TASK:
Mxx — <exact task>

READ FIRST:
- AGENTS.md
- docs/PRODUCT.md
- docs/ARCHITECTURE.md
- TRAVLINE_MASTER_PLAN_2_0.md

IMPORTANT:
The Master Plan is CONTEXT ONLY.
Implement ONLY Mxx.
Do not implement later tasks.

CURRENT BASE:
<branch / SHA>

GOAL:
<copy task goal>

IN SCOPE:
<copy only relevant scope>

OUT OF SCOPE:
<copy do-not section + project-wide no-scope-expansion rules>

AUDIT FIRST:
Inspect current implementation and report conflicts before broadening scope.

IMPLEMENTATION:
<task-specific requirements>

TESTS:
<focused test requirements>

BROWSER ACCEPTANCE:
<exact manual flow>

DO NOT:
- modify unrelated modules
- fix newly discovered issues without approval
- change deployment architecture
- expose secrets
- edit applied migrations
- merge automatically

RETURN:
- old SHA
- new SHA
- exact files changed
- migrations
- tests/build/CI
- browser verification
- known/deferred issues
- READY FOR REVIEW: YES/NO

STOP.
```

This template is intentionally repetitive. Repetition protects scope when a task is extracted from the larger roadmap.

---

# 28. ORDER OF EXECUTION

Recommended sequence:

```text
M00 Baseline
↓
M01 Transport/package/departure model
↓
M02 Capacity
↓
M03 New Sale structure
↓
M04 Accommodation sale
↓
M05 Add-ons
↓
M06 Traveler readiness
↓
M07 Reservation detail
↓
M08 Groups
↓
M09 Manual rooming
↓
M10 Automatic rooming
↓
M11 Manual bus seating
↓
M12 Automatic seating
↓
M13 Flight Ops
↓
M14 Customer payments
↓
M15 Documents
↓
M16 Supplier confirmations
↓
M17 Communications connection
↓
M18 Today/readiness
↓
M19 Inquiry/quote integration
↓
M20 Supplier finance/profitability
↓
M21 Public booking/embeds
↓
M22 Search/navigation
↓
M23 i18n audit
↓
M24 Golden E2E / hardening
```

This order may change only when a task audit proves a dependency is already complete or a prerequisite is missing. Do not reorder merely because another feature looks interesting.

---

# 29. DEFINITION OF DONE FOR TRAVLINE 2.0 CORE

The group-tour core is operationally complete when an agency can do this without developer intervention:

```text
Create product/package
→ configure hotel/service offering
→ create dated departure
→ choose concrete transport operating option
→ materialize capacity and accommodation inventory
→ create reservation
→ add customer + travelers
→ sell valid accommodation/add-ons
→ create payment schedule
→ follow missing traveler information
→ create/manage groups
→ operate bus seating OR flight readiness as relevant
→ room travelers
→ confirm suppliers
→ generate manifests/documents
→ communicate with travelers
→ see remaining work before departure
→ execute the trip
→ reconcile customer and supplier money
```

If the user must re-enter the same information in disconnected modules, if operational lists cannot be produced from the booking state, or if critical capacity/inventory rules can be bypassed, the workflow is not complete.

---

# 30. RESEARCH BASIS / DESIGN RATIONALE

This plan intentionally follows patterns visible in mature travel-operation platforms:

- booking, traveler and payment data should be connected rather than maintained across separate tools;
- passenger/traveler manifests are an operational output of bookings;
- participant/traveler information can be collected as tasks before departure instead of all being mandatory at checkout;
- supplier booking requests and confirmation statuses are a core post-sale operation;
- rooming, bus and flight lists are operational outputs for group travel;
- supplier/customer finance and profitability become separate layers after the booking core is stable;
- website booking/intake should reuse the same underlying availability/booking model.

The aim is not to copy another product. The aim is to ensure Travline's workflow reflects how travel agencies actually move from sale to delivery, while remaining simple enough for smaller Balkan agencies and extensible enough for DMC/tour-operator use.

---

# 31. FINAL RULE

**Travline should ask a user for a decision only when that decision is genuinely unresolved.**

If package/departure context already determines transport, do not ask for transport again.  
If a departure has no accommodation, do not show accommodation.  
If a trip does not require passport data yet, do not block the booking.  
If a traveler already belongs to a reservation/departure, reuse that identity.  
If inventory already knows availability, do not allow an impossible selection.  
If the system knows something is incomplete, show the staff what action is still required.

That principle should guide every future Travline task.
