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
| I18N-01 / PR OPEN (#151; CI pending) | Reports monetary and chart calendar-day locale: admin `src/utils/business.ts`, `src/pages/Reports.tsx`, `src/components/analytics/RevenueChart.tsx`. Keep the legacy formatter default for unrelated callers; add BS/EN chart month labels because Chromium Bosnian month data falls back to generic M04-style labels. | Baseline inspection | BS/EN totals, table and chart follow selected language immediately and after reload; actual BAM/EUR identity, mixed-currency guards and amounts preserved; no calendar-day drift west of UTC. Browser CLDR fallback uses Bosnian separators and unambiguous currency codes (KM/€ retained); other currencies may use ISO codes when native Bosnian symbols are unavailable. Unit formatter/Reports/chart regressions plus browser BS/EN, light/dark, mobile/desktop. |
| I18N-02 / OPEN | Translation coverage contract: `src/lib/i18n/{en,bs}.ts`, `src/tests/i18nParity.test.ts`; inventory nested value types, empty strings, interpolation tokens and hardcoded user-facing strings. | I18N-01 | Existing keys remain compatible; nonempty strings and placeholder parity enforced across dictionaries; report literal inventory with explicit technical/proper-name exceptions; failing fixtures prove the coverage checker detects defects. |
| I18N-03 / OPEN | Language persistence/switching: `src/lib/i18n/context.tsx`, `src/layout/AppHeader.tsx`, auth/public screens and `src/pages/admin/Settings.tsx`. Confirm defects before changing behavior. | I18N-02 | Stored/browser fallback, reload, blocked storage, document language, public/authenticated transitions and accessible switch verified in BS/EN. Provider/component tests and browser navigation tests; no session reload loop. |
| I18N-04 / OPEN | Translate one domain per PR: first `src/pages/CustomerDetail.tsx`, then sales/reservations, departure operations, finance/docs, settings/public screens. Audit UI validation/toasts/empty states, API message presentation and exports/PDF locale contracts. | I18N-02, I18N-03 | Each domain has an explicit literal checklist; changed screens contain no unintended mixed language. Component failure/success-state tests and BS/EN browser checks for each PR. Preserve stored status codes and API contracts. |
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
