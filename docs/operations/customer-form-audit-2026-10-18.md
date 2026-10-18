# Customer and shared form audit

Base main: 21ce102733e817638f71d545a96fadd87cd0221d. Branch: fix/audit-customer-form-state.

Browser reproduction: all eight baseline fixture cases failed. After a parent rerender caused by a rejected submit, FormModal reset entered values to initialData. Select lacked the id referenced by its visible label. Whitespace-only required text submitted. These failures were reproduced using actual shared components and synthetic HTTP responses, without production access.

Fixes: snapshot initial data when opening a form; preserve drafts through rerenders and failed requests; guard submission synchronously; prevent closing while saving; connect select labels and validation descriptions; reject blank/whitespace input, preserve numeric zero, validate required checkboxes and localize validation messages. Input/Select accept optional native validation/accessibility props.

Customer integration: propagate API failures so FormModal retains the draft and does not emit false success; send explicit null when clearing optional email; require phone to match the existing non-null database constraint; reuse existing BS/EN labels instead of missing translation keys that rendered blank actions/table headers. Generic FormModal owns pending state and success feedback.

Local verification: 10 Chromium component regressions pass, light/dark at 390/768/1440 plus pending-submit, duplicate submission, cancellation and reopen checks. Admin build passed; admin lint/unit results recorded in PR after completion. These synthetic component tests do not establish database persistence. A new isolated-API customer browser workflow covers required/email validation, real duplicate-phone rejection, preserved retry state, create/edit/reload and clearing optional email and retaining required phone, across BS/EN, both themes and all three widths. CI execution pending.

No API implementation or migrations changed/applied; tenant scoping remains in existing APIs. No production data or demo generation. Full route/form audit remains incomplete.

The first isolated execution reached the edit stage in all 12 BS/EN/theme/width variants, then exposed the existing non-null phone constraint. The form now requires phone; the regression explicitly checks that clearing it fails validation while clearing email succeeds. This preserves schema/domain constraints rather than introducing a migration. Updated CI pending.

Second isolated run failed at a test selector that expected the exact optional-phone label after the required indicator was added. The selector now includes the required label, with bounded action timeout for prompt failures. No application behavior was weakened to satisfy the test. Persistence verification is rerunning.
