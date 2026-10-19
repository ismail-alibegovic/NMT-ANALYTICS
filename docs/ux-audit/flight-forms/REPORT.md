# Flight and shared form consistency — verification report

**Overall audit: OPEN.** Flight and Customer component workflows are covered;
this is not an application-wide form certification.

Branch: `fix/flight-shared-form-consistency`.
Main baseline: `21ce102733e817638f71d545a96fadd87cd0221d`.
Date: 2026-10-19.

## What changed

- New/Edit Flight now share labeled controls with 44 px input/select heights,
  consistent spacing, an explicit required-field legend, a padded 2-column
  desktop/tablet layout and a 1-column mobile layout. Price and currency have
  separate labels. Notes have an associated label and multiline control.
- Both Flight list adapters now put filters under Axios `params`; the former bare configuration silently dropped search/status/limit. The shared GET helper is typed as `AxiosRequestConfig` so malformed calls fail typechecking. Two regressions use real Axios URL encoding, and the browser fixture now honors only the real transport shape. This also affects the Departure flight selector; its UI workflow remains OPEN.
- Flight status filters now send `true`/`false`, matching the API schema, rather than rejected `active`/`inactive` values. Toolbar search/filter controls have accessible names from existing localized labels. A browser regression exercises this through the real toolbar.
- Flight uses the shared Input/Select/Label components instead of independent
  placeholder-only markup. The dialog can scroll within the viewport with
  margins; the title reserves space for its close button.
- Flight validates required fields, three-letter IATA codes, different airports,
  valid local date/times, arrival-after-departure, positive integer capacity and
  finite non-negative price. Errors are linked to their controls and the first
  invalid control receives focus. Whitespace-only required strings are rejected.
- Editing converts stored instants to the operator's local wall time. Submission
  serializes explicit UTC ISO timestamps. The UI names the device timezone.
  Unchanged date fields retain stored seconds/milliseconds. Nonexistent DST wall
  times are rejected instead of silently normalizing. A blank price saves zero;
  cleared notes save null; zero prices and existing currency values prepopulate.
- Flight submission has a synchronous duplicate guard, disabled controls and
  blocked dismissal while pending. Rejections keep the draft open with a
  persistent inline error. Cancel/reopen resets create drafts and validation.
- Shared Input accepts native HTML attributes (including required/maxLength and
  ARIA attributes), links hint/error text and shrinks within grids. Shared
  Select exposes required/error description semantics and shrinks within grids.
  Shared Input uses the browser's dark color scheme for native date/time UI.
- Modal adds dialog semantics, a localized close name, and opt-in viewport
  scrolling/focus containment/restoration. The new scroll/focus behavior is
  enabled for Flight and FormModal; legacy callers are not claimed certified.
- FormModal retains drafts across equal inline initial-value props and loading
  rerenders; a stable empty default prevents reset loops. Zero values survive
  prepopulation. It associates labels with select IDs, generates per-instance
  field IDs, connects error descriptions, localizes validation and blocks
  duplicate saves/dismissal while pending. Required checkboxes are validated.
  Submission failures stay visible inside the dialog.
- Customer changes reuse the existing implementation in #123: errors propagate
  to FormModal, optional email clears send null, phone is required to match the
  current database constraint, and form labels/actions use BS/EN translations.
  Success/close ownership stays with FormModal.

## Browser evidence

The harness renders the actual Flight and Customer pages, shared controls, modal,
styles and i18n. Only AppContext and API transport are replaced. The test-only
Vite config never enters the production build. The harness refuses normal Vite
mode. Requests use a per-test in-memory fixture; no production host is contacted.

**A refresh against this fixture proves client behavior, not PostgreSQL durability.**
The first isolated run passed the existing 37 scenarios but its six new Flight cases were blocked before opening the form: the original pilot user had no enabled `travel_core` module and received the expected guarded 404. This did not test persistence. A dedicated localhost-only Flight organization/manager now enables that single module, and the test asserts entitlement before browser interactions. The original two security fixtures are unchanged. A second attempt passed the guard but exposed dropped Axios query parameters before creation; that adapter defect and the permissive fixture have now been corrected. See [initial attempt](isolated-first-attempt.md).

The separate `e2e/pilot-flight-forms.spec.ts` tests real Auth/API/PostgreSQL behavior
in the existing disposable localhost acceptance stack. It refuses non-local
application/API/Auth URLs, creates uniquely named flights, verifies saved data
through the API, and deletes the records afterward. Its results must be read from
CI; the fixture result cannot substitute for them.

The fixture matrix includes create, invalid numeric submission without a request,
server-rejected save with retained input, retry, edit/prepopulation, saved change,
refresh, cancel without persistence, fresh create/reset, in-dialog overflow/bounds,
44 px input/select height, and JavaScript page-error checks.
An additional toolbar/filter contract regression and a Bosnian regression checks labels, inline required errors,
first-error focus, tab containment, duplicate submit protection and winter-time
round-trip. English summer-time behavior is checked in each matrix cell.

| Viewport | Theme | Flight before | Flight after | Customer |
|---|---|---|---|---|
| 390 × 900 | Light | [Before](before-light-390.png) | [After](after-light-390.png) | [Capture](customer-light-390.png) |
| 768 × 900 | Light | [Before](before-light-768.png) | [After](after-light-768.png) | [Capture](customer-light-768.png) |
| 1440 × 900 | Light | [Before](before-light-1440.png) | [After](after-light-1440.png) | [Capture](customer-light-1440.png) |
| 390 × 900 | Dark | [Before](before-dark-390.png) | [After](after-dark-390.png) | [Capture](customer-dark-390.png) |
| 768 × 900 | Dark | [Before](before-dark-768.png) | [After](after-dark-768.png) | [Capture](customer-dark-768.png) |
| 1440 × 900 | Dark | [Before](before-dark-1440.png) | [After](after-dark-1440.png) | [Capture](customer-dark-1440.png) |

Before captures show the unchanged main Flight layout mounted in the isolated
harness, with an empty form. After captures contain synthetic values. Mobile forms
scroll vertically; captures show the upper surface, and the tests scroll to and
operate the footer. Neither set is a screenshot of production.

## Local checks

- Baseline admin: 368/368 tests.
- Final admin: 385/385 tests; lint has 0 errors and 52 warnings; production build
  passes with existing Supabase bundle/chunk warnings.
- Shared regression file covers Input native attributes/descriptions, controlled
  Select reset, Modal naming/Escape, and FormModal draft/reset/zero/error/duplicate
  behavior. Flight regressions cover required/numeric/IATA/chronology validation,
  create failure/retry, cancel, ISO serialization, edit prepopulation and zero price.
- Browser fixture suite: 14 tests, including both pages × 2 themes × 3 widths.
- API build passes. API suite: 877/878; unchanged
  `publicFormFraming.test.ts > keeps clickjacking protection on other routes`
  times out when `/api/health` tries the example Supabase database. A focused
  repeat also timed out. No all-green API claim is made.
- No database migrations were added or applied locally. API implementation and
  authorization are unchanged. Customer API TypeScript accepts null email clears.

## Coverage and open work

[Complete shared-component/consumer/form inventory](COVERAGE.md), with
[machine-readable dependencies](component-inventory.json): 18 shared
form/dropdown components and 76 form/control surfaces. Import discovery is a
worklist, not proof of visual quality. Flight and Customer have the fixture
workflow evidence described above. Other consumer forms remain OPEN.

Unverified work includes all other forms, drawers, modals, uploads and workflows;
real Flight database evidence until isolated CI passes; real Customer persistence
in this branch; other roles; all other datetime forms; populated rooming/seating;
communication/provider failures; public/portal/auth forms and settings workflows.

Existing unmerged PR overlaps: #120/#122 (modal/native controls), #123 (Customer),
#124 (Departure date utility), #125 (mobile layouts), #127 (aggregate verification).
Customer page/API-type changes here match #123 and the date utility matches #124.
Coordinate overlapping shared changes before any merge; this PR does not certify
or merge those branches.

## Reproduce

```bash
cd nmt-analytics-admin
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:forms
```

On this machine the Playwright CDN archive was unusable; Chromium 153 was obtained
from the npm-packaged serverless binary outside the repository. Local browser
checks ran with `FORMS_CHROMIUM_PATH=/tmp/chromium npm run test:forms`. CI uses
Playwright's installed browser. No browser binary or unrelated dependency was
added to the application.

At commit `688cd38929397e7cfd314f3f3cc3aeb3ddd967ba`, all six CI jobs passed, including all 878 API tests, admin tests, builds, Docker builds and migration replay. The initial 13-case fixture suite also passed in CI. Real persistence results belong to the separately linked acceptance run; subsequent toolbar/filter refinements have additional local coverage.

The staging acceptance workflow runs the fixture suite separately, then the
normal authenticated acceptance suite (which excludes `e2e/forms/**`). Its
existing disposable acceptance fixtures are distinct from `seed:demo`, which was
not run. Nothing is merged automatically and production data is unchanged.
