# Travline — Canonical Roadmap

**Purpose:** prioritized product backlog and verification list. This is planning context, not an instruction to implement everything at once.

## Status legend

- `DONE` — confirmed completed; do not rebuild unless a regression is demonstrated.
- `PARTIAL` — meaningful implementation exists, but the end-to-end product workflow still needs completion/verification.
- `VERIFY` — reported as missing/incomplete at some point; current code must be audited before deciding whether work remains.
- `ACTIVE` — an explicit current initiative exists.
- `DEFERRED` — intentionally postponed.

Before turning any roadmap item into code, create a scoped spec under `docs/tasks/active/`.

---

## P0 — Development and deployment foundation

### P0.1 GitHub as source of truth — ACTIVE

Goal: every development environment/host consumes the same canonical GitHub code.

Acceptance direction:

- Codex works through feature branches/PRs;
- CI verifies changes;
- Vercel independently hosts the GitHub version (frontend + API);
- ZO remains an independent alternative runtime/hosting path;
- Vercel must not depend on the ZO backend once independent deployment work is complete;
- returning to ZO means syncing ZO to the desired GitHub `main` commit and rebuilding/restarting.

### P0.2 Vercel full-stack independence — ACTIVE

Infrastructure work exists separately to make the Vercel deployment run the Travline admin + API without proxying through ZO. Complete and verify before treating Vercel as an independent runtime.

### P0.3 Codex operating workflow — ACTIVE

- canonical `AGENTS.md`;
- product canon;
- architecture canon;
- this roadmap;
- one scoped active task spec per implementation unit;
- branch → CI → Vercel Preview → review → merge.

---

## P1 — Core reservation / traveler operations

### P1.1 Passenger management — VERIFY

Reported product gaps to audit:

- create passenger directly in the appropriate departure/reservation workflow;
- edit passenger cleanly from operational context;
- safe delete passenger;
- dependency cleanup/handling for seat, passenger group, rooming/allocation and other traveler references;
- clear distinction between customer, reservation and passenger;
- useful passenger detail/edit UI rather than hidden backend-only capability.

### P1.2 Contextual passenger data — VERIFY

- do not require irrelevant nationality/passport fields for every trip;
- document requirements should follow trip/transport context;
- flight/international workflows may require passport/authority/validity data;
- missing-data warnings should be operationally meaningful.

### P1.3 Passenger ↔ reservation navigation — VERIFY

- open the commercial reservation from a passenger;
- open passengers from the reservation;
- preserve departure context when navigating from the trip workspace;
- avoid dead-end detail screens.

---

## P2 — Package, departure and transport model

### P2.1 Package can combine services — VERIFY

A package/product must support combinations such as:

- hotel + bus;
- hotel + flight;
- transfers;
- excursions/activities;
- optional services;
- other reusable service combinations.

Audit current `package_services`, package hotels/room options and related UI before adding new models.

### P2.2 Package → departure inheritance — VERIFY

Target behavior:

- departure inherits relevant package defaults;
- inherited hotel/transport/service configuration is understandable;
- creation workflow does not require duplicate manual entry where defaults exist.

### P2.3 Departure-specific override — VERIFY

A dated departure must be able to override operational choices such as vehicle/hotel/flight without mutating the reusable package for every other departure.

### P2.4 Transport resource model — VERIFY

Audit whether Travline has a complete usable model for:

- buses/vehicles/transport resources;
- capacity;
- concrete assignment to a departure;
- operational transport details;
- connection to seating and departure readiness.

---

## P3 — Passenger groups and seating

### P3.1 Passenger Groups workflow — PARTIAL

Known foundations exist. End-to-end audit must cover:

- creating/editing groups;
- adding/removing members safely;
- unassigned passengers;
- visual group colors/identity;
- group preferences;
- departure boundary safety;
- clear operational use in seat/room workflows.

### P3.2 Automatic bus seating — VERIFY

Target behavior:

- optional automatic seat assignment for bus departures;
- respect actual capacity/seat map;
- avoid assigning unavailable seats;
- deterministic/conflict-safe behavior where practical.

### P3.3 Keep groups together — VERIFY

Automatic seating should try to keep a passenger group together and clearly flag when the group must be split.

### P3.4 Manual split-group visibility — VERIFY

The UI should clearly show when members of one group are separated by seating and, where relevant, accommodation.

### P3.5 Flight seating rule — VERIFY

Travline should not expose bus-style agency seat assignment for flight-only departures merely because a generic seat-map component exists. Audit current behavior and align it with the actual flight product workflow.

---

## P4 — Accommodation and rooming

### P4.1 Departure hotel allocation — PARTIAL

Known accommodation/hotel allocation foundations exist. Verify that a departure can operationally configure the real hotel/room allocation used for that date rather than merely display package information.

### P4.2 Rooming workspace — VERIFY

The operational UI should make it easy to understand:

- rooms / room types;
- capacities;
- assigned travelers;
- unassigned travelers;
- full/available state;
- moving travelers between rooms;
- group relationships.

### P4.3 Automatic rooming — VERIFY

Target behavior:

- optional automatic room assignment;
- enforce room capacity;
- respect room-type constraints/preferences;
- try to keep groups/parties together;
- report unresolved conflicts rather than silently making invalid allocations.

### P4.4 Rooming error semantics — VERIFY

Known historical polish item: capacity is enforced but some full-room conflicts may surface as coarse HTTP 500 rather than a clean conflict response. Re-audit before fixing.

---

## P5 — Flights and traveler readiness

### P5.1 Flight Operations foundation — PARTIAL

Flight Operations 2.0 core exists in recent project history. Do not rebuild it wholesale. Audit current UX/domain completeness first.

### P5.2 Flight traveler readiness — VERIFY

The departure workspace should make relevant readiness clear:

- traveler has/does not have required passport data;
- validity/expiry issues according to configured rules;
- missing flight-required information;
- no irrelevant warning on trips that do not require it.

### P5.3 Flight workflow UX — VERIFY

Ensure flight data is connected to package/departure/passenger workflows rather than functioning as an isolated page.

---

## P6 — Communication Center

### P6.1 Communication Center 2.0 — PARTIAL

A substantial implementation exists. Before new work, audit the current branch/main history and current code.

Completion audit should cover:

- manual email/SMS/channel sending supported by configured providers;
- sender settings per organization;
- templates;
- safe recipient resolution;
- departure/group targeting without cross-departure leakage;
- communication history;
- campaigns/automation where intended;
- channel constraints such as SMS length UX;
- BS/EN UI parity;
- usable navigation and departure/customer context integration.

### P6.2 Communication provider boundaries — VERIFY

External email/SMS/etc. providers should be replaceable behind clear service boundaries and secrets must remain server-side.

---

## P7 — Public Forms and intake

### P7.1 Public Forms product integration — DONE / REVERIFY REGRESSIONS ONLY

Recent `main` includes Public Forms product integration covering navigation/usability/permissions/handler wiring. Do not rebuild it because an older complaint said the feature was hidden.

### P7.2 Submission → inquiry workflow — VERIFY

Audit that request-style public form submissions enter the intended inquiry/sales workflow with source/context and do not bypass review by creating inappropriate reservations/customers automatically.

### P7.3 Share/copy/use workflow — VERIFY

Confirm agency staff can create/manage a form, obtain/share its public link, and understand submissions from the normal Travline UI.

---

## P8 — Dashboard, navigation and daily work

### P8.1 Today / Needs Attention — PARTIAL

The operating-system redesign introduced a Today queue. Re-audit against the desired operational signals:

- inquiries/follow-ups;
- payment exceptions/outstanding balances;
- upcoming departures;
- missing traveler data/documents;
- unassigned seat/group/room state where relevant;
- supplier/operational confirmation state when the domain supports it.

Only show alerts derived from real data.

### P8.2 HomeHub/navigation cleanup — VERIFY

Reported concerns:

- duplicate/confusing navigation;
- isolated module pages;
- legacy NMT Analytics structure that does not match travel-agency work;
- integrations/settings placement.

Do not do another broad visual refactor. Make navigation changes incrementally and capability-aware.

### P8.3 Integrations workspace — VERIFY

Audit whether the current Integrations page reflects real supported integrations and configuration. Remove/rework fake, duplicate, placeholder or misleading integration UX only through a scoped task.

### P8.4 Global search / quick actions — PARTIAL / VERIFY

Quick-create exists in the operating-system redesign. Audit the remaining need for useful global search and context-aware quick actions.

---

## P9 — Internationalization and UX consistency

### P9.1 Full BS/EN audit — VERIFY

Reported recurring issue: some screens/labels switch languages or leave untranslated strings.

Required eventual audit:

- route by route;
- modal/form/error/empty/loading copy;
- no hardcoded Bosnian leaking into EN;
- no hardcoded English leaking into BS;
- interpolation/plural/formatting where relevant.

Do not attempt a blind mechanical replacement across the whole UI without tests/browser verification.

### P9.2 One-page-at-a-time UX rule — ACTIVE POLICY

A previous broad UX refactor passed builds but visibly damaged layout/formatting and was reverted. All future visual work must be scoped and browser-verified one workflow/page at a time.

---

## P10 — End-to-end quality and production hardening

### P10.1 Browser E2E of core workflow — VERIFY

Eventually verify as one connected flow:

```text
Inquiry/Customer
→ Reservation
→ Passenger
→ Passenger Group
→ Seat/Transport
→ Accommodation/Rooming
→ Documents/readiness
→ Payment state
→ Communication
```

Use trip-type-specific branches; not every trip needs every step.

### P10.2 Auth/session regression suite — DONE / PROTECT

The reload-loop issue was previously fixed and verified. Preserve it and add regression coverage when touching auth. Do not reopen auth without evidence of a new regression.

### P10.3 Production smoke — ACTIVE POLICY

After production-impacting deployment:

- verify `/api/health`;
- verify database connected;
- verify sign-in and at least one protected API route;
- verify hard refresh on authenticated routes;
- inspect server/runtime errors;
- verify no secret leaked to browser bundle.

### P10.4 Security/tenant final pass — ACTIVE POLICY

Every product slice must preserve tenant isolation; a later security audit does not excuse insecure intermediate work.

---

## P11 — Longer-term Travline Operating System roadmap

The broader strategic phases remain in:

`docs/plans/2026-08-18-travline-operating-system-redesign.md`

They include:

- supplier/service catalogue;
- itinerary versions;
- quotations and conversion;
- trip workspace expansion;
- supplier confirmations/tasks;
- receivables/payables/reconciliation;
- trip P&L;
- contracted inventory/allotments;
- B2B distribution;
- regional compliance;
- GDS/bedbank/payment/accounting integrations.

Do not let these long-term phases distract from completing the P1–P10 operational gaps above.

---

## First Codex action

Do **not** start implementing this roadmap immediately.

The first active Codex task is:

`docs/tasks/active/000-baseline-roadmap-audit.md`

Its job is to inspect the current repository and convert `VERIFY/PARTIAL` assumptions into evidence-based status before feature work begins.
