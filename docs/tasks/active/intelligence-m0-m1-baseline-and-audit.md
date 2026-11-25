# Intelligence M0–M1 — Baseline, protection and business-logic audit

**Status:** DONE
**Priority:** P1
**Branch:** `feat/travline-intelligence`
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`, `docs/TRAVLINE_MASTER_PLAN_2_0.md`

## 1. Goal
Establish a protected development baseline and produce an evidence-based audit of what Travline actually does today (modules, workflows, documents, financial definitions, platform-admin boundary), so later milestones fix real problems instead of assumptions.

## 2. Current problem
Owner manual testing reports confusing workflows, unclear module purpose, possible duplication, uneven PDF quality and no intelligent assistance. These are user-reported; this task verifies them against code.

## 3. Required discovery
Frontend routes/pages, API routes/middleware, migrations, PDF generators, financial calculations, role/entitlement model, existing `routes/ai.ts`, onboarding/help content, tests.

## 4. In scope
- Repo/PR verification, branch, roadmap, baseline evidence.
- Documentation-only deliverables under `docs/audits/intelligence/`.

## 5. Out of scope
- Any application code, migration, or environment change.
- Production, merges to `main`, credential changes.

## 6. Domain rules
Do not remove functionality because it looks unnecessary; document purpose and consequences first. AI never defines financial truth.

## 7–8. API / database
No change. (Schema impact of later milestones is deferred to their own specs.)

## 9. Frontend
No change.

## 10. Tenant and security acceptance
No runtime behaviour changes; audit findings that affect tenant/security are P0 and reported immediately.

## 11. Acceptance criteria
- [x] Latest repo/PR state verified and recorded.
- [x] RC preserved; dev branch created.
- [x] Baseline evidence recorded.
- [x] Business Logic Matrix and prioritized issue register delivered, every finding evidence-cited with "not verified" stated.
- [x] Owner decisions listed.

## 12–13. Tests / verification
Baseline: Admin `lint`, `tsc`, `vitest`; API `tsc`, `vitest` (Node 26 local caveat); CI Node 24 authoritative.

## 14. Completion report
- **Branch:** `feat/travline-intelligence` (branched from `release/commercial-rc-2026-11-24` @ `3cf2d013c8d6054d232fcf1ac64171e20688b9bc`).
- **Deliverables:**
  - `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`
  - `docs/audits/intelligence/BASELINE.md`
  - `docs/audits/intelligence/BUSINESS_LOGIC_MATRIX.md`
  - `docs/audits/intelligence/ISSUE_REGISTER.md`
  - `docs/audits/intelligence/SCENARIOS.md`
- **Verification:** Documentation-only milestone; local baseline established (`Admin` lint/tsc/636 tests PASS; `API` tsc PASS, 1214/1219 tests PASS with 5 Node 26 `productionEnvironment.test.ts` version checks; CI Node 24 12/12 checks PASS on PR #176).
- **Next Milestone:** Milestone 2 — Document Audit & Corrections (pending product owner decisions listed in `ISSUE_REGISTER.md`).
