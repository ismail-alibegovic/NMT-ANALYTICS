# I18N-04F — Shared table empty/error feedback

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

Status: ACTIVE. Branch: `fix/i18n-table-feedback`, fresh verified main `60355ff` (#156 merged). #158 list integration remains pending separately.

Translate DataTable's default empty title/description and render-error/retry feedback in BS/EN. Preserve explicit caller-provided emptyMessage (including empty string), loading skeleton, cell renderers, error containment and explicit retry. Switching language while failed must update feedback without silently retrying/remounting rows. Preserve table layout, columns/data and logging. No API, schema, auth/RLS, dependency, customer-data or runtime changes.

Keep the existing class boundary and pass translated labels from the established provider; do not move the root application boundary inside I18nProvider. The separate root ErrorBoundary sits outside that provider in main.tsx and requires a future bootstrap-safe localization task. Do not break startup error containment to translate it.

Add regressions first for BS defaults, live switching in failed state, explicit retry after corrected input, custom emptyMessage and loading-to-empty transition. Run admin lint/tests/build, actual empty/failure/retry browser flow in BS/EN/light/dark/mobile/desktop, and required exact-head CI before merge. Record evidence and exact files in final roadmap.

Discovery during the required failing regression: a direct column.render exception occurs while DataTable constructs its returned children, before TableErrorBoundary mounts, and escapes the table. Pull this confirmed containment defect into this same scoped feedback task: invoke cell render callbacks inside a small child component under the existing class boundary. Preserve callback arguments/results and cell layout; test the actual throwing renderer and explicit recovery, not an artificial inaccessible boundary state.

Local completion: 3 failing/2 passing new regressions on old source; all 5 now pass. 21 focused tests, full admin 532 tests/build/lint (0 errors/51 existing warnings), and 43 combined locale browser cases including 8 shared-table cases passed. Exact files/confirmed containment defect/evidence are in final roadmap. PR/required exact-head CI/merge remain pending.
