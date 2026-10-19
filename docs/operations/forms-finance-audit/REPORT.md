# Forms and finance audit — OPEN

Branch: `fix/forms-finance-audit`. Base: `21ce102733e817638f71d545a96fadd87cd0221d` (latest origin/main checked again before PR preparation). No production records, broad demo seed, migrations or automatic merge.

This PR continues the audit with payment, expense, supplier-payable and financial-report workflows. It does **not** complete the remaining application-wide form audit. [COVERAGE.md](COVERAGE.md) explicitly records every inventoried source surface. The current PR body records the final exact-head CI/acceptance outcome; this report starts with local evidence and pending isolated workflows.

## Existing work reviewed

All nine PRs were open drafts and unmerged when reviewed. Their fixes were not cherry-picked into this PR.

| PR | Existing scope | Treatment here |
|---|---|---|
| #120 | Shared modal reachability, focus, nested locks | Keep separate. Payment/expense wrappers bound their own content; global modal implementation unchanged. Full focus trapping still depends on that work. |
| #121 | New Sale theme matrix and route scan | Reuse existing acceptance, do not duplicate route-render certification. |
| #122 | Native picker affordances and dark scheme | Keep separate; global hidden native indicators remain a known main gap. |
| #123 | Customer/FormModal draft and failure handling | Customer workflow not reimplemented here. |
| #124 | Departure date/time conversion | Departure date editor not changed here. |
| #125 | Four mobile overflows | Not cherry-picked or recertified. |
| #126 | Separate entitled director fixture | Reuse the pattern in a distinct finance-only test organization; original two security tenants unchanged. |
| #127 | Combined verification only, do not merge | Reviewed as evidence, not used as a base. |
| #128 | Flight and shared form contracts | Keep separate. Flight before/after and actual persistence evidence live in [PR #128](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/128). This PR does not imply Flight fixes are in main. |

## Confirmed defects and exact fixes

- Add Payment retained the selected method after cancellation. Six Chromium baseline cases failed with expected empty / received `cash`. Add/Edit and the embedded reservation payment form now share `PaymentForm`: associated labels, unique IDs, 44px fields, mobile stacking, local calendar dates, finite positive cent validation, semantic form submission, complete reset on reopen, disabled fields and inline error recovery. Editing an undated historical payment preserves its missing date.
- Payment create/edit submission guards previously depended on React repainting disabled buttons. A synchronous ref now guards the full request lifetime and prevents closing while saving. Create retries retain the existing API idempotency key. Parent rerenders preserve the draft.
- Payment history load failures appeared as an empty ledger. They now block new payments until retry succeeds; stale responses cannot replace a newer reservation's list. Void/refund/status actions share a synchronous mutation lock. Copy is BS/EN.
- Expense forms lacked category/description/quantity/notes associations; blank unit cost became zero; cleared notes were omitted from PATCH. Fields are associated, blank cost is rejected, clear sends an empty string (API normalizes null), all fields lock during save, same-tick saves serialize, pending close is blocked, and mobile content scrolls/stacks. Zero is still allowed when explicitly entered.
- Supplier payable same-tick submissions generated two different request IDs. The new synchronous lock serializes issue/payment/reversal/cancel/retry; existing persisted-intent recovery is preserved. The regression produced two API calls before the fix and one afterward.
- `/payments/:id/refund` refunded pending/failed/cancelled payments. It now rejects these with 409, and the tenant-scoped update also compares `status = succeeded`. Competing stale refunds cannot both mutate or produce a successful refund audit. Already-refunded remains 400; missing/foreign payment remains 404.
- `/reports/summary` fabricated successful zero totals for invalid queries and database failures. It now returns 400 for invalid input and 503 for unavailable data, while genuine empty data remains 200 with zero totals.
- Reports retained stale monetary figures after failed refresh and allowed export. Failed loads now clear figures, display a localized retry state and disable exports. Request versioning rejects stale responses. Dates have associated labels and mobile widths; report/legend text follows BS/EN.
- CSV exports read `travline_auth_token`, whereas the established API client reads the real session keys. Both exports now use the authenticated API client and configured API base, including selected dates/currency and blob handling.
- Real browser evidence exposed inconsistent report populations: overview/by-package/series used `created_at`, while CSV and summary used `reservation_at`. The three screen endpoints now filter/bucket by the canonical booking date, with separate late-entry regressions. Payment-metric query failures in overview/series now fail closed rather than silently publishing partial zero totals.
- The header-only API test unnecessarily contacted the external example Supabase host. It now mocks database access; unit defaults point to localhost. Real database connectivity is asserted by disposable acceptance, not by a header unit test.

Shared Modal now supplies default light/dark body text colors; existing Input, Select and FormModal fixes remain owned by #122/#123/#128. The text-color addition complements #120 and does not duplicate its focus, lock or title-spacing implementation. Domain-specific repeated payment controls were consolidated at their source.

## Evidence and workflow status

Local final checks: **384 admin tests, 894 API tests, admin/API builds and admin lint PASS**. Lint reports 0 errors and 51 existing warnings; existing bundle-size/Supabase packaging warnings remain. The separate Chromium contract matrix passes **25/25** checks. These totals are not whole-application workflow certification.

`checks/` contains local command output. `e2e/finance-forms/` is an explicitly separate Vite contract harness: real components/CSS and Chromium, intercepted HTTP, no Auth/database. It cannot certify persistence. `e2e/pilot-finance-audit.spec.ts` and the expanded supplier test run against actual Auth → Express → PostgreSQL in the localhost-only disposable stack.

| Workflow | Local result | Real isolated result at report creation |
|---|---|---|
| Add payment / edit payment / embedded payment form, light/dark × 390/768/1440 | PASS: validation, cancel/reset, failed save, retained draft/retry/key, same-tick submit, disabled controls, bounds | NOT TESTED until CI |
| Bosnian payment labels/cancel | PASS | NOT TESTED until CI |
| Reports refresh error/retry, six theme/width variants | PASS: stale money hidden, exports disabled, retry | NOT TESTED until CI |
| Expense create/edit/clear/delete and save recovery | Unit regressions PASS | NOT TESTED until CI |
| Supplier issue/payment/reversal/cancel/overdue filters/reload and duplicate submit | Unit regressions PASS | NOT TESTED until CI |
| Refund eligibility, competing writes and tenant scoping | Six API regressions PASS | NOT TESTED until CI |
| Financial report error honesty / legitimate empty totals | Four API regressions PASS | NOT TESTED until CI |
| Installment payment, correction, refund, reload, cached balance vs successful ledger | Existing/new tests prepared | NOT TESTED until CI |
| Real report totals and authenticated CSV | Test prepared | NOT TESTED until CI |
| Other forms, roles, drawers, uploads, native OS pickers | NOT TESTED in this slice | NOT TESTED |

Reproduce: `npm test` and `npm run build` in API; admin `npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`; `npx playwright test --config playwright.finance-forms.config.ts`. Real workflows run through `.github/workflows/staging-acceptance.yml`, which provisions and tears down isolated PostgreSQL 17/Auth/Storage/Mailpit and replays existing migrations. It does not contact production.

## Screenshots

[Before mobile dark Add Payment](before-add-dark-390.png) · [After mobile dark Add Payment, failed-save draft](after-add-dark-390.png) · [After mobile dark Edit Payment](after-edit-dark-390.png) · [After desktop light embedded payment](after-list-light-1440.png) · [After mobile dark report error state](after-reports-dark-390.png). All six before Add captures and all 24 after form/report captures are adjacent. Real authenticated captures and traces are attached to the acceptance artifact.

## Remaining gaps

The full form audit remains open. The inventory includes unrelated form/control components as well as business screens, and is not a count of 80 verified forms. Uninspected workflows include authentication/onboarding/password reset, customers, suppliers/catalog services, inquiries/itineraries/quotations, packages/services/costing, departure operational editors, passenger documents/groups, seating/rooming, receipts/contracts/waivers, public/portal intake, communication forms, integration/settings/imports and file uploads. Existing acceptance tests cover some representative API paths but do not certify all form transitions or theme/device/role combinations.

Safari/iOS/Firefox and native OS picker dialogs are not tested. Focus trapping and global picker affordances remain pending in existing unmerged PRs. Ambiguous-response recovery for expense creation, conflicting generic payment edits, partial refunds, historical financial reconciliation and every report currency/role permutation are not certified by this slice. No new broad seed was generated. Synthetic acceptance records exist only in the disposable stack and are removed when it is stopped.

## First authenticated run — retained failure evidence

At `fbd35223ba9a65c7929a96975f8265854aee5300`, [CI 39257397470](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39257397470) passed all six gates. [Acceptance 39257397925](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39257397925) passed 25 contract checks and **41/54** real scenarios. All six actual payment/installment/edit/refund/reload cases passed. Six report cases exposed the booking-date inconsistency fixed above. Six expense cases reached successful creation, note-clear persistence and deletion, then stopped because the test expected JSON/200 instead of the endpoint's correct empty 204 response. One finance case stopped after successful amount correction because the test read `reservation` instead of `affectedReservations`. Those test assertions are corrected; the rest of those flows require the new run. No final PASS is inferred past a stopped boundary. The next matrix additionally verifies embedded standalone payment creation/reload and both CSV exports, and attaches open-form captures.

## Authenticated screenshot review — contrast defect

[Actual dark payment before correction](before-real-add-form-dark-390.png) · [Actual dark supplier form before correction](before-real-payable-form-dark-390.png).

At `3db2c96da6ff9c0934e30e7949c41cb77974ea64`, [CI 39259325808](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39259325808) and [acceptance 39259325764](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/39259325764) passed all gates, 25 contracts and 54 real scenarios. All 48 authenticated captures were extracted and inspected. They exposed inherited black text on dark modal bodies and supplier rows. The test harness had supplied a light inherited text color and masked this defect. It now uses the app's default inherited text color; its dark-label regression fails before the fix. Shared Modal supplies light/dark body text defaults, SupplierPayablesPanel supplies its section text default, and Reports supplies its page default. Both export buttons now visibly reflect disabled state. The matrix checks actual inherited label color and is rerun after these corrections. This visual failure is not erased by the earlier functional PASS. The long Bosnian payable title still overlaps the close affordance at mobile width on this branch; #120 already owns that separate unmerged title-spacing fix. Other modal consumers remain NOT TESTED until individually verified.

## Continuation — supplier directory and service forms

Exact head36ad completed CI39262146219 and acceptance39262146289 successfully: 894 API tests,384 admin tests,25 browser contracts,54 authenticated scenarios without skips/flakes. Reviewed all48 authenticated screenshots; inherited modal/ledger text defect is corrected. The separate long Bosnian modal title overlap remains owned by unmerged #120.

Next confirmed supplier defects: inaccessible labels, mixed English/Bosnian sections, stale cancel draft, non-semantic forms bypassing email/URL validity and same-tick duplicate requests. Supplier and service forms now use implicit associated labels, semantic submissions, native required/email/URL/numeric constraints, synchronous save locks, disabled fieldsets, guarded close, inline errors preserving failed drafts, decimal service prices and translated sections. Shared Input accepts optional `required` with a native-validity regression. No other shared Input behavior changed. Twelve additional browser contracts and six authenticated supplier scenarios cover this continuation. Current exact-head results must be read in the PR; prepared scenarios do not certify database persistence until acceptance passes.

## Continuation — sub-agent forms and portal access

Sub-agent creation had placeholder-only fields, no native validation, no pending guard, and stale cancel drafts. Browser reproduction is in `checks/subagent-before.txt`; six component browser cases now cover labels, reset, required/email/decimal commission validation, same-tick suppression and failed-save recovery.

Portal access was disconnected: the admin dropped the current port and built a query-string link, the API also emitted a query-string link, while the mounted frontend route requires `/portal/subagent/:token`. The page requested a nonexistent API endpoint. It now reads the existing `/portal/me` and `/portal/sales` APIs using only the portal bearer credential, supports retry and abort, retains document links with safe protocols, separates displayed totals by currency, and labels the API's 100-row limit. The profile query includes actual partner type/rate/expiry; last-seen writes explicitly include organization scope. Portal issue/revoke actions have synchronous locks and newly issued links can be revoked immediately. Three API regressions verify path/port, hashed credential/profile metadata, missing-token rejection and organization-scoped writes. Twelve component browser cases cover EN/BS × light/dark × three sizes, failure/retry, reload, document links and separate BAM/EUR figures. Six additional real sub-agent create/portal/revoke/delete scenarios are prepared; database PASS remains pending exact-head acceptance.

The legacy `components/ui/ImportModal.tsx`, `components/form/Form.tsx`, FileInput and PhoneInput have no production consumers in this main; they are not active workflow passes. Customer/package imports use `components/import/ImportModal.tsx`. Inspection found that active upload expects the wrong success response envelope; browser reproduction and repair follow next. No import success is certified yet.

## Continuation — active CSV/XLSX imports

The customer/package import modal crashed on a successful API response (`Cannot read properties of undefined (reading 'length')`): it read a flat summary although the API returns `{success, results}`. The baseline browser regression explicitly checks page errors so a crashed/unmounted root cannot masquerade as a successful close. Source repair uses the existing authenticated API instance and shared Modal, a per-opening file session, associated file label, server dry-run preview for both CSV and XLSX, the correct success/rejection envelope, synchronous write guard, disabled pending controls, close protection, retained failed selections, explicit invalid-row errors, and authenticated template downloads. English/Bosnian copy is paired. Stale preview responses are ignored and StrictMode lifecycle is exercised by the browser harness.

Local checks: 83 combined Chromium contracts passed; 386 admin tests passed; lint has zero errors and the same51 baseline warnings; admin build passed. The prior API suite remains897/897. Twenty-eight import contracts cover two consumers × six theme/width combinations for success and failure/cancel/validation, plus four Bosnian cases. Twenty-four real CSV/XLSX upload scenarios are prepared for the disposable stack, not yet certified. The existing source customer import trigger label is already fixed by separate PR123 and is not duplicated here; its current-main browser selector is explicitly documented in the real test. Unknown-result recovery after an upload has committed but its response is lost remains untested; the tests so far inject failures before writes.

## Continuation — document upload/download/delete

Browser reproduction confirmed that a failed upload cleared the selected file. The page now keeps the File for an explicit retry, announces an inline error, enforces the existing5 MB limit before a request, serializes uploads and deletes synchronously, labels the hidden file input and icon actions, and stacks the PDF-settings banner on narrow screens. Six component cases passed across both themes/three widths, including oversize rejection, failed selection retention and double-click retry. The fixture body now carries the same `dark:bg-gray-900` class as the production index; it does not supply inherited light text. Screenshots were reviewed against that context.

A second reproduction showed that failed Storage deletion still deleted the database row and returned200. It now returns503 and keeps the row available for retry. Two API regressions cover failed Storage recovery and foreign-tenant denial. Local API899/899, admin386/386, both builds and lint(0 errors,51 baseline warnings) pass. Six new real scenarios cover canceled file selection, failed upload/retry, Storage download content, reload, foreign download/delete404, failed deletion/retry and final disappearance. They remain prepared, not a database PASS until exact-head acceptance runs.

Headca4edc806c541478afee8af99d82090a5a3f43a9 passed all CI jobs at run39318396495. Its90-scenario acceptance run39318396677 is still in progress as this section is written. The earlier head5572 build failure was a test-only unsupported Testing Library `exact` option; it was corrected, with the prior failure retained as history.
