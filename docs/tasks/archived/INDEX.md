# Travline — Task Breakdown

This splits `TRAVLINE_MASTER_ZAHTJEVI` (42 sections) into **atomic, self-contained tasks** so each one can be implemented in a single Zo/Codex turn without hitting the `max_tokens` cutoff.

## How to use

1. Pick ONE task from the list below.
2. Tell Zo/Codex: `Implement <TASK_ID> from docs/tasks/<phase-file>.md` (or paste the task block).
3. One task = one branch = one PR. Do not bundle tasks.
4. Copy the chosen task's block into `docs/tasks/active/<TASK_ID>-<slug>.md` before starting (see root `AGENTS.md` §10).

## Global rules

Every task inherits the repo invariants (see root `AGENTS.md`). Summary:

- Multi-tenant: scope every tenant-owned read/write to the authenticated org; never trust browser `org_id`. Cross-org access = release-blocking.
- GitHub `main` is source of truth; one task = one branch = one PR; never develop on `main`.
- Append-only migrations; no destructive migration without a rollback plan.
- i18n BS/EN parity; no hardcoded user-facing strings.
- Change only screens required by the task; no broad redesigns.
- Verify: API build+test, admin lint+test+build, browser-verify user-facing flows. Green build ≠ verified UI.

## Development order (from §41)

```
Phase 1 Core CRUD/save → Phase 2 Package/Transport → Phase 3 Departure
→ Phase 4 Smart Reservation → Phase 5 Passengers/Groups
→ Phase 6 Accommodation inventory → Phase 7 Rooming → Phase 8 Seating
→ Phase 9 Flight Ops → Phase 10 Payments → Phase 11 Documents
→ Phase 12 Communications → Phase 13 Public/Discoverability
→ Phase 14 Polish → Phase 15 E2E/Production hardening
```

## Task index

| ID | Task | Phase | File |
|----|------|-------|------|
| T01 | Package CRUD | Phase 1 — Core CRUD / save | `01-core-crud.md` |
| T02 | Hotel catalog CRUD | Phase 1 — Core CRUD / save | `01-core-crud.md` |
| T03 | Transport types | Phase 1 — Core CRUD / save | `01-core-crud.md` |
| T04 | Package accommodation (hotels + room options) | Phase 2 — Package accommodation & variants | `02-package-transport.md` |
| T05 | Package variants | Phase 2 — Package accommodation & variants | `02-package-transport.md` |
| T06 | Package → Departure materialization | Phase 3 — Departure inheritance | `03-departure.md` |
| T07 | Departure inventory override | Phase 3 — Departure inheritance | `03-departure.md` |
| T08 | Reservation / New Sale CRUD | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T09 | Progressive disclosure | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T10 | Flight package — travel documents | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T11 | Bus international — travel documents | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T12 | Package-driven accommodation selection | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T13 | Optional services | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T14 | Reservation accommodation requirements | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T15 | Edit reservation — atomic inventory | Phase 4 — Smart Reservation flow (§10 core) | `04-smart-reservation.md` |
| T16 | Passengers | Phase 5 — Passengers & groups | `05-passengers-groups.md` |
| T17 | Passenger groups (društva) | Phase 5 — Passengers & groups | `05-passengers-groups.md` |
| T18 | Accommodation inventory | Phase 6 — Accommodation inventory | `06-accommodation-inventory.md` |
| T19 | Operational room slots | Phase 7 — Rooming | `07-rooming.md` |
| T20 | Manual rooming | Phase 7 — Rooming | `07-rooming.md` |
| T21 | Rooming validations | Phase 7 — Rooming | `07-rooming.md` |
| T22 | Automatic rooming | Phase 7 — Rooming | `07-rooming.md` |
| T23 | Final rooming list | Phase 7 — Rooming | `07-rooming.md` |
| T24 | Bus / vehicle | Phase 8 — Seating | `08-seating.md` |
| T25 | Automatic bus seating | Phase 8 — Seating | `08-seating.md` |
| T26 | Flight Ops + passenger travel data | Phase 9 — Flight Ops | `09-flight-ops.md` |
| T27 | Payments / installments | Phase 10 — Payments | `10-payments.md` |
| T28 | Document generation | Phase 11 — Documents | `11-documents.md` |
| T29 | Email/SMS | Phase 12 — Communications | `12-communications.md` |
| T30 | Newsletter / reminders / campaigns | Phase 12 — Communications | `12-communications.md` |
| T31 | Public forms & embeds | Phase 13 — Public & discoverability | `13-public-discoverability.md` |
| T32 | Dashboard & global search | Phase 13 — Public & discoverability | `13-public-discoverability.md` |
| T33 | Inquiries / leads | Phase 13 — Public & discoverability | `13-public-discoverability.md` |
| T34 | i18n parity | Phase 14 — Polish | `14-polish.md` |
| T35 | UI polish | Phase 14 — Polish | `14-polish.md` |
| T36 | Integrations foundation | Phase 14 — Polish | `14-polish.md` |
| T37 | Golden E2E dataset | Phase 15 — E2E / production hardening | `15-e2e-production.md` |
| T38 | Agency demo accounts + onboarding | Phase 15 — E2E / production hardening | `15-e2e-production.md` |

## Master-section → task map

- §3 → T01
- §4 → T02, T04
- §5 → T06, T07
- §6 → T06
- §7 → T14
- §8 → T18
- §9 → T08
- §10.1 → T09
- §10.2 → T10
- §10.3 → T11
- §10.4 → T12
- §10.5 → T13
- §11 → T14
- §12 → T15
- §13 → T16
- §14 → T17
- §15 → T25
- §16 → T24
- §17 → T26
- §18 → T20
- §19 → T19
- §20 → T21
- §21 → T22
- §22 → T23
- §23 → T27
- §24 → T28
- §25 → T29
- §26 → T30
- §27 → T31
- §28 → T32
- §29 → T33
- §30 → T05
- §31 → T03
- §32 → T34
- §33 → T35
- §34 → T36
- §35 → T37
- §36 → T37
- §37 → T38
- §38 → T38
- §1 → (context)
- §2 → (all tasks)
- §39 → (all tasks)
- §40 → (all tasks)
- §41 → (this order)
- §42 → (all tasks)
