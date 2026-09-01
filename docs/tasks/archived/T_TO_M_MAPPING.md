# T01–T38 → M00–M24 Mapping

**Date:** 2026-09-01
**Source:** Master Plan 2.0 alignment audit

This maps the old task decomposition (T01–T38 from `TRAVLINE_MASTER_ZAHTJEVI`, 42 sections) to the new canonical M-task structure (`TRAVLINE_MASTER_PLAN_2_0.md`, M00–M24).

| T-task | Description | Maps to | Verdict |
|---|---|---|---|
| T01 | Package CRUD | M01 | MAP (fold into canonicalization) |
| T02 | Hotel catalog CRUD | M01 / M04 / M09 | MAP |
| T03 | Transport types | M01 | MAP |
| T04 | Package accommodation (hotels + room options) | M04 / M01 | MAP |
| T05 | Package variants | — | **SUPERSEDED** (no "variants" abstraction in M-plan; separated into explicit accommodation/transport) |
| T06 | Package → Departure materialization | M01 | MAP |
| T07 | Departure inventory override | M01 | MAP |
| T08 | Reservation / New Sale CRUD | M03 | MAP |
| T09 | Progressive disclosure | M03 | MAP |
| T10 | Flight package — travel documents | M06 / M13 | MAP |
| T11 | Bus international — travel documents | M06 | MAP |
| T12 | Package-driven accommodation selection | M04 | MAP |
| T13 | Optional services | M05 | MAP |
| T14 | Reservation accommodation requirements | M04 | MAP |
| T15 | Edit reservation — atomic inventory | M03 / M04 | MAP |
| T16 | Passengers | M06 / M07 | MAP |
| T17 | Passenger groups (društva) | M08 | MAP |
| T18 | Accommodation inventory | M04 / M09 / M10 | MAP |
| T19 | Operational room slots | M02 / M09 | MAP |
| T20 | Manual rooming | M09 | MAP |
| T21 | Rooming validations | M09 | MAP |
| T22 | Automatic rooming | M10 | MAP |
| T23 | Final rooming list | M09 / M10 | MAP |
| T24 | Bus / vehicle | M01 | MAP |
| T25 | Automatic bus seating | M12 | MAP |
| T26 | Flight Ops + passenger travel data | M13 | MAP |
| T27 | Payments / installments | M14 | MAP |
| T28 | Document generation | M15 | MAP |
| T29 | Email/SMS | M17 | MAP |
| T30 | Newsletter / reminders / campaigns | M17 | MAP |
| T31 | Public forms & embeds | M21 | MAP |
| T32 | Dashboard & global search | M18 / M22 | MAP (split across two M-tasks) |
| T33 | Inquiries / leads | M19 | MAP |
| T34 | i18n parity | M23 | MAP |
| T35 | UI polish | M03–M18 | MAP (distributed; each M-task carries own polish) |
| T36 | Integrations foundation | — | **NO LONGER NEEDED** (deferred out of M-plan scope) |
| T37 | Golden E2E dataset | M24 | MAP (subset — golden seed is part of E2E hardening) |
| T38 | Agency demo accounts + onboarding | M24 | MAP (subset — onboarding is part of E2E hardening) |

**Summary:** 38 tasks → 34 MAP, 1 SUPERSEDED (T05), 1 NO LONGER NEEDED (T36), 2 split (T32→M18+M22).

All old T-task phase files (`01-core-crud.md` through `15-e2e-production.md`) and `INDEX.md` are preserved in this archive directory. `TRAVLINE_MASTER_PLAN_2_0.md` is now the canonical roadmap.
