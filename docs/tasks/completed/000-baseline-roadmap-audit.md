# Task 000 — Travline Baseline Roadmap Audit

**Status:** COMPLETE  
**Priority:** P0  
**Branch:** `audit/codex-baseline`  
**Roadmap references:** all `VERIFY` and `PARTIAL` items in `docs/ROADMAP.md`

## 1. Goal

Establish an evidence-based current-state baseline before Codex starts new feature development.

Travline has months of implementation history and some older complaints no longer reflect `main`. The goal is to determine what is actually `DONE`, `PARTIAL`, `MISSING`, or `BROKEN` today so future tasks do not duplicate features or rely on stale notes.

This is an **audit/documentation task, not a product implementation task**.

## 2. Source of truth for the audit

Audit current `origin/main` as the product baseline.

Relevant unmerged branches may be inspected only to report that additional work exists outside `main`; do not count unmerged code as `DONE` in production and do not merge/cherry-pick it in this task.

Use evidence from:

- current source code;
- migrations/schema definitions;
- automated tests;
- current route/navigation wiring;
- Git history/PR history when necessary to understand intent;
- existing canonical docs.

Do not assume old `AGENTS.md` history is current truth; that history was intentionally replaced by stable instructions.

## 3. Mandatory reading

Before auditing:

1. `AGENTS.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ROADMAP.md`
5. `docs/plans/2026-08-18-travline-operating-system-redesign.md`
6. current Git status, branch list and recent merged PR/commit history relevant to the domains below.

## 4. Status definitions

For each audited item use exactly one primary status:

- `DONE` — end-to-end implementation exists on `main`, is reachable/usable, and meaningful tests or direct code evidence support it.
- `PARTIAL` — important pieces exist but one or more acceptance-critical parts are missing, disconnected, unsafe, or not exposed in the product.
- `MISSING` — no meaningful implementation exists on `main`.
- `BROKEN` — implementation exists but current code/tests demonstrate it does not work as intended.
- `NOT_APPLICABLE` — the old complaint conflicts with an intentional product rule; explain why.
- `UNVERIFIED_RUNTIME` — code appears implemented but runtime/browser proof cannot be established in this audit environment. Use this as a secondary qualifier, not as a substitute for the primary status when code evidence is sufficient.

Never call something `DONE` only because a file/component/endpoint with the right name exists.

## 5. Audit matrix

Audit every group below.

### A. Passenger management

1. Create passenger from the appropriate departure/reservation workflow.
2. Edit passenger.
3. Delete passenger safely.
4. Delete/move dependency handling for seat assignments.
5. Dependency handling for passenger groups.
6. Dependency handling for rooming/accommodation allocations.
7. Distinction between customer, reservation and passenger in current domain/API/UI.
8. Contextual traveler fields rather than always requiring irrelevant nationality/passport data.
9. Passenger → reservation navigation.
10. Reservation → passenger navigation.

### B. Package / departure / services

11. Package supports multiple service combinations (hotel, transport, flight, transfer, activity/optional service as supported by current domain).
12. Package services/hotels are actually usable from the package UI, not backend-only.
13. Departure creation inherits relevant package defaults.
14. Departure can override operational defaults without mutating the package.
15. Booking/reservation snapshots prevent later package edits from corrupting booked state where the architecture expects snapshots.

### C. Transport and seating

16. Transport type is modeled on package/departure as required by current product.
17. Concrete bus/vehicle/transport resource management exists or is absent.
18. Vehicle capacity integrates with departure operations.
19. Manual bus seating works.
20. Automatic bus seating exists/works.
21. Automatic seating tries to keep groups together.
22. Split group seating is visible/actionable.
23. Flight-only workflow does not incorrectly behave like a bus seat assignment workflow.

### D. Passenger groups

24. Create/edit/delete group.
25. Add/remove members.
26. Unassigned passengers are visible.
27. Group colors/identity/preferences are usable.
28. Cross-departure membership is rejected.
29. Cross-organization access is rejected.
30. Group state connects to seating and rooming rather than remaining isolated.

### E. Accommodation / rooming

31. Hotels are reusable/configurable.
32. Package hotel/room options work.
33. Departure-level hotel allocation works.
34. Room/room-type capacity exists and is enforced.
35. Manual room assignment works.
36. Unassigned traveler workflow exists.
37. Moving travelers between rooms works.
38. Automatic rooming exists/works.
39. Automatic rooming attempts group-together behavior.
40. Split-group rooming is visible.
41. Full-room/capacity conflict returns useful semantics (audit known potential 500 vs 409 issue).

### F. Flights and documents

42. Flight CRUD/domain is available through a usable workflow.
43. Flights connect to package/departure context.
44. Passenger flight-required document data can be captured.
45. Passport number/validity/authority fields exist where relevant.
46. Readiness identifies missing required flight/travel data.
47. Expiry/validity warning behavior exists or is missing.
48. Non-flight/non-relevant trips are not burdened with inappropriate document requirements.

### G. Communication Center

49. Manual communication workflow.
50. Organization sender configuration.
51. Email behavior/provider boundary.
52. SMS behavior/provider boundary where implemented.
53. Message templates.
54. Recipient resolution by customer/reservation/departure/passenger/group.
55. Recipient resolution enforces organization scope.
56. Group/departure targeting cannot leak recipients from another departure.
57. Communication history.
58. Campaign functionality.
59. Automation/scheduling functionality.
60. SMS length/channel UX constraints.
61. BS/EN parity for Communication Center.
62. Useful links/context from the relevant customer/reservation/departure workflows.

Also inspect any relevant unmerged `feature/communication-center-2` branch and report what exists there but not on `main`. Do not merge it.

### H. Public Forms

63. Public Forms visible through normal product navigation.
64. Staff can create/manage forms.
65. Staff can copy/share usable public form link.
66. Permissions are correct.
67. Public token resolves owning form/org server-side.
68. Submission handler is wired.
69. Request-style submissions enter the intended inquiry/sales workflow.
70. Submission does not silently create inappropriate commercial objects.
71. Public form UI and responses have BS/EN behavior as intended.

Note: recent `main` contains a Public Forms product-integration merge. Verify it instead of assuming the older complaint is still valid.

### I. Dashboard / navigation / work management

72. Today/Needs Attention uses real actionable data.
73. Upcoming departure warnings/readiness.
74. Outstanding balance/payment exception signals.
75. Missing traveler/document signals.
76. Unassigned group/seat/room signals where domain support exists.
77. Quick-create actions are usable.
78. Global search exists or is missing.
79. Navigation is capability-aware.
80. Duplicate/legacy navigation remains or has been cleaned.
81. Integrations page represents real supported configuration vs placeholders/misleading UI.

### J. i18n and UX consistency

82. Identify hardcoded Bosnian strings in user-facing admin screens that should localize.
83. Identify hardcoded English strings in user-facing admin screens that should localize.
84. Identify translation key parity gaps between BS/EN.
85. Identify known pages where mixed-language UI remains.
86. Confirm no broad UI refactor is necessary to fix i18n.

Do not mass-edit translations in this audit.

### K. End-to-end / quality

87. Auth login/reload-loop protections remain present.
88. Protected API calls are avoided on public sign-in path as intended.
89. Core Reservation → Passenger → Group → Seat → Rooming relationships can be traced through code/tests.
90. Existing automated tests cover critical tenant boundaries.
91. Identify the most important missing E2E/browser flows.
92. Identify obvious legacy NMT Analytics naming/model remnants that actively hurt product behavior (do not rename them in this task).

### L. Deployment / repository workflow

93. Confirm GitHub `main` is the source-of-truth code path.
94. Inspect current Vercel-related repository config and report whether full-stack independent deployment code is already on `main` or only in an unmerged branch/PR.
95. Confirm no Vercel code path intentionally requires ZO once the independent deployment work is merged.
96. Identify required server-side env variable names from code/config without printing secret values.

Do not change Vercel, ZO, Supabase production configuration or secrets in this audit.

## 6. Required output

Create:

`docs/audits/TRAVLINE_BASELINE_AUDIT.md`

The document must contain:

### Executive summary

- current strengths;
- highest-risk incomplete workflows;
- top 5 recommended next implementation tasks in priority order.

### Evidence matrix

A table with at least:

| ID | Area | Status | Evidence | User-visible gap | Recommended action |
|---|---|---|---|---|---|

For evidence, cite repository paths, route names, test files and migration names. Include line numbers if practical, but stable file/function names are more important than fragile line numbers.

### Main vs unmerged work

Explicitly separate:

- what is on `main`;
- what exists only on relevant unmerged branches/PRs;
- what is only described in docs but has no code evidence.

### Recommended task decomposition

Turn remaining important gaps into reviewable task candidates. Do not implement them.

## 7. Roadmap update

After producing the audit, update `docs/ROADMAP.md` statuses based on evidence.

Rules:

- preserve product intent;
- do not delete a reported concern merely because part of it exists;
- change `VERIFY` to `DONE`, `PARTIAL`, `MISSING`, `BROKEN` or `NOT_APPLICABLE` as appropriate;
- add a short evidence note/link to the audit for material status changes;
- do not add new speculative features during the audit.

## 8. Code changes forbidden in this task

Do not modify:

- frontend product code;
- API product code;
- migrations;
- tests (except no change is expected; do not "fix" failures in this audit);
- Vercel configuration;
- ZO configuration;
- production environment variables;
- Supabase schema/data.

Only documentation generated/updated by this audit should change.

If baseline tests fail, record the failure as evidence; do not fix it inside Task 000.

## 9. Baseline verification

Run the full available baseline so the audit knows whether current `main` is healthy.

API:

```bash
cd nmt-analytics-api
npm ci
npm run build
npm test
```

Admin:

```bash
cd nmt-analytics-admin
npm ci
npm run lint
npm test
npm run build
```

Also inspect the current GitHub Actions workflow and record whether migration replay / Docker verification exists. Run locally only if practical; otherwise report CI coverage accurately.

## 10. Security focus

During the audit, specifically search for:

- routes querying tenant-owned records by ID without org scope;
- public handlers accepting trusted `org_id` from browser input;
- cross-departure passenger-group/recipient lookup weaknesses;
- new frontend direct writes that bypass established API business boundaries;
- service-role secrets exposed to Vite/client config.

If a serious tenant/security issue is found, mark it clearly as release-blocking in the audit. Do not silently patch it in this task; recommend an immediate dedicated security task.

## 11. Acceptance criteria

- [ ] All 96 audit points are classified with evidence or explicitly grouped where one implementation proves several adjacent points.
- [ ] `docs/audits/TRAVLINE_BASELINE_AUDIT.md` exists.
- [ ] `docs/ROADMAP.md` is updated from assumptions to evidence-based statuses.
- [ ] No business code, migrations, tests, deployments or secrets were changed.
- [ ] API baseline build/tests were actually run and results recorded.
- [ ] Admin lint/tests/build were actually run and results recorded.
- [ ] Unmerged Communication Center and Vercel infrastructure work is clearly separated from `main` state.
- [ ] Top 5 next tasks are recommended with clear reasons.
- [ ] Final report follows `AGENTS.md` completion-report contract.

## 12. Completion report

At the end, report:

- audit branch;
- number of roadmap points classified;
- baseline API/admin results;
- top 5 next tasks;
- files changed (documentation only);
- any release-blocking findings;
- commit SHA;
- PR link if opened.

Do not begin Task 001 or any implementation task automatically after completing this audit.
