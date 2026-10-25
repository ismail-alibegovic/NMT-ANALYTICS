# Travline — Commercial Production Readiness

Updated **2026-10-25**. Objective: a stable, secure, professionally usable SaaS for real travel agencies and their daily operations. This replaces the competition/demo delivery objective. GitHub `main` is the single source of truth; Codex owns application changes, regression tests, protected PRs and CI. Hosting is a deployment choice: retain portability across supported Node 24/container/serverless paths. Zo is optional, not the required long-term production host.

## Current decision: NO-GO for commercial production

Completed code is not verified infrastructure. Unit tests, builds, synthetic browser fixtures and isolated Supabase acceptance prove their exercised boundaries only. Do not certify a hosted schema, recovery capability, real agency workflow, production monitoring or full product readiness from those results. No verified production backup/restore inventory, measured hosted RPO/RTO, final deployment acceptance or complete agency onboarding evidence is available here.

The user authorizes safe application development, tests and protected GitHub integration. **No real customer writes, unapproved hosted migrations, destructive hosted actions, provider activation, secret exposure or manual production deployment.** Old task descriptions never override this restriction. Keep an explicit migration order and operational approval ledger; never run historical/demo seeds to provision a real agency.

## Reconciled source and completed work

Latest origin/main inspected: **bda422ff69d9d47e50dda8b287a829bf5c271cc5**, merge [#163](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/163). PRs **#151–#163 are merged**. Do not repeat their completed audits or rebuild modules.

| Completed batch | Evidence and scope |
| --- | --- |
| #151–#159 | Reports/customer/sales/reservation BS/EN and locale fixes; dictionary token/shape contract; language persistence/public-auth switching; table feedback/error containment. These do not establish repository-wide translation completion. |
| #160 | Truthful filtered reservation reads, stale/search/retry handling. Merge 7abb04ad099a0edfcacc36e3169bd4270845f942; [CI 40090322640](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40090322640), [isolated acceptance 40090322680](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40090322680). |
| #161 | Atomic combined reservation editor; tenant/customer/currency/capacity/quotation guards and rollback. Merge ad62d77e7aa3c1f7d7b8ffb2bb0f622611a6564b; [CI 40095659271](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40095659271), [isolated acceptance 40095659268](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40095659268). |
| #162 | Node 24 in launchers, CI and Docker; strict environment protections retained. Merge 53d41ec3f92358b1b800c4f7c15f8239cc30b870; final c376547 passed [CI 40137978854](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40137978854), [isolated acceptance 40137978765](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40137978765). |
| #163 | Core/status/batch/delete capacity and reservation mutations made transactional; immutable financial/quotation history; cancelled traveler seats/rooms released atomically with manager-lock protection. Final 50f1282 passed [CI 40141745170](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40141745170), [isolated acceptance 40141745419](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40141745419), UI audit/Docker/preview, then merged. **1,030 API tests, 553 admin tests, 118-migration replay**; authenticated financial/seat regressions executed. No hosted migration applied. |

Older detailed evidence is retained in [the pre-commercial roadmap](plans/2026-10-24-pre-commercial-final-roadmap.md). Its priorities and operational authorization are historical. The existing authorization/financial/Storage/security/recovery acceptance suites remain the foundation for subsequent batches.

## Authoritative priorities and exit gates

| Priority | Current state / exact implementation areas | Required completion evidence |
| --- | --- | --- |
| **P0 — Production security and data integrity** | IN PROGRESS. Preserve src/middleware/{authenticateToken,requireOrgContext,requireRole}.ts, reservation/payment/quotation guards and service-only RPCs. New confirmed signup authorization/atomic bootstrap defects in API src/routes/signup.ts and migrations/20260711010000_self_service_signup.sql are the first batch. Backup and migration evidence is isolated only. | Cross-tenant/role/session/Storage regressions; transactional reservation/ledger/refund/installment invariants including concurrency/failure recovery; complete migration replay and isolated restore rehearsal. Hosted migration inventory, recoverable DB **and object** backups, measured isolated hosted recovery and approved runbooks remain operational gates. |
| **P1 — Complete existing business functionality** | PARTIAL. Reuse existing customers/reservations/travelers/packages/departures/hotels/transport/flights/rooming/seating/finance/documents/reports/admin. Admin src/pages and API src/routes plus existing e2e/pilot-*.spec.ts are the implementation map. No public-demo work precedes real workflows. | Connected create → reload → edit → operate → record money → documents/reporting flows for authorized roles, with tenant-denial/error/retry behavior. Internal payments, installments, refunds, balances and reporting must remain correct with every external provider disabled. Record actual executed workflow results, not endpoint existence. |
| **P2 — Complete BS/EN internationalization** | PARTIAL. Preserve #151–#159. Inventory: docs/operations/final-i18n-inventory.md and admin src/lib/i18n/{bs,en}.ts. Group remaining work A administration/settings, B finance/documents, C operations, D shared/public. | Explicit literal/validation/toast/notification/export inventory, dictionary/interpolation coverage, consistent language switching and locale/currency/date/number formatting. Both-language component and browser acceptance for each coherent batch. No one-PR-per-label approach. |
| **P3 — Professional UI/UX** | PARTIAL. Retain existing form/theme and finance-form repairs and tests; verify only unresolved or changed behavior. | Desktop 1440/1920, tablet 768, mobile 375/390 × BS/EN × light/dark for major workflows; keyboard/focus/dialog/accessibility, validation, loading/empty/error states and usable tables. Fix confirmed issues, preserve architecture/design and avoid unrelated redesign. |
| **P4 — Production infrastructure** | PARTIAL / OPERATIONS UNVERIFIED. Existing Node 24, Docker/launchers, environment boundary, CI, privacy logging and recovery scripts retained. docs/operations/zo-deployment.md remains an optional provider-specific appendix. | Reproducible deployment to an approved host with immutable SHA, same-origin/deep links/health/auth/CORS/assets/config/secret checks; migration order and rehearsals; dependency/security scan; observable health/errors with confirmed receipt and ownership; backup retention/object recovery/RPO/RTO, rollback and incident/restore runbooks. Application cannot be called ready until actual destination evidence exists. |
| **P5 — Secure customer onboarding** | PARTIAL. Existing signup/profile/org_modules/org_branding/onboarding/admin code is reused. First protect the P0 signup boundary, then verify authorized initial configuration and staff lifecycle. | Two real-format **synthetic** agency provisions with independent organizations/IDs; fixed authorized roles and settings; staff add/change/revoke, no cross-agency access, recoverable errors and usable first login. Choose and verify an approved staff/account provisioning path that does not silently assume deferred SMTP activation. No shared director credentials or demo tenant reuse. |

API paths in this table are relative to nmt-analytics-api/; admin paths to nmt-analytics-admin/. Dependencies: P0 safety fixes gate P1 mutations and P5 provisioning; P1 workflows define P2/P3 acceptance; P4 verification runs throughout and gates release. Priority ordering does not permit delaying a discovered security defect until its UI/onboarding phase.

## Deferred integrations — explicit scope boundary

- SMTP/email provider activation, SMS activation, online gateways, client-specific payment integrations and optional external integrations.
- Competition-specific demo preparation, public editable demo workspaces, demo quotas/reset capabilities and large sample datasets.

Preserve working integration code and disabled-state safety. Disabled providers must not falsely report delivery, leak credentials, activate through defaults or break local/core business workflows. Do not configure credentials, enable schedulers/providers or charge real money. **Internal payment recording, installment schedules, refunds/voids, balances and financial reporting are core P0/P1 functionality and are not deferred.** Auth email delivery and recovery-message receipt are separately unverified; documenting deferred activation does not satisfy account-access acceptance.

Unmerged private-demo work is preserved locally on the former feature branch through a named git stash (2026-10-25 strategic reset). It is not merged, approved, a supported provisioning path, or release evidence. Only independently relevant safety fixes may later be extracted with tests under a new scoped task.

## Genuine blockers and next implementation

| ID / priority | Finding / evidence | Required repair / test | State |
| --- | --- | --- | --- |
| COM-AUTH-01 / P0 | Public signup uses a returned Auth identity to select a profile and rename its organization/branding with service_role; non-obfuscated existing identities are not excluded. No authenticated tenant ownership is established. Both update errors are ignored. | Remove public post-signup tenant writes. Bind display naming only to creation of a fresh tenant inside auth.users INSERT. HTTP regression proves existing identity responses cannot mutate organizations. | ACTIVE — commercial-signup-integrity spec. |
| COM-AUTH-02 / P0 | handle_new_user catches every bootstrap error and returns NEW; identity creation can succeed without a complete profile/modules/branding. Slug helper's check-then-insert can race. | Transactional fail-closed bootstrap with collision-safe unique slug, server-owned role and fresh org ID. Actual SQL fault injection at each dependency and separate-tenant/same-name tests; isolated normal Auth signup acceptance. | ACTIVE — same cohesive security batch. |
| COM-DEP-03 / P0 | Fresh production dependency audit reports high-severity body-parser, multer and zod advisories in API and zod in admin. No critical advisories reported in these two production audits. | Next cohesive dependency-security batch: patch compatible versions, verify compressed request/upload/validation behavior, full API/admin/security/browser/CI and fresh audit. No claim of exploitability from advisory metadata alone. | OPEN — next P0 implementation after signup batch. |
| OPS-01 / P0/P4 | Hosted schema/migration history, live-data anomalies, backup/PITR retention and Storage bytes recovery not verified here. | Approved read-only inventory and separately approved isolated restore; measured RPO/RTO, migration/rollback plan and actual destination verification. | OPEN — no hosted operations authorized. |
| FLOW-01 / P1 | Completed representative acceptance does not cover every existing commercial module/state/role. | Reuse current suites; record unverified combinations and only repair confirmed workflow failures. | OPEN — after current P0 batch. |
| ONBOARD-01 / P5 | Existing onboarding/account access is not a fully verified commercial agency/staff lifecycle, especially while email activation is deferred. | Explicit supported operator/account procedure plus role, revocation, failure-recovery and two-tenant acceptance. | OPEN — depends on P0 fix. |

Active specification: [commercial-signup-integrity](tasks/active/commercial-signup-integrity.md). [Task registry](tasks/active/README.md) marks completed references, pending evidence and approval-required/deferred tasks. Historical task files grant no current production authorization. After each merged PR, record final head/merge SHA, exact checks, migration status and next concrete batch here. Use focused product outcomes, not an unlimited sequence of isolated cosmetic PRs.

## Required verification and release decision record

For each implementation batch: reproduce confirmed defects; meaningful API/DB/browser regressions; full applicable API/admin builds/tests/lint and strict checks; migration/security/recovery/Docker where affected; all required GitHub checks on the final PR head before protected merge. Never weaken assertions or bypass branch protection. Keep an immutable release candidate SHA and distinguish:

1. **Completed code:** merged SHA, PR, tested behavior and exact-head CI.
2. **Verified infrastructure:** named destination/configuration, migration/catalog parity, health/monitoring, recovery evidence and date. Unknown stays unknown.
3. **Outstanding operational requirements:** owners, approval boundaries, migration order, backup/restore and rollout/rollback acceptance. No secrets in reports.
4. **Intentionally deferred integrations:** explicit disabled state, safe error behavior and impact on supported workflows/account access.

Commercial GO requires every required P0–P5 gate for the supported existing product, no unresolved critical defect, and operational readiness evidence for the selected host. Until then: **NO-GO**, with specific remaining blockers rather than a percentage or a claim based on builds/unit tests.

## Current implementation evidence — commercial signup batch

Branch fix/commercial-signup-integrity, base bda422f. COM-AUTH-01/02 reproduced before repair. HTTP regression now refuses all public signup tenant mutations; new INSERT-only bootstrap uses a fresh org UUID, collision-safe slug, fixed director role and transactional dependencies. Only display names are taken from metadata; browser role/org/plan input is never used for authorization. Migration 20261025120000_atomic_signup_provisioning.sql is applied only to disposable databases.

Local verification: API 1,031/115 tests/files, admin 553/73, API/admin builds, strict/serverless and NodeNext pass; admin lint 0 errors/50 existing warnings; 59 actual auth browser cases pass. Fresh 119-migration PostgreSQL 17 replay and logical restore/security/bootstrap contract passed. New real-Auth two-agency acceptance is discovered and requires exact-head isolated CI before merge. No hosted evidence is inferred. PR/final head/merge status to be appended after GitHub verification. Next P0 batch: compatible production dependency security patches for body-parser/multer/zod, then unresolved workflow/account/operational gates.
