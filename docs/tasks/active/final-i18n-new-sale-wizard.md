# Final I18N-04B — Complete New Sale Wizard BS/EN display

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

**Status:** ACTIVE
**Priority:** P1
**Branch:** `fix/i18n-new-sale-wizard`
**Base:** created from latest origin/main after #151 (`dbb5123`), then fast-forwarded to verified main after #154 (`8cf3f1a`) while preserving/reapplying this focused change. Foundation PRs #151–#154 are merged.

## Goal and confirmed gaps

Translate the existing NewSaleWizard as one conditional workflow: trip, client/travelers, accommodation, optional services, payment and review. The component already uses i18n for sale recovery, but its labels, validation, placeholders, summaries, notifications and formatting are primarily hardcoded Bosnian, with English Add-ons labels mixed in. A stored validation string can retain the previous language after switching.

## Scope and invariants

Preserve layout, step conditions/order, traveler/document rules, package/departure selection, room inventory/passenger mapping, add-on quantities, numeric calculations, payment/installment payloads, capacity/idempotency/recovery behavior and existing stored booking snapshot contract. Translate display strings and accessible labels through the established dictionaries; dates/money follow the selected locale. Keep user-entered names, provider/room names, currency codes, stable API/enumeration values and machine-readable number/date input values intact. No unrelated modules, mutation endpoint, auth, schema or production operations.

Represent displayed validation as a localized key/parameters so a visible error changes language without clearing the draft or changing validation rules. Unknown API failures use localized fallback; existing recognized recovery/capacity code behavior remains. Do not localize persisted snapshot business values implicitly.

## Verification

Add English/Bosnian live-switch regressions, including a visible validation message, entered draft retention, document placeholders, date/money display, conditional steps and unchanged createReservation payload. Make existing Bosnian-focused tests explicitly select Bosnian rather than relying on hardcoded UI; retain all assertions. Run full admin lint/tests/build and browser tests through actual wizard with synthetic transport. Preserve API baseline; run required exact-head CI including isolated acceptance before merge. Keep new authenticated scenarios distinct from executed local fixtures.

## Completion record

Implemented and locally verified: API build/1,009 tests; admin lint (0 errors, 51 existing warnings), 520 tests/build; combined locale browser 19 and shared UI 12 passed. Exact files and detailed evidence are recorded in `docs/TRAVLINE_FINAL_ROADMAP.md`. PR/exact-head CI/merge pending. All remaining domain/locale findings stay open.
