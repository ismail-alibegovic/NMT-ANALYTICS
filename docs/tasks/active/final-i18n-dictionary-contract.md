# Final I18N-02 — Dictionary coverage contract

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

**Status:** IMPLEMENTED LOCALLY — dependency PR #151 and remote CI pending
**Priority:** P1
**Branch:** `fix/i18n-dictionary-contract`
**Roadmap:** `docs/TRAVLINE_FINAL_ROADMAP.md`, I18N-02; depends on PR #151.

## Goal and confirmed gap

Extend existing dictionary parity checks to reject empty translations, incompatible nested value structures and interpolation-token drift across all BS/EN keys. Current tests compare leaf paths and check nonempty text only in the flights section. The baseline audit found matching dictionaries (including one existing callable rooming translation), so this task prevents regressions rather than inventing missing translations.

## Discovery and scope

Inspected i18n context/dictionaries, all existing parity tests, current `{name}` placeholder usage and the advisory inventory. Keep the existing localization API, dictionary shape and identical legitimate shared words. Exercise the checker on defective fixtures so a green production-dictionary check is meaningful. No dependency, product component, runtime, auth, API or schema changes. Hardcoded-string domain repairs remain separate focused PRs; key parity does not certify whole-product translation coverage.

## Acceptance criteria and tests

- Both complete dictionaries pass nonempty-string, nested-structure, positional-array and interpolation-token checks. The existing `operations.rooming.applySuccess(count)` callable retains its API and has explicit zero/singular/large-count output checks; any additional callable requires registered coverage.
- Defective nested fixtures prove missing/extra keys, empty values, non-string leaves, object/array shape mismatches and missing/extra placeholders are rejected with exact paths.
- Reordered/repeated placeholders, Bosnian diacritics and legitimate identical labels remain accepted.
- Existing API/admin builds/tests remain green. Admin lint and i18n targeted tests pass. No browser check is needed for test-only changes; PR #151 supplies runtime/browser locale coverage.
- No migrations, tenant/permission changes, production writes or data/seed operations.

## Completion record

Targeted contract: 16 tests passed, including deliberately defective fixtures and callable output probes. Full admin: 497 tests passed; lint zero errors/51 existing warnings; build validation recorded in the master roadmap. API code/dependencies unchanged from the 1,004-test baseline. No new browser or database behavior. Exact changed files: this specification, `docs/TRAVLINE_FINAL_ROADMAP.md`, and `nmt-analytics-admin/src/tests/i18nParity.test.ts`. Dependency PR #151 must merge first; remote CI and this slice’s PR/merge status remain pending. Keep this focused PR separate from the Reports runtime fix.
