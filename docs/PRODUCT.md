# Travline — Product Canon

**Purpose:** stable product definition for humans and coding agents. This file explains what Travline is and how its workflows should fit together. It is not a sprint log.

## 1. What Travline is

Travline is a cloud operating system / CRM for travel agencies and tour operators. It should let an agency manage the commercial and operational lifecycle of travel from the first customer request through booking, traveler handling, trip execution, finance, communication, and reporting.

Target operating models:

- retail travel agencies;
- fixed group-tour organizers;
- DMC / incoming and tailor-made travel agencies;
- tour operators with contracted inventory and B2B distribution.

The product should adapt capabilities and navigation to the agency's operating model rather than expose every module to every user.

## 2. Product principles

1. **One connected workflow, not isolated pages.** Hotels, flights, passengers, payments, documents, communication, transport, and rooming are stages/data of the same trip lifecycle.
2. **Operations are context-driven.** Requirements depend on the trip. A bus departure needs seating; a flight needs travel-document readiness; accommodation needs rooming; irrelevant fields should not be mandatory.
3. **No duplicate entry.** Data collected at inquiry, quote, reservation, customer, or passenger level should flow forward where appropriate.
4. **Agency work first.** Navigation and dashboards should describe work to be done, not merely database entities.
5. **Cloud and device independent.** Authorized staff should be able to work from supported browsers/devices without a local-office dependency.
6. **Multi-tenant by design.** Each organization sees only its own data and configuration.
7. **Bosnian and English are first-class.** Product workflows must remain coherent in both languages.
8. **Operational readiness should be visible.** Staff should know what is missing before a departure becomes a problem.

## 3. Core lifecycle

The target lifecycle is:

```text
Inquiry
  ↓
Customer / opportunity context
  ↓
Product, package or tailor-made itinerary
  ↓
Quotation / pricing
  ↓
Reservation / booking
  ↓
Passengers / travelers
  ↓
Payments and documents
  ↓
Departure / trip workspace
  ↓
Transport + groups + seating
  ↓
Accommodation + rooming
  ↓
Flights / traveler readiness where relevant
  ↓
Communication + operational documents
  ↓
Trip execution
  ↓
Reconciliation / reporting
```

Not every trip uses every stage. Capabilities and trip configuration determine the relevant workflow.

## 4. Major product domains

### Sales

- inquiries and lead pipeline;
- customers;
- packages/products;
- departures;
- quotations and itinerary work where enabled;
- reservations/bookings;
- public forms / website intake.

### Traveler management

- passengers/travelers linked to the correct reservation/departure context;
- personal and contact information;
- contextual travel documents;
- group/party relationships;
- missing-data/readiness warnings.

### Transport operations

- transport type and concrete transport resource where relevant;
- bus/vehicle capacity and configuration;
- seat maps for modes where Travline controls seating;
- group-aware/manual/automatic seating;
- pickup and operational transport information as the product evolves.

A flight is not treated like a Travline-controlled bus seat map unless a specific workflow requires it.

### Accommodation operations

- hotels and departure-level allocations;
- room types and capacities;
- rooming lists;
- manual and, where implemented, automatic room assignment;
- group-together preferences and clear split-group warnings.

### Flight and document readiness

- flight records and departure flight context;
- passport/travel-document information only when relevant;
- warnings for missing/expired/expiring data according to the configured workflow;
- no unnecessary nationality/passport burden on unrelated domestic/simple trips.

### Communication

- organization sender settings;
- direct/manual messages;
- reusable message templates;
- campaigns/automation where enabled;
- communication history tied to the relevant customer/reservation/departure context;
- safe recipient resolution with tenant and departure boundaries.

### Finance

Current and evolving scope includes:

- reservation totals;
- installments and customer payments;
- receipts/invoices/contracts;
- outstanding balances;
- future supplier payables, reconciliation and trip profitability according to roadmap.

### Documents

- contracts;
- vouchers;
- invoices/receipts;
- manifests and rooming/operational lists;
- traveler documents and waivers where enabled;
- PDF generation must use the same authoritative trip/reservation data rather than duplicate business state.

## 5. Package and departure relationship

A package/product defines reusable defaults. A departure is a dated operational instance.

Target behavior:

- a departure should inherit relevant package defaults such as accommodation, services and transport configuration where the domain supports it;
- a departure may override operational choices for that specific date without mutating the reusable package;
- overrides must be explicit and understandable in the UI;
- a package may combine services such as hotel + bus, hotel + flight, excursions, transfers or other services rather than being constrained to one service type.

## 6. Reservation, passenger and departure relationship

A reservation is the commercial booking. Passengers/travelers are the people traveling. A departure is the operational trip instance.

The system should make these relationships easy to navigate in both directions:

- reservation → passengers;
- passenger → reservation;
- reservation → departure;
- departure → reservation list/passenger manifest;
- passenger → group/seat/room/document readiness where relevant.

Actions that remove or move a passenger must safely handle dependent seat, group, rooming and other operational relationships according to explicit rules.

## 7. The departure / trip workspace

The departure detail should evolve as the operational workspace for a dated group/trip rather than spawning disconnected operational screens.

A mature workspace should make the following state understandable from one context:

- capacity and traveler count;
- reservations and passengers;
- groups/parties;
- transport and seating;
- accommodation and rooming;
- flights and traveler-document readiness;
- payment exposure;
- communications;
- operational documents;
- supplier confirmations/tasks as those roadmap phases mature.

## 8. Dashboard / Today philosophy

The main authenticated landing experience should prioritize work requiring attention, such as:

- new inquiries/follow-ups;
- unpaid or overdue balances according to real data;
- missing traveler information/documents;
- unassigned passengers/groups/seats/rooms where relevant;
- upcoming departures with readiness problems;
- unconfirmed operational items.

Do not invent deadlines or alerts that are not supported by actual data.

## 9. Public intake philosophy

Public forms are an intake channel into Travline, not an uncontrolled shortcut around agency review.

Where a submission represents a request/inquiry, it should enter the appropriate inquiry/sales workflow with source/context preserved. It should not silently create commercial commitments unless that specific public booking flow is designed and validated to do so.

## 10. Product quality bar

A feature is not product-complete merely because the endpoint exists.

For a user-facing workflow, completion normally includes:

- correct domain behavior;
- tenant safety;
- usable UI entry point/navigation;
- loading/empty/error states;
- BS/EN parity;
- responsive behavior where the existing product supports it;
- relevant automated tests;
- browser-level workflow verification where tooling permits.

## 11. What Travline should avoid

- disconnected feature pages with no trip/reservation context;
- duplicated domain models for the same concept;
- mandatory fields that are irrelevant to the configured trip;
- broad visual redesigns mixed into functional work;
- leaking one organization's records into another;
- frontend-only business rules that can be bypassed;
- hiding incomplete functionality behind a green TypeScript build;
- treating deployment environments as separate versions of the source code.

## 12. Longer-term direction

The canonical long-term operating-system redesign remains documented in:

`docs/plans/2026-08-18-travline-operating-system-redesign.md`

That plan includes unified trip files, supplier catalogue, itineraries/quotations, tasks, supplier confirmations, payables, profitability, inventory/distribution, regional compliance, and integrations. Implement those capabilities incrementally through explicit active task specs rather than as one giant rewrite.
