# Flight form and application form consistency audit

Source: owner request, 2026-10-19. Main baseline: `21ce102733e817638f71d545a96fadd87cd0221d`.

## Scope

Repair New/Edit Flight at `/operations/flights`; trace shared inputs, selects,
calendars, dialogs and forms; inventory consumers; fix confirmed source defects;
add regression tests and verify actual create/edit/save/cancel/error/refresh with
isolated records, in BS/EN, both themes, mobile/tablet/desktop.

## Constraints

No production writes, no demo generation, no automatic merge. Authenticated
persistence checks may use only the existing disposable localhost acceptance
stack and must clean up their own flights. Existing PRs #120–127 remain unmerged;
this branch must document overlap, not claim they are merged or certified.

## Acceptance and status

- Flight source/layout/validation/date-time fixes: implemented.
- Shared source fixes and regression tests: implemented for Input, Select,
  Modal and FormModal. Date/time conversion reuses the utility from #124.
- Flight before/after captures: captured at 390/768/1440 in both themes.
- Component dependency and form-surface inventory: recorded; not a certification.
- Actual API/Auth/PostgreSQL persistence: separate acceptance tests, requires CI.
- Every affected form visual and functional matrix: OPEN.

The overall audit must remain open until every affected form/workflow has
visual and functional evidence. The inventory is the worklist; source discovery,
unit tests, fixture-browser tests and initial page visits are different evidence
levels and must not be combined into a false application-wide PASS.
