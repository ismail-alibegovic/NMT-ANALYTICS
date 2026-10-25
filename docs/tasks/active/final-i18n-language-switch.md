# Final I18N-03 — Language selection and accessible switch

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

**Status:** IMPLEMENTED LOCALLY — dependency PRs #151/#152 and remote CI pending
**Priority:** P1
**Branch:** `fix/i18n-language-switch`
**Roadmap:** `docs/TRAVLINE_FINAL_ROADMAP.md`, I18N-03; follows I18N-01/02.

## Goal and discovery

Verify and repair shared BS/EN selection without changing authentication or business workflows. Existing provider persists `travline_lang` and updates document language. Confirmed UI gap: AppHeader's switch title is always English. Suspected provider gaps to reproduce first: blocked storage discards the browser's Bosnian preference, and two toggles in the same event use stale state.

## Scope and invariants

Test browser/stored-language fallback, invalid stored preference, blocked read/write, set/toggle operations, batched toggles, document language and persisted reload. Keep existing public provider hooks, supported languages, storage key, visual switch styles and all session/tenant boundaries. Extract the existing switch to a shared component only to exercise the actual control in isolated browser tests; localize its title and accessible name in both dictionaries. No authentication, API, migration, customer data, seed/reset or deployment changes.

## Acceptance / required tests

- Regression tests reproduce both suspected provider defects before any provider changes.
- Stored supported preference wins; invalid/unavailable storage falls back to browser preference; unsupported browser language falls back to English.
- BS/EN set/toggle changes dictionary and document language, persists when possible and remains usable with blocked storage. Batched toggles follow their sequence.
- Actual shared switch has a localized accessible name and title, is a non-submit button, and preserves layout/theme classes.
- Real-browser fixture verifies keyboard activation, live switching, reload persistence and document language in both themes/mobile and desktop.
- Admin lint/full tests/build and dictionary contract pass. API unchanged; prior API baseline retained. Required exact-head remote CI before merge.

## Completion record

Regression baseline: 2 failed/7 passed; corrected provider plus dictionary tests: 26 passed. Full admin: 507 passed, lint zero errors/51 existing warnings, build passed. Shared UI browser: 12 passed (four language-switch and eight existing modal cases). Full evidence and exact files are in the final roadmap. No migration or production actions. [Draft PR #153](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/153) is open; remote CI/integration pending behind #151/#152. Remaining authenticated/public navigation matrix and per-domain literal/formatting work must remain explicit.


Authenticated/public matrix: four guarded localhost-only scenarios added in `e2e/pilot-language.spec.ts`, discovered by the existing staging workflow. They use their own synthetic signup-confirmed accounts, both initial languages/themes, actual UI login/switch/reload/logout, and disabled credential recording. Discovery confirmed four tests; execution awaits isolated CI and must not be described as passed from a list-only command.
