# Final I18N-01 — Reports monetary locale

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

**Status:** IMPLEMENTED LOCALLY — PR #151 open — awaiting required CI and merge
**Priority:** P1
**Branch:** `fix/final-roadmap-i18n`
**Roadmap:** `docs/TRAVLINE_FINAL_ROADMAP.md`, Phase 1 I18N-01; existing roadmap BS/EN quality requirements.

## Goal and confirmed problem

Make Reports monetary formatting follow BS/EN selection. `utils/business.ts:formatCurrency` hardcodes bs-BA; Reports KPI/table and RevenueChart axes use it even under English. Chart dates already request bs-BA/en-GB, but real Chromium returns generic Bosnian month labels; date-only buckets also risk shifting west of UTC. Preserve financial values, currencies and mixed-currency guards.

## Discovery

Inspected AGENTS, product/architecture/roadmap, i18n provider/dictionaries/parity tests, Reports, RevenueChart, formatter callers/tests and existing isolated browser harnesses. Baseline: API build/typechecks/1004 tests, admin lint/build/462 tests and 8 shared UI browser tests passed. Existing caller defaults are relied on outside Reports. No API/schema changes needed. Browser inspection added a confirmed CLDR compatibility defect: both system Chromium and current official Chrome report bs-BA support but return root number/month data. The scoped correction uses Bosnian monetary separators with explicit currency identity when CLDR data is absent, translated chart month labels and UTC calendar-day extraction.

## Scope and domain rules

Add an explicit optional locale to the shared currency formatter, retaining its existing default for callers that omit the locale. Explicit bs-BA callers detect root decimal data and fall back to a compatible decimal/grouping pattern; keep KM/€ and use ISO currency codes for other missing native symbols. Add BS/EN chart month abbreviations and preserve report calendar days across timezones. Reports and RevenueChart select bs-BA/en-GB from current provider language. Verify large/zero/null amounts and BAM/EUR without conversion. Add regression unit and isolated browser tests, including immediate language switching and persistence. Save master roadmap and evidence. No UI redesign, auth changes, unrelated date parsing, broad formatter migration, seed/reset or production access.

## API, database and security

No changed endpoint, schema, migration, permission or tenant mutation. Existing API-first and RLS boundaries remain. Browser fixtures use synthetic data only; never inject service-role keys. No migration added or applied.

## Frontend acceptance

- [x] BS and EN Reports KPIs/table/chart use selected monetary locale.
- [x] Language switch updates labels and amounts without data reload or amount/currency changes; reload preserves language.
- [x] Legacy formatter default and mixed-currency safeguards retained.
- [x] Unit regressions fail against old behavior and pass after fix.
- [x] Browser checks cover BS/EN, light/dark, mobile/desktop.
- [x] No unrelated product screens changed.

## Required automated verification

Admin: locked install, lint, full tests, build; targeted formatter/Reports/chart tests. Browser: actual Reports/RevenueChart with synthetic API fixture, live switch and reload, two themes and two viewport widths. API: locked install/build/full tests plus serverless strict/NodeNext type checks. Required remote CI must pass before merging; authenticated Supabase workflows and production mutation are outside this slice. Migration/Docker CI retain their existing requirements.

## Completion record

Record exact files, commands/counts, browser scope, warnings/limitations, branch, commit, PR and merge status in the master roadmap and final report. No merge until required CI is observed green. Local acceptance passed: API 1,004; admin 484; targeted 53; Reports browser 4; shared UI browser 8. Final lint: zero errors/51 existing warnings. Full evidence and exact changed files are in the master roadmap. PR #151 is open; required remote CI and merge remain pending (earlier API blocker resolved); no production or database changes performed.
