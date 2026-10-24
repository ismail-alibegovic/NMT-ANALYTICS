# Travline — Final Development Roadmap & Execution Plan

Baseline inspected: `origin/main` at `f6256cb731be8a63b391e17655d1e3449809ef67` (PRs #148–#150 complete). Updated 2026-10-24. Primary deployment: https://travline-sprypine.zocomputer.io.

GitHub main is authoritative. Codex owns code, regression tests, focused PRs and CI; Zo owns final hosting and runtime verification. This document orders release completion work within the existing product scope; it does not replace the product canon, architecture, or Master Plan. Create one scoped active specification before each implementation slice. Preserve prior completed work.

## Evidence and status rules

Statuses: OPEN, IN PROGRESS, PR OPEN, MERGED, BLOCKED, VERIFIED. MERGED requires a merge commit and exact-head CI evidence; VERIFIED additionally names the exercised workflow/environment. Historical reports are evidence pointers, not fresh verification. Never mark a phase complete from key parity, compilation, screenshots, or a single representative workflow alone.

Each completed PR must record its number, commit, commands/results, affected workflows/languages, deferred findings and next task here. Keep this record in the PR itself, then record the merge SHA in the next focused PR. No production/customer writes, seed/reset execution, destructive database action, provider activation or deployment is authorized by this roadmap. Destructive database operations require separate approval. Inspect hosted demo state read-only only with approved access; never copy customer data into fixtures.

## Current implementation inventory

- Localization already exists: `nmt-analytics-admin/src/lib/i18n/{context.tsx,en.ts,bs.ts}`, persistent `travline_lang`, document language updates and `src/tests/i18nParity.test.ts`. Parity checks key paths but do not establish complete translation or interpolation coverage. The file-by-file discovery checklist is `docs/operations/final-i18n-inventory.md` (2,786 dictionary leaves; 660 candidate JSX literals across 67 files, requiring manual classification).
- Confirmed Phase 1 defects: `src/utils/business.ts:formatCurrency` fixes locale to `bs-BA`; `src/pages/Reports.tsx` and `src/components/analytics/RevenueChart.tsx` therefore keep Bosnian money formatting in English. `src/pages/CustomerDetail.tsx` mixes hardcoded Bosnian column labels and English summaries. Other helpers/screens require inventory before changes.
- Existing business modules include `src/pages/{Reservations,DepartureDetail,Inquiries,Quotations,QuotationDetail,Suppliers,Reports}.tsx`, `src/pages/Hub/HomeHub.tsx`, `src/pages/admin/` and `src/pages/operations/`. Reuse these implementations. Existing acceptance coverage lives in `nmt-analytics-admin/e2e/pilot-*.spec.ts`; coverage is not proof all workflow combinations pass.
- Demo implementation: `nmt-analytics-api/src/scripts/seed_demo.ts` already defines interconnected deterministic 2027 packages, departures, customers, passengers, reservations, payments and accommodation/flight examples. It requires `DEMO_TARGET_ORG_ID` and `DEMO_RESET_CONFIRMATION=YES_RESET_DEMO_DATA`, scopes the ownership registry by org/seed, protects foreign dependents and financial history, and refuses reassigning an existing user from another org. Existing safety tests: `src/tests/{seedDemoSafety,seedDemoUniqueIds}.test.ts`; ownership registry: `supabase/migrations/20260831200000_seed_record_registry.sql`. These are safeguards, not evidence that the Zo-created organization is the intended safe demo target.
- Alternative seeds are materially different: `src/scripts/seed.ts` clears legacy demo data; `src/scripts/seed_acceptance.ts` rejects non-local URLs and production. Do not run any seed during discovery. No hosted org/identity/record inventory was available in this session; Zo-created demo state remains UNVERIFIED. No dedicated restricted-demo middleware was found in `src/middleware/`; confirm all alternate mutation routes before designing demo access.
- Security foundations exist: `src/middleware/{authenticateToken,requireOrgContext,requireRole,requireModule}.ts`, scoped API routes, Supabase migrations and authorization/financial tests. Preserve API-first mutations, RLS and composite tenant relationships; endpoint presence does not establish full isolation.
- Deployment stabilization already exists: root `start-production.sh`, `nmt-analytics-api/src/environment.ts`, `src/tests/productionEnvironment.test.ts`, `docs/operations/zo-deployment.md`. Do not redo PRs #148–#150. CI already covers API/admin builds/tests, serverless type checks, migration replay/rehearsals, Docker builds and shared UI browser regressions in `.github/workflows/ci.yml`.

Paths prefixed `src/` above are relative to the named admin/API component.

## Phase 1 — Internationalization

| ID / status | Scope and exact implementation anchors | Dependencies | Acceptance / required automated tests |
| --- | --- | --- | --- |
| I18N-01 / MERGED (#151; required CI passed) | Reports monetary and chart calendar-day locale: admin `src/utils/business.ts`, `src/pages/Reports.tsx`, `src/components/analytics/RevenueChart.tsx`. Keep the legacy formatter default for unrelated callers; add BS/EN chart month labels because Chromium Bosnian month data falls back to generic M04-style labels. | Baseline inspection | BS/EN totals, table and chart follow selected language immediately and after reload; actual BAM/EUR identity, mixed-currency guards and amounts preserved; no calendar-day drift west of UTC. Browser CLDR fallback uses Bosnian separators and unambiguous currency codes (KM/€ retained); other currencies may use ISO codes when native Bosnian symbols are unavailable. Unit formatter/Reports/chart regressions plus browser BS/EN, light/dark, mobile/desktop. |
| I18N-02 / MERGED (#152; required CI passed) | Translation coverage contract: `src/lib/i18n/{en,bs}.ts`, `src/tests/i18nParity.test.ts`; inventory nested value types, empty strings, interpolation tokens and hardcoded user-facing strings. | I18N-01 | Existing keys remain compatible; nonempty strings and placeholder parity enforced across dictionaries; report literal inventory with explicit technical/proper-name exceptions; failing fixtures prove the coverage checker detects defects. |
| I18N-03 / MERGED core provider/switch + route matrix (#153) | Language persistence/switching: `src/lib/i18n/context.tsx`, `src/layout/AppHeader.tsx`, auth/public screens and `src/pages/admin/Settings.tsx`. Confirm defects before changing behavior. | I18N-02 | Stored/browser fallback, reload, blocked storage, document language, public/authenticated transitions and accessible switch verified in BS/EN. Provider/component tests and browser navigation tests; no session reload loop. |
| I18N-04 / IN PROGRESS (CustomerDetail merged #154; New Sale active; other domains open) | Translate one domain per PR: first `src/pages/CustomerDetail.tsx`, then sales/reservations, departure operations, finance/docs, settings/public screens. Audit UI validation/toasts/empty states, API message presentation and exports/PDF locale contracts. | I18N-02, I18N-03 | Each domain has an explicit literal checklist; changed screens contain no unintended mixed language. Component failure/success-state tests and BS/EN browser checks for each PR. Preserve stored status codes and API contracts. |
| I18N-05 / OPEN | Locale formatting inventory: `src/utils/{business,paymentDate,dateTimeInput}.ts` and remaining per-screen `Intl`/`toLocale*` calls. | I18N-01, domain slices | Dates, calendar days, numbers, percentages and currency follow an agreed BS/EN convention without timezone drift or currency conversion. Boundary/timezone tests and live-switch browser tests. Do not mass-replace parsing or financial calculations. |

Exit: domain checklist complete, no unexplained translation gaps, language-switch regressions green, locale rules documented and BS/EN workflow evidence recorded.

## Phase 2 — Functionality and UI

| ID / status | Scope / existing implementation to reuse | Dependencies | Acceptance / required automated tests |
| --- | --- | --- | --- |
| UI-01 / OPEN | Route/role/workflow audit using `e2e/pilot-{route-audit,director-route-audit,complete-scenarios}.spec.ts`, `src/pages/Hub/HomeHub.tsx`, sales pages and API routes. Inventory implemented/disabled/broken behavior before repair. | Phase 1 relevant domain | Trace inquiry → quote → booking → travelers → payment/document; name expected state and exact defect per task. Existing API + browser workflows; add a reproducer for each confirmed defect. |
| UI-02 / OPEN | Focused operational repairs in `src/pages/DepartureDetail.tsx`, `src/components/operations/`, API departure/rooming/seating routes; finance/supplier follow-ups in existing pages. | UI-01 | Save/edit/retry/concurrency errors truthful, capacity and passenger relationships preserved, totals reconcile, no duplicate booking/payment. Targeted route/integrity tests and real isolated workflow E2E. |
| UI-03 / OPEN | Forms/responsive/theme audit: `src/components/form/`, shared modal/DataTable, `e2e/finance-forms/`, `e2e-ui/`, `e2e/pilot-mobile-layout.spec.ts`. Reuse prior form/theme audit evidence. | UI-01 and relevant repair | Keyboard/focus/error/loading/empty states usable; BS/EN at 390/768/1440px, light/dark; no clipping or accidental submit. Targeted component tests and browser assertions, screenshots as supporting evidence. |

Exit: every exposed module has a workflow/role disposition; confirmed release blockers repaired in focused PRs; remaining intentionally unavailable features documented rather than represented as complete.

## Phase 3 — Interactive demo

| ID / status | Scope / anchors | Dependencies | Acceptance / required automated tests |
| --- | --- | --- | --- |
| DEMO-01 / BLOCKED (hosted inventory) | Read-only comparison of Zo-created demo org against `src/scripts/seed_demo.ts`, ownership registry migration and `seedDemoSafety.test.ts`; inspect legacy/acceptance seeds separately. | Approved development/demo access, exact org identity | Record non-sensitive identity/provenance/counts/relationships, seed-owned vs user-created records, schema compatibility and account permissions. No automatic org selection or mutation. Unit mocks for discovery; read-only integrity queries only on approved tenant. |
| DEMO-02 / OPEN | Fill only verified dataset gaps in `src/scripts/seed_demo.ts`: connected sales/travelers, seating/rooming/flights, finance/docs, inquiries/quotes/suppliers where implemented. | DEMO-01, relevant Phase 2 fixes | Synthetic contacts/documents only, realistic statuses and date windows, referential/financial/currency integrity and deterministic IDs. Seed manifest/unique-ID tests; two-run idempotency in disposable isolated database. Outbound email/SMS/jobs disabled. |
| DEMO-03 / OPEN | Restricted demo policy using existing auth/org/role middleware and API routes, then browser entry/banner. Specify allowed interactions before implementation. | DEMO-01, security threat model | Server-enforced demo limits across API, storage, invites, exports, jobs/provider delivery and alternate routes; demo cannot reach real tenant data or privileged settings. Cross-org/cross-role/forged-org/alternate-path tests, rate limits, isolated browser scenarios. Hiding buttons is insufficient. |
| DEMO-04 / OPEN | Safe reset extending existing org+seed ownership checks and foreign-dependent preflight; prefer operator-only reset until policy approved. | DEMO-02, DEMO-03 | Explicit approved target and confirmation; dry-run inventory, locking/concurrency handling, rollback/recovery, audit, no unrelated or financial-history deletion. Refusal/no-mutation regressions, disposable-db reset/reseed tests and fault injection. Production execution requires separate approval. |

Exit: hosted identity independently verified, realistic connected demo works under restricted permissions, isolated reset safety proven, operator runbook approved. Never infer a safe demo from its name alone.

## Phase 4 — Security and infrastructure

| ID / status | Scope / anchors | Dependencies | Acceptance / required automated tests |
| --- | --- | --- | --- |
| SEC-01 / OPEN | Extend existing `src/tests/{authorizationHardening,authorizationBoundaryAudit,authContextAudit,messagingTenantIsolation}.test.ts`, API route/middleware and Supabase RLS/composite-FK audit. | Phase 2/3 changed surfaces | Two-tenant/two-role negative cases for IDs, relationships, storage, public forms/tokens, exports, audit and jobs. Verify denial through HTTP and isolated database/RLS tests; preserve auth-expiry protections. |
| SEC-02 / OPEN | Financial invariants: `src/lib/money.ts`, payment/refund/payable routes; existing `paymentRecordingRoute`, `paymentsAuditAndOverpayment`, `paymentRefundSafety` tests; scripts `supplier-payables-integrity.sql` and related checks. | Relevant Phase 2 fixes | No cross-currency aggregation, duplicate effects, overpayment race, unsafe refunds or silent balance drift. Concurrency/idempotency/retry tests; isolated migration replay and financial assertions. No production repair without separate scope. |
| INFRA-01 / OPEN | Verify existing `start-production.sh`, API environment loader, `.env.*.example`, Dockerfiles/compose, `docs/operations/zo-deployment.md` and CI Node versions. | Current stabilization retained | Clean locked install/build on maintained Node version; same-origin API/assets/deep links; secret exclusion; dev bypass disabled; signal/restart and health behavior verified. Existing production-environment tests, Docker builds, isolated production-mode smoke. Document required public vs server vars and provider-disabled defaults. |
| INFRA-02 / OPEN | Backup/recovery/schema/provider/monitoring readiness using `scripts/{migration-replay,production-upgrade-rehearsal,isolated-recovery-rehearsal}.sh` and existing operations docs. | SEC-01, SEC-02, INFRA-01 | Reproducible disposable restore and schema checks, secret-safe logs, approved provider behavior. Replay/upgrade/recovery tests; live backup/provider checks only with approved access. No new unrelated infrastructure. |

Exit: security findings resolved or explicitly dispositioned, isolated recovery demonstrated, deployment artifact reproducible, no unapproved customer-data operations.

## Phase 5 — Final release

| ID / status | Scope / anchors | Dependencies | Acceptance / required automated tests |
| --- | --- | --- | --- |
| RELEASE-01 / OPEN | Exact-commit release candidate using `.github/workflows/{ci,staging-acceptance,ui-audit}.yml`, full API/admin and relevant `e2e/pilot-*.spec.ts`. | Phases 1–4 acceptance | All required CI at candidate SHA green, executed test counts and skips recorded, full isolated tenant/role/BS/EN/theme/viewport regression matrix and no unexplained failures. Do not reuse old runs as current evidence. |
| RELEASE-02 / OPEN | Final operator instructions extending `docs/operations/zo-deployment.md`: approved variable names, immutable commit, build/start, health/assets/auth/deep-link checks and rollback. | RELEASE-01 | Fresh isolated checkout follows documentation successfully. Record migration state and approved execution separately. Zo needs only sync verified SHA, configure approved vars, launch and verify runtime. |
| RELEASE-03 / OPEN | Merge/release integration and Zo handoff. | RELEASE-02, required CI/review | Main clean, all focused PRs integrated, exact final SHA and CI URLs recorded; Zo records running SHA, database health and actual-origin login/logout/session checks. Codex evidence and Zo runtime evidence remain distinct. |

## Execution order and resume record

Default: I18N-01 → I18N-02 → I18N-03 → I18N-04 domain PRs → I18N-05 → UI-01/02/03 → DEMO-01/02/03/04 → SEC-01/02 → INFRA-01/02 → RELEASE-01/02/03. Security blockers discovered earlier interrupt this sequence. Read-only demo discovery may proceed while credentials are arranged; no seed execution is implied.

Current focused specification: `docs/tasks/active/final-i18n-reports-locale.md`. Branch: `fix/final-roadmap-i18n`. PR: [#151](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/151). Initial implementation commit: `0f7de0c5185d346d2cfbd8e78d1b753ac79af09b`. Merge: pending. Next after reviewed merge: I18N-02; first reconcile recorded PR status and fetch origin/main.

Baseline current-instance evidence before changes: API build and both serverless type checks passed; 1,004 API tests passed; admin build, 462 tests, lint (51 warnings) and 8 shared UI browser tests passed. Full API startup is blocked by missing Supabase bindings. Hosted demo state, authenticated E2E, current remote CI and Zo runtime are unverified. Git read works. GitHub API initially returned Forbidden; PR creation and CI inspection subsequently succeeded (see current completion record). No credentials or production data were accessed.

### I18N-01 completion evidence

Implemented on `fix/final-roadmap-i18n`; [PR #151](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/151) is open, not merged. Reports KPIs/table/chart now follow BS/EN; explicit locale callers detect Chromium root Bosnian numeric data and retain Bosnian grouping/decimals plus KM/€ or unambiguous ISO currency codes. Chart month abbreviations are translated and calendar-day labels use UTC extraction. Legacy omitted-locale callers keep their existing behavior. New browser checks are registered in `.github/workflows/ci.yml`.

Validation (current instance, synthetic/mocked data only):

- API: `npm ci`, `npm run build`, root serverless strict and NodeNext type checks, `npm test`: **112 files / 1,004 tests passed**.
- Admin: `npm ci`, `npm run lint`, `npm test`, `npm run build`: **67 files / 484 tests passed**. Final lint retains **51 existing warnings, zero errors**; production bundle retains existing Supabase export/chunk warnings.
- Targeted formatter/Reports/chart/parity: **4 files / 53 tests passed**, including missing Bosnian browser CLDR data, negative/zero/large values, currency identity, no refetch on switching and translated dates.
- `FORMS_CHROMIUM_PATH=<official Chrome executable> npm exec -- playwright test -c playwright.finance-forms.config.ts reports-locale.spec.ts`: **4 passed**, BS→EN→reload→BS at 390/1440 widths in light/dark, timezone America/Los_Angeles, actual Reports and RevenueChart with synthetic API. Labels, KPIs/table/chart amounts, calendar day, document language, persisted choice and no viewport overflow verified. No authenticated database workflow claimed.
- `UI_CHROMIUM_PATH=<official Chrome executable> npm exec -- playwright test -c playwright.ui.config.ts`: **8 passed**.
- First regression run against old formatter reproduced failures. Browser discovery exposed root Bosnian number data and generic month labels in both system Chromium and official Chrome; assertions were preserved and the compatibility behavior was fixed. Official Chrome was downloaded from Google's HTTPS package endpoint and extracted outside the repository because the Playwright CDN returned HTTP 403 Domain forbidden. No TLS/checksum verification was disabled.
- `git diff --check` passed. No API application changes, migrations added/applied, database actions, seed/reset, tenant-policy changes, production/customer writes or Zo runtime changes.

Exact changed files:

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-reports-locale.md`
- `nmt-analytics-admin/src/utils/business.ts`
- `nmt-analytics-admin/src/pages/Reports.tsx`
- `nmt-analytics-admin/src/components/analytics/RevenueChart.tsx`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/tests/business.test.ts`
- `nmt-analytics-admin/src/tests/reportsCurrency.test.tsx`
- `nmt-analytics-admin/src/tests/revenueChartLocale.test.tsx`
- `nmt-analytics-admin/e2e/finance-forms/reports-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/reports-locale.tsx`
- `nmt-analytics-admin/e2e/finance-forms/reports-locale.spec.ts`

Git read/push access and PR creation/CI inspection are now working. Earlier REST calls returned `Forbidden`; subsequent `gh pr create` and `gh pr view` succeeded. PR #151 was created; required checks are running. Initial implementation CI run: [40033815623](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40033815623); staging acceptance: [40033815592](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40033815592); UI audit: [40033815576](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40033815576). Final-head status must be checked after this documentation update. Required network additions `api.github.com`, `cdn.playwright.dev` and browser artifact destination `storage.googleapis.com` were saved to the environment draft, preserving existing rules. Draft saving does not itself apply runtime changes. Do not merge until required remote CI is observed green.

Resume: confirm remote feature-branch SHA, reconcile PR #151, run/inspect required exact-head CI (including migration/Docker jobs and the new browser step), record PR and eventual merge SHA, then activate I18N-02 from current main. Phase 1 remains OPEN: candidate literals, other screens, provider-switch edge cases, remaining date/number/export/PDF formatting and authenticated workflow coverage are not certified by this slice.


### I18N-02 completion evidence

Separate branch: `fix/i18n-dictionary-contract`, commit `de1b2a0ea1ecd9db3a01cb4e02c5648f4896fbea`, [draft PR #152](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/152), based on PR #151. Replaces the narrow key-path/flights-empty checks in `nmt-analytics-admin/src/tests/i18nParity.test.ts` with a full dictionary contract plus defective fixtures. Checks missing/extra paths, leaf types, object/array shape, positional array entries, empty strings and distinct interpolation inputs; valid token reordering/repetition, diacritics and shared words remain accepted. The existing rooming count formatter is explicitly probed at 0/1/1234, preserving its public API. New callable translations require explicit test coverage.

Local verification: targeted contract **16 tests passed**; full admin **67 files / 497 tests passed**; lint **zero errors / 51 existing warnings**; production build passed. API source/dependencies unchanged from the verified **1,004 tests**, build and serverless type checks above. No runtime component, dictionary value, auth, tenant policy, database or migration changed in this slice; no additional browser check is required for test-only changes. Existing PR #151 browser evidence remains separate.

Exact changed files: `nmt-analytics-admin/src/tests/i18nParity.test.ts`, `docs/tasks/active/final-i18n-dictionary-contract.md`, `docs/TRAVLINE_FINAL_ROADMAP.md`. Draft PR #152 targets main and explicitly depends on #151; after #151 merges, its incremental diff is only these three files. API/admin CI, migration replay, Docker, shared UI and UI audit checks have passed at its initial head; isolated acceptance/preview were still pending at observation. Require final exact-head CI and dependency completion before marking ready or merging. Next task: I18N-03 provider/switching, including the confirmed untranslated English title on `src/layout/AppHeader.tsx` in Bosnian. Storage-failure/browser-preference and rapid-toggle behavior require regression reproducers before changing the provider. Full Phase 1 remains OPEN.


### I18N-03 shared language selection completion evidence

Separate branch: `fix/i18n-language-switch`, initial implementation `c2451f1720bd20b53241eb431f4396179ddb8f77`, [draft PR #153](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/153), based on I18N-02. Shared provider/switch work is implemented locally; full auth/public navigation acceptance remains open. Regression reproducers against the previous provider: **2 failed / 7 passed** (blocked-storage browser preference, batched toggles). After correction, provider + dictionary contract: **26 passed**. The provider keeps supported stored preference, falls back to browser preference when storage is blocked, uses sequential state updates for toggles and persists committed selection without side effects in state updaters. Existing storage key, hooks, auth and domain interfaces are retained.

AppHeader uses the extracted actual `LanguageToggleButton`, preserving styles/BS-EN target labels and adding localized title, accessible name and `type=button`. BS/EN dictionaries add only switch accessibility strings. Local full admin: **68 files / 507 tests passed**, lint **zero errors / 51 existing warnings**, production build passed. Browser: **12 shared UI scenarios passed**, including four new keyboard/language/reload/theme/viewport checks (390/1440, light/dark) and eight existing modal scenarios. Reports locale browser regression was rerun after the provider change: **4 passed**, including both languages/themes/widths and west-of-UTC calendar days. API source/dependencies remain unchanged from the verified 1,004-test/build/typecheck baseline. No tenant, auth, API, migration, seed/reset or production/Zo changes.

Exact files in this slice:

- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/tasks/active/final-i18n-language-switch.md`
- `nmt-analytics-admin/src/lib/i18n/context.tsx`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/layout/AppHeader.tsx`
- `nmt-analytics-admin/src/components/common/LanguageToggleButton.tsx`
- `nmt-analytics-admin/src/tests/i18nProvider.test.tsx`
- `nmt-analytics-admin/e2e-ui/fixtures/language.html`
- `nmt-analytics-admin/e2e-ui/fixtures/language.tsx`
- `nmt-analytics-admin/e2e-ui/language.spec.ts`
- `nmt-analytics-admin/e2e/pilot-language.spec.ts`

Integration order remains [#151](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/151) → [#152](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/152) → [#153](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/153), with required CI before every merge. At latest observation #151 passed API/admin, migrations/rehearsals, Docker, shared UI including Reports, UI audit and preview; isolated Supabase acceptance remained running. No merge is claimed. Finish the auth/public route matrix with isolated test accounts, then I18N-04 domain slices, starting CustomerDetail and sales. Keep all other literal/locale/export/PDF findings open; neither this provider fix nor dictionary parity completes Phase 1.


### Current resume checkpoint

Latest source branch is `fix/i18n-language-switch`; working tree was clean after commits/pushes. PRs #152/#153 are drafts against main with explicit dependencies; their incremental diffs become focused after preceding PRs merge. Do not merge a descendant before its predecessor. Required staging acceptance for #151 was still installing Playwright at the last observation; no failure or completed acceptance result was claimed. Read current exact-head GitHub checks before any merge. The next source-level work is the remaining I18N-03 auth/public route matrix, then I18N-04 CustomerDetail/sales translation slices from the inventory. Full Phase 1 and all later phases remain open. No published environment or Zo runtime is certified by these PRs.


I18N-03 route-matrix follow-up: `nmt-analytics-admin/e2e/pilot-language.spec.ts` adds **four** localhost-only public → signup-confirmed login → header switch → Reports/reload → public route while authenticated → real logout → public/reload scenarios, covering initial BS/EN and both themes at desktop width. Every scenario owns a separate synthetic account so sign-out cannot revoke the shared acceptance manager sessions. Local Auth/API/Mailpit endpoints are mandatory; verification links must match local Auth origin; trace/video/screenshots are disabled for credential-bearing steps. Standard staging acceptance discovers the file automatically. `playwright ... --list` confirmed all four scenarios; lint passed. They are **not locally executed or claimed passed** because the current machine has no isolated Auth bindings. Required isolated CI execution remains pending. Existing mobile shared-switch scenarios are separate from this desktop authenticated route matrix.

Newly confirmed follow-up finding for the CustomerDetail slice: its summary reduces up to 50 reservation rows across currencies and formats the result as default BAM, and timeline reservation amounts omit record currency. Translate the screen only with an explicit disposition of these pre-existing misleading totals; add mixed-currency/pagination regression coverage in a scoped task and do not silently preserve or disguise the defect as translated financial output. No customer/financial data was modified during this audit.


### I18N-04A — CustomerDetail screen and currency display

Branch: `fix/i18n-customer-detail`, after #151–#153. Existing screen translated in BS/EN: tabs, columns, metadata, customer/status labels, timeline action/type/details, summaries, empty states, loading and retry/not-found states. Live language changes update labels/amounts without refetching. Numeric Bosnian/English dates are explicit; date-only bookings keep their calendar day west of UTC while timestamps remain local instants. Existing cards/tabs/table/theme layout is preserved.

The confirmed currency defect was pulled forward from SEC-02 within the scoped specification `docs/tasks/active/final-i18n-customer-detail.md`: summaries separate loaded rows by currency, disclose loaded count versus server count, exclude missing-currency rows with an explicit notice and leave incomplete monetary fields unavailable. No currency conversion, full-history aggregate claim or stored financial recalculation. Timeline API reads now include existing reservation currency and return an error on failed underlying reads; organization/customer filters are retained. Superseded customer requests cannot overwrite the current route, and child-read failures cannot masquerade as a genuine customer 404.

Evidence:

- Reproducer against old API: **4 failed / 1 passed**. Old UI: **7 failed / 1 passed**.
- Targeted timeline route: **5 passed**, including two-tenant query scoping, customer scoping, original currency and safe read-error behavior. Authentication itself remains covered by the existing auth suites; these route fixtures mock identity deliberately.
- Full API: build, root strict + NodeNext serverless type checks and **113 files / 1,009 tests passed**.
- Full admin: lint **zero errors / 51 existing warnings**, build and **69 files / 517 tests passed**. Includes ten CustomerDetail component regressions plus the complete dictionary contract.
- Actual CustomerDetail browser fixture: **7 passed** (both languages, light/dark at 390/768/1440, west-of-UTC date-only dates, currency-separated summary/table/timeline, live switching without refetch, pagination notice and failed-read retry). Reports regression rerun: **4 passed**. Combined command: `FORMS_CHROMIUM_PATH=<official Chrome executable> npm exec -- playwright test -c playwright.finance-forms.config.ts customer-detail-locale.spec.ts reports-locale.spec.ts`.
- Registered CustomerDetail locale scenarios beside Reports in CI's shared UI browser job; standard staging finance-form acceptance also discovers them.
- No migrations, schema changes, seeds/reset, production/customer writes, auth/permission changes or Zo runtime changes. API changes are additive read output plus safe read failures. `git diff --check` passed.

Exact changed files:

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-customer-detail.md`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/pages/CustomerDetail.tsx`
- `nmt-analytics-admin/src/tests/customerDetailLocale.test.tsx`
- `nmt-analytics-admin/e2e/finance-forms/customer-detail-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/customer-detail-locale.tsx`
- `nmt-analytics-admin/e2e/finance-forms/customer-detail-locale.spec.ts`
- `nmt-analytics-api/src/routes/customers.ts`
- `nmt-analytics-api/src/tests/customerTimelineCurrency.test.ts`

PR/merge and required exact-head CI pending. Continue integration in dependency order; do not mark I18N-04 or Phase 1 complete from this one screen. Next domain: the existing NewSaleWizard (trip/travelers/accommodation/add-ons/payment/review), which still contains hardcoded Bosnian labels/validation/messages despite an existing i18n provider. Its conditional behavior, capacity/finance/idempotency/recovery rules and current acceptance tests must remain intact; translate it as one scoped workflow and make legacy language assumptions explicit in tests.

Current source resume checkpoint supersedes the earlier provider-only checkpoint: branch `fix/i18n-customer-detail`; foundation PRs #151–#153 remain dependencies. Read current GitHub check states before merging; no merge is claimed in this record. Full Phase 1 and later phases remain open.


### Integration update — PR #151 merged

PR [#151](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/151) merged as `dbb512372a019c9f8dffa6f40118a8a9533400f4` after all required checks passed on `f2c38f4f4b6f2eea87677f1715689fa1ea6efe6c`: CI [40033876796](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40033876796), isolated acceptance [40033876477](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40033876477), UI audit and preview. This certifies those isolated/local workflows, not Zo runtime. #152/#153 and [CustomerDetail draft #154](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/154) remain separate dependent work.

Current active source branch: `fix/i18n-new-sale-wizard`, created from fresh origin/main at `dbb5123`. The scoped specification is `docs/tasks/active/final-i18n-new-sale-wizard.md`; earlier I18N-04A source remains preserved on its separate branch/PR. Latest detailed roadmap records from those branches are retained here.


### Integration update — foundation and CustomerDetail PRs merged

- [#152](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/152) merged as `1011feeabf1679de25885b4564abc0d786438892` after required checks passed on `de1b2a0ea1ecd9db3a01cb4e02c5648f4896fbea`.
- [#153](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/153) merged as `422651c396ce5dc385b4356082be0ca7d7d56e21` after required checks passed on `2d4b12e3359449646178a9d32d6fae7efcfc5aa0`: CI [40035375596](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40035375596), isolated acceptance [40035375513](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40035375513). Downloaded job logs confirmed **26 form-contract, 152 finance-form and 195 authenticated acceptance scenarios passed**, including all four new initial-BS/EN, light/dark public/authenticated language lifecycles. This supersedes the earlier pending execution note. The separate artifact download was network-denied; job logs supplied the required execution evidence. The exact Azure artifact hostname was added to the environment draft without replacing other network rules; draft persistence does not prove runtime application/publication.
- [#154](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/154) merged as `8cf3f1a43390db48569bd52be3ac0c8c21757204` after required checks passed on `b6b6177724aa3d4c40f568d0c493b087d4269626`: CI [40036545455](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40036545455), isolated acceptance [40036546248](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40036546248), UI audit and preview. CustomerDetail currency/translation repairs are now in main.

Wizard work was preserved in a named local stash while this branch fast-forwarded to verified latest main `8cf3f1a`. Its changes were reapplied; only CI registration and roadmap text overlapped, resolved by retaining Reports, CustomerDetail and New Sale browser checks plus all prior evidence. No application source from the merged PRs was discarded. Current active source is `fix/i18n-new-sale-wizard`; verify the combined tests before committing/opening its PR. All earlier pending integration notes are historical observations superseded by this update. Full Phase 1 and later phases remain open.


### I18N-04B — New Sale Wizard verification on integrated main

Current branch: `fix/i18n-new-sale-wizard`, based on verified `8cf3f1a` main. The existing six-step conditional sale workflow now uses BS/EN dictionaries for labels, accessible names, placeholders, validation, notifications, review and locale money/date display. Visible validation translates immediately while entered drafts survive language changes. Traveler readiness and room counts use Bosnian plural forms. Existing pricing, capacity, document requirements, accommodation assignment, installments and idempotency/recovery rules remain covered; persisted booking snapshot labels and machine identifiers retain their previous contract. Unknown errors use translated fallback rather than raw API diagnostics.

Evidence after integrating foundation and CustomerDetail changes:

- Before repair, all three new component regressions failed; afterward the focused wizard suite passed **63 tests across 11 files**. Existing business assertions remain; tests explicitly select their language.
- Combined admin: **70 files / 520 tests passed**, production build passed, lint **zero errors / 51 existing warnings**. Dictionary structure/token coverage includes the new namespace.
- Actual wizard browser fixture: **8 full-flow scenarios passed**, BS/EN × light/dark × 390/1440; mandatory document details, selected hotel inventory, optional insurance, visible validation/live preference change with draft retention, no language-triggered fetch, unchanged numeric total and structured reservation payload. Preference changes are simulated through fixture context events inside the real modal focus trap; shared-header switching has separate real keyboard/browser coverage. Synthetic transport only; no customer writes.
- Combined Reports + CustomerDetail + New Sale browser suite: **19 passed**. Shared UI/language keyboard regression suite: **12 passed**.
- Real authenticated sale acceptance keeps existing single-POST, API/database, contract/PDF and finance assertions, now explicitly choosing English and matching translated wizard controls. Its local execution requires unavailable isolated Auth/DB/Storage/SMTP bindings; exact-head GitHub acceptance remains the merge gate.
- CI registration retains all three locale suites. No migrations, seeds/reset, auth/RLS/tenant changes, dependencies or Zo runtime operations. API is unchanged from verified #154; fresh API build and **113 files / 1,009 tests passed**.

PR and exact-head remote CI pending. Full Phase 1 remains open; next priorities are the Reservations list/edit workflow and ReservationDetail, followed by the remaining inventory. No later phase is certified by this translation PR.

Exact I18N-04B changed files (repository-relative):

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-new-sale-wizard.md`
- `nmt-analytics-admin/e2e/finance-forms/new-sale-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/new-sale-locale.spec.ts`
- `nmt-analytics-admin/e2e/finance-forms/new-sale-locale.tsx`
- `nmt-analytics-admin/e2e/pilot-browser-sale.spec.ts`
- `nmt-analytics-admin/src/components/reservations/NewSaleWizard.tsx`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/tests/newSaleAccommodationFlow.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleAccommodationResolution.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleAddonsFlow.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleAutoAccommodation.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleClearTransportAlternatives.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleDepartureTransport.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleInstallmentSchedule.test.tsx`
- `nmt-analytics-admin/src/tests/newSalePassengerSlots.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleTravelerReadiness.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleWizardLocale.test.tsx`
- `nmt-analytics-admin/src/tests/newSaleWizardStructure.test.tsx`


### I18N-04C — Reservation Detail implementation checkpoint

New Sale [PR #155](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/155), head `f58c7bc3d5b89f05a7886a7c39ea09a9bbbe5f4f`, is open: build/unit/browser/migration/Docker/preview checks passed; isolated acceptance remains pending at this observation. Merge requires every required exact-head check. A temporary cloud disconnection interrupted subsequent work; the restored checkout retained its scoped task and tests.

Current branch: `fix/i18n-reservation-detail`, initially fresh main `8cf3f1a`; spec `docs/tasks/active/final-i18n-reservation-detail.md`. The existing five tabs, document/readiness/status labels, financial summaries, sold-service display, downloads and contract dialog now follow BS/EN. Calendar-only dates retain their day west of UTC, money retains source currency/numeric amounts, and live switching retains the selected tab without refetching. Unknown service errors use translated fallbacks. Preserved manager financial-write restrictions, incomplete-sale gating, reservation-filtered manifest, canonical accommodation, top-level sold snapshot and payment/contract payloads. EditReservationModal remains a separate open translation task. No API, schema/auth/RLS, dependency, seed/reset, customer-data or Zo runtime changes.

Evidence:

- Three new locale regressions failed against the original page and passed after repair. A fourth covers localized contract failure without raw diagnostics. Existing tests explicitly select Bosnian while retaining business assertions.
- Full admin before the additional error regression: **70 files / 520 tests passed**, lint **zero errors / 51 existing warnings**, production build passed. Final focused/combined runs are being completed.
- Actual Reservation Detail browser fixture: **8 passed**, BS/EN × light/dark × 390/1440, America/Los_Angeles. Covered overview, passenger filtering/document dates, installments, Agent payment restrictions, canonical hotel/add-on currency, live switching with retained Services tab/no refetch, Documents and contract-generation payload. Synthetic transport only.
- Authenticated finance acceptance now matches its explicitly English Payments/Record payment controls. Quotation conversion acceptance selects the edit button for its existing BS/EN scenario. Original API/database/ledger/refund/idempotency/locked-quotation assertions remain. Local isolated Auth/DB credentials are unavailable; remote acceptance is the merge gate.
- CI locale matching uses `locale.spec.ts`, retaining earlier suites and discovering subsequent locale fixtures. Combined browser command and fresh API baseline are being finalized.

Deferred confirmed Phase 2 finding: ReservationDetail swallows manifest/accommodation/installment read failures and can show apparent empty data. Repair these read states with failure/retry tests in a focused functional task. This translation PR does not certify those error states.

Next: integrate verified #155 main, complete combined checks, open Reservation Detail PR, then Reservations list/EditReservationModal. Full Phase 1 and all later phases remain open; hosted demo/Zo runtime remain unverified.

Final local checkpoint for I18N-04C: **37 focused tests passed** (existing ReservationDetail behavior, four locale/error regressions and full dictionary contract); **19 combined Reports/CustomerDetail/ReservationDetail browser scenarios passed** using the exact new CI selector `locale.spec.ts`; fresh API build and **113 files / 1,009 tests passed**. Browser fixture identity is synthetic Agent context; the existing unit suite separately verifies manager/Agent payment permissions. No authentication/RLS isolation claim is inferred from the fixture.

Final admin rerun including the error regression: **70 files / 521 tests passed**, lint **zero errors / 51 existing warnings**, production build passed. `git diff --check` passed. Full Phase 1 remains open.

Exact I18N-04C changed files (repository-relative):

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-reservation-detail.md`
- `nmt-analytics-admin/e2e/finance-forms/reservation-detail-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/reservation-detail-locale.spec.ts`
- `nmt-analytics-admin/e2e/finance-forms/reservation-detail-locale.tsx`
- `nmt-analytics-admin/e2e/pilot-finance-audit.spec.ts`
- `nmt-analytics-admin/e2e/pilot-quotation-booking.spec.ts`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/pages/ReservationDetail.tsx`
- `nmt-analytics-admin/src/tests/reservationDetail.test.tsx`
- `nmt-analytics-admin/src/tests/reservationDetailLocale.test.tsx`


### Integration update — New Sale merged; Reservation Detail refreshed

[#155](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/155) merged as `d1c4514c8c395c17757e7ffac328075ded1361ba` after every check passed on `f58c7bc3d5b89f05a7886a7c39ea09a9bbbe5f4f`: CI [40039786774](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40039786774), isolated Supabase acceptance [40039786781](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40039786781) (**20m08s**, success), UI audit and preview. This supersedes prior pending observations; no Zo runtime certification is implied.

Reservation Detail [PR #156](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/156), implementation `efc72538610db356c00f02d202746bdcd6c7709f`, is refreshed with this verified main. CI/roadmap/inventory overlaps retain the generic locale selector and all prior evidence; dictionary source merged automatically. Combined admin/browser checks are rerunning on the integrated source, followed by required exact-head CI before merge. Editor work is safely stashed while completing this integration; it has not been included in #156.

Integrated #156 validation after #155 main: admin **71 files / 524 tests passed**, lint **0 errors / 51 existing warnings**, and **27 locale browser scenarios passed**, covering Reports, CustomerDetail, New Sale and ReservationDetail together. Production build passed. Required exact-head CI remains the merge gate.


### CI correction and verified editor integration — #156/#158

Editor [#157](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/157) merged independently as `6dbe3c2dbe6d1d5ea895f616dbd1243401574e2a` after all checks passed on `f807dce2ba7edaad84da2bb5ad637cea7cdf7849`, including isolated acceptance [40042221361](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40042221361) (26m14s). It has no functional dependency on the pending Detail translation. Its implementation/evidence remain recorded in its scoped task and PR. Main is authoritative; no Zo runtime verification is implied.

#156 acceptance [40041943376](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40041943376) failed after earlier local checks passed. Inspection confirmed `e2e/pilot-mobile-layout.spec.ts` explicitly selects English but still clicks hardcoded Bosnian Documents/Overview tabs. Align those selectors with the English dictionary, retaining all authenticated viewport/theme/navigation checks and assertions. Remote acceptance must confirm the correction; do not mark it passed from code inspection.

#158's Test Admin annotations identify asynchronous recovery assertions in `newSaleInstallmentSchedule.test.tsx`: a notification mock can be observed before React commits the recovery link, and clearAllMocks retains unconsumed once-only responses after a failing test. Await the actual recovery link/disabled button and reset mocks before rebuilding each test's responses. Keep idempotency identity, single API submission, no premature success/close and manual-recovery assertions unchanged. No application behavior, timeouts, retries or gate requirements are changed. Four targeted recovery tests pass in normal and shuffled order; the full 524-test admin suite/build on #158 also passes locally after correction.

CI logs/artifacts currently redirect to network-denied Azure hosts (`productionresultssa10.blob.core.windows.net`, `productionresultssa16.blob.core.windows.net`). GitHub check annotations remain readable and supplied the unit failure locations. Static inspection found the stale browser selectors; a new exact-head CI run remains necessary to establish all acceptance outcomes. Do not infer that every acceptance failure is explained until it passes.

#156 is now integrating verified #157 main. Dictionaries retain both reservationDetail and reservationEditor namespaces; CI/roadmap overlaps retain all prior verification records and generic locale registration. Combined local checks and exact-head remote CI follow before merge. No API, schema, data or runtime operations are introduced by these test corrections.

Post-correction integrated #156 verification: lint **0 errors / 51 existing warnings**, **71 files / 527 admin tests passed**, production build passed, and **35 locale browser scenarios passed** (Reports/CustomerDetail/New Sale/Reservation Detail/editor). Authenticated mobile spec discovery lists **12 scenarios**; these are not claimed locally executed. Remote exact-head acceptance must execute them. No migrations or production data actions.

### I18N-04D — Reservation editor BS/EN and currency display

Current branch `fix/i18n-reservation-editor` was fast-forwarded to verified main `d1c4514` after #155; editor changes were reapplied from their named safety stash without conflict. #156 remains a separate PR, refreshed on main at `e713d4d`; it is not included in this editor source.

The existing modal now translates labels, status options, dates, accommodation instructions, validation, notifications and stored read errors. Locale changes preserve drafts and do not refetch. Associated field labels use React-generated unique IDs. Fixes confirmed misleading currency labels using already loaded reservation currency: normal EUR amount/accommodation displays no longer say BAM, and canonical `addons_total_at_booking` is labelled in reservation currency instead of the first add-on's currency. Individual add-on rows retain their own currency. Stored money, quote locks, numeric save payloads and mutation order remain unchanged; no FX calculation is introduced. Unknown errors use localized fallback.

Evidence before integration: existing three accommodation tests passed; all three new locale/error/quote-lock regressions failed before repair and then passed. **29 focused tests passed** including quotation booking and dictionary contract. Lint/build passed. Actual editor browser fixture **8 passed**, BS/EN × light/dark × 390/1440, west-of-UTC date-only departures, live preference event inside the real modal focus trap, draft retention/no refetch, canonical-versus-add-on currency, four quotation-lock cases, exact reservation/accommodation payloads and successful close. All transport is synthetic. Final combined admin/browser checks after integrating #155 are running.

Preserved canonical accommodation selection, unique passenger assignment, room capacity/coverage, quoted-booking immutable total, core/accommodation mutation sequence and open-on-failure behavior. No API/schema/auth/RLS/dependency/seed/reset/production/Zo changes. API source remains identical to the fresh build/1,009-test baseline recorded for #156. Existing two-step-save partial-success risk remains a separate Phase 2 functional repair; a localized failure does not claim atomicity.

Next: required exact-head CI and isolated acceptance before merge; Reservations list/CreateReservationModal and remaining dictionary/literal inventory remain open. All later phases remain open.

Final editor validation after integrating #155: **70 files / 523 admin tests passed**, production build passed, and **27 combined locale browser scenarios passed** (Reports, CustomerDetail, New Sale, editor). Lint rerun returns **zero errors / 51 existing warnings** after exporting the isolated fixture component normally. `git diff --check` passed. The eight editor browser cases include mixed line-versus-canonical currencies and exact save payloads; preference events update actual context while preserving the modal focus trap. Required exact-head CI/isolated acceptance remain pending PR gates.

Exact I18N-04D changed files (repository-relative):

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-reservation-editor.md`
- `nmt-analytics-admin/e2e/finance-forms/reservation-editor-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/reservation-editor-locale.spec.ts`
- `nmt-analytics-admin/e2e/finance-forms/reservation-editor-locale.tsx`
- `nmt-analytics-admin/src/components/reservations/EditReservationModal.tsx`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/tests/editReservationAccommodationFlow.test.tsx`


### I18N-04E — Reservations list and pagination

Current branch `fix/i18n-reservations-list`, from verified main `d1c4514` (#155). Reservation Detail #156 remains separate at `e713d4dd8bf562902c5ae1fc41f3197e8774734b`; editor [#157](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/157) is preserved at `f807dce2ba7edaad84da2bb5ad637cea7cdf7849`. Their required CI is pending at this observation; neither is claimed merged.

The list now translates headings, columns, filter/access/empty/context states, prompts, individual actions, batch outcomes and notifications in BS/EN. Shared Pagination footer/buttons follow the active language, retaining ungrouped integer counts and paging behavior. Each monetary cell now uses its original reservation currency and selected locale instead of default BAM; backend balances, absolute credit display and payment/status codes remain unchanged. Added accessible names for row/all selection, dates, status and clear-selection controls. Live switching preserves selection/filter inputs without refetch. Batch controls wrap at mobile widths after a confirmed overflow in the browser reproducer.

Local evidence so far:

- Four new list regressions failed before repair; **20 focused tests passed** afterward, including full dictionary contract. Cases cover mixed BAM/EUR rows/credit, live switch/no refetch, selected IDs and exact enum batch payload, Agent finance restrictions and page request parameters.
- Full admin **71 files / 524 tests passed**, lint **0 errors / 51 existing warnings**, production build passed. This source includes #155, but not pending #156/#157 implementation.
- Actual page browser fixture **8 passed**, BS/EN × light/dark × 390/1440. Exercised row currencies/backend credit, Agent restrictions, selection/date retention/live language switch, exact synthetic batch HTTP payload and page 2 query with retained date. Mobile no-horizontal-overflow assertion failed before the targeted wrapping repair and now passes. Synthetic transport only, not a claim of live tenant authorization.
- Existing authenticated sale acceptance uses its explicit English New reservation label. Finance acceptance uses its existing English search/payment list controls. No API/database/ledger/refund/idempotency assertions were removed.
- Combined locale/production checks are being finalized with the generic CI selector. No API, migration, schema, auth/RLS, dependency, seed/reset, production/customer writes or Zo runtime operations. API source is unchanged from the documented fresh build/1,009-test baseline.

Deferred confirmed Phase 2 list defects: status/date changes or filter clearing do not directly refetch; invalidation omits the search query; failed initial reads can display an apparent empty result after a toast. The translation tests verify retained input state and paging parameters, not functioning live filter application or truthful failed-read UI. Repair those behaviors in a focused functional task with failing regressions.

Next: required exact-head CI/isolated acceptance, integrate verified pending main without discarding their tests, then remaining Phase 1 screens/shared error states. The legacy CreateReservationModal should first be classified by actual route/import usage; do not rebuild an unused alternative sale workflow. Phase 1 and all later phases remain open.

Legacy classification: `rg -n CreateReservationModal nmt-analytics-admin/src --glob !**/tests/**` found only its own interface/function definition, with no runtime import or route reference. Keep it preserved as unreachable legacy code; the active creation flow is NewSaleWizard, already addressed in #155. Do not implement a second creation workflow.

Final I18N-04E verification: **20 focused tests**, **71 files / 524 full admin tests**, lint **zero errors / 51 existing warnings**, production build and **27 combined locale browser scenarios passed** using CI's generic `locale.spec.ts` selector. Four original locale regressions failed before repair; all now pass. No API source changed, and the documented fresh build/1,009-test baseline remains unchanged. Required exact-head CI/isolated acceptance remains the merge gate. `git diff --check` passed.

Exact I18N-04E changed files (repository-relative):

- `.github/workflows/ci.yml`
- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-reservations-list.md`
- `nmt-analytics-admin/e2e/finance-forms/reservations-list-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/reservations-list-locale.spec.ts`
- `nmt-analytics-admin/e2e/finance-forms/reservations-list-locale.tsx`
- `nmt-analytics-admin/e2e/pilot-browser-sale.spec.ts`
- `nmt-analytics-admin/e2e/pilot-finance-audit.spec.ts`
- `nmt-analytics-admin/src/components/ui/DataTable.tsx`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/pages/Reservations.tsx`
- `nmt-analytics-admin/src/tests/reservationsListLocale.test.tsx`


### CI correction — #158 and verified editor main

Editor #157 merged independently as `6dbe3c2dbe6d1d5ea895f616dbd1243401574e2a` after all required checks passed on `f807dce2ba7edaad84da2bb5ad637cea7cdf7849`, including isolated acceptance [40042221361](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40042221361), 26m14s success. This supersedes prior pending observations. #158 now integrates that verified main; dictionaries preserve both reservationList/pagination and reservationEditor. No implementation was discarded to resolve overlap. #156 remains independently open, corrected and refreshed on this main at `5495c78`.

#158 original Test Admin [40043078914](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40043078914) failed in two existing New Sale recovery assertions, despite original local passes. Its original isolated acceptance [40043078907](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40043078907) passed (23m58s). GitHub annotations identify an immediate recovery-link lookup after a toast callback; the following test can inherit unused once-only mock responses because clearAllMocks clears calls rather than implementations. Reset mocks before each setup and await actual recovery link/disabled-button state. Preserve all idempotency/single-submit/no-premature-success/manual-recovery assertions; no product logic, timeouts, retries or test gates change. Four recovery tests pass in normal and shuffled order; the 524-test pre-integration admin suite/build also passed. Combined validation on verified #157 main follows before publishing the correction.

#156's failed acceptance also exposed a confirmed stale test: the mobile audit explicitly selects English but clicks Bosnian Documents/Overview. It now uses English dictionary selectors while retaining authenticated navigation/theme/overflow assertions. New exact-head CI must establish the complete result; do not claim all acceptance failures explained until green.

Logs/artifacts redirect to network-denied Azure hosts; check annotations remain readable. No credentials were requested or exposed. No API, schema, data or Zo runtime changes. Phase 1 remains open, and #156/#158 require fresh exact-head CI before merge.

Post-correction #158 integrated-main checks: lint **0 errors / 51 existing warnings**, **71 files / 527 admin tests passed**, production build passed, and **35 locale browser scenarios passed** (Reports/CustomerDetail/New Sale/editor/list). A temporary permission change blocked local sockets during the first browser attempt; network access was restored through the environment permission tool and this final browser run actually executed. Earlier blocked attempts are not counted as passes. Dictionaries retain both list/pagination and editor namespaces; no source conflict markers remain. API source/migrations/customer data unchanged. Required fresh exact-head GitHub checks remain pending.


### Integration checkpoint — Detail merged; final list integration

[#156](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/156) merged as `60355ff7af0b5d97ceab4902650222d9b48539cb` after all checks passed on `5495c78edce3879dc9b6f70b4b47e16704bfc64e`: CI [40080314656](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40080314656), isolated acceptance [40080314705](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40080314705), **23m46s success**, UI audit and preview. This confirms the corrected mobile language selectors and retained full acceptance gate. Previous failed/pending observations are historical. No Zo runtime certification is implied.

#158 also passed all checks on `cef34e7f3d0b71a681b41647908d73b157ed6a8f`: CI [40080685328](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40080685328), isolated acceptance [40080685229](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40080685229), **18m27s success**. Thus the corrected recovery assertions pass in CI with all business assertions intact. It now integrates latest main after #156 before its own merge. Dictionary conflicts retain reservationList/pagination, reservationDetail and reservationEditor; finance acceptance retains translated controls from both branches; all browser fixtures remain registered. Combined local checks and fresh exact-head remote CI remain required on this integration.

PRs #151–#157 are merged. Current active source is `fix/i18n-reservations-list` / #158. The roadmap retains exact files/evidence and deferred defects for every scoped slice. Phase 1 remains open after this list workflow; remaining candidates include settings/integrations, operational screens and shared error/empty states. No production/customer data or Zo runtime action was performed.

Final all-sales integration for #158: lint **0 errors / 51 existing warnings**, **72 files / 531 admin tests passed**, production build passed, and **43 locale browser scenarios passed** across Reports, CustomerDetail, New Sale, ReservationDetail, editor and list together. All namespaces and prior regression suites are retained. API remains unchanged from its verified 1,009-test baseline. Publish this integration and require fresh exact-head CI/isolated acceptance before merging #158.


### I18N-04F — Shared DataTable empty/render-error feedback

Current branch `fix/i18n-table-feedback` starts from verified main `60355ff` after #156. #158 is independently refreshed at `3fb62dbe0b7d847b8c31afc31742ba3e8969bafa`, with final all-sales local checks of 531 admin tests/43 browser cases and required exact-head CI pending. That list implementation is not in this shared-table branch.

DataTable defaults and render-error/retry feedback now follow BS/EN. Caller-supplied emptyMessage, including empty string, remains intact; loading skeleton and table/cell markup remain. The class boundary receives translated labels from the existing provider, so language changes in a failed table do not discard the failure or retry cells.

Required regression discovery also confirmed a functional defect: direct column.render callbacks executed while DataTable constructed its children, before its returned TableErrorBoundary mounted, so their exceptions escaped the table. A small child component now evaluates those same callbacks under the existing class boundary, retaining arguments/results/DOM while containing the render failure. The test exercises the actual throwing renderer, then corrected input and explicit retry; this is not an artificially forced boundary state. No API/data mutation, timeout/retry relaxation, root-boundary move or new architecture is introduced.

Evidence:

- Old source: **3 failed / 2 passed** across five new tests, including the escaping render exception. Corrected source: all **5 passed**; full dictionary/focused suite **21 passed**. Verified live locale change without repeated renderer attempts, custom/empty-string feedback, loading-to-empty and corrected-input-only explicit recovery.
- Full admin: **72 files / 532 tests passed**, lint **zero errors / 51 existing warnings**, production build passed.
- Actual browser empty → row → cell exception → live locale switch → corrected input → explicit retry flow: **8 passed**, initial BS/EN × light/dark × 390/1440. All use the real DataTable and language toggle, synthetic local data, no API requests. Combined registered locale suite is completing. CI's existing generic locale selector discovers this fixture automatically.
- API unchanged from the recorded fresh build/1,009-test baseline. No migrations, schema/auth/RLS, dependency, production/customer writes, seed/reset or Zo runtime changes. Error logging and explicit retry behavior are retained.

Future bootstrap task: `main.tsx` places root ErrorBoundary outside I18nProvider, and it still has English fallback copy. Preserve startup failure containment when localizing it; do not simply move it inside the provider. Parent API read errors/false empty states remain the separately recorded Phase 2 repairs; render-error containment does not repair failed-read semantics. Settings/integrations and remaining operational literal inventory are still open. Phase 1 and later phases remain unfinished.

Final I18N-04F combined validation: **43 locale browser scenarios passed**, exercising Reports/CustomerDetail/New Sale/ReservationDetail/editor/shared table feedback. Existing list #158 remains independent and pending required CI. Main history and each scoped evidence section are retained; all later phases remain open.

Exact I18N-04F changed files (repository-relative):

- `docs/TRAVLINE_FINAL_ROADMAP.md`
- `docs/operations/final-i18n-inventory.md`
- `docs/tasks/active/final-i18n-table-feedback.md`
- `nmt-analytics-admin/e2e/finance-forms/table-feedback-locale.html`
- `nmt-analytics-admin/e2e/finance-forms/table-feedback-locale.spec.ts`
- `nmt-analytics-admin/e2e/finance-forms/table-feedback-locale.tsx`
- `nmt-analytics-admin/src/components/ui/DataTable.tsx`
- `nmt-analytics-admin/src/lib/i18n/bs.ts`
- `nmt-analytics-admin/src/lib/i18n/en.ts`
- `nmt-analytics-admin/src/tests/dataTableLocale.test.tsx`
