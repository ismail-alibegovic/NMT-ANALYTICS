# Commercial P5 (`ONBOARD-01`) — Agency onboarding checklist reliability and secure staff lifecycle

**Status:** ACTIVE  
**Priority:** P5 secure customer onboarding & P0 tenant/account access enforcement  
**Branch:** `fix/commercial-onboarding-and-staff-lifecycle` from `origin/main` (`43da03c`).  
**Roadmap references:** `docs/TRAVLINE_FINAL_ROADMAP.md` (`ONBOARD-01 / P5`, P5 discovery in organization-controls checkpoint); `docs/operations/commercial-workflow-coverage.md`.

## 1. Goal

1. Repair the broken dashboard `OnboardingChecklist` and `GET/POST /api/onboarding/status|skip` contract so directors see accurate, fail-closed, BS/EN-localized setup progress linking to real routes and persisting skip state (while non-directors never fire unauthorized 403 reads).
2. Implement a complete, tenant-isolated, auditable staff provisioning, role-change, and revocation/reactivation lifecycle (`GET/POST/PATCH /api/settings/team`, `revoke`, `reactivate`, and `Settings` Team Management panel) that works cleanly **without** requiring deferred SMTP activation, immediately invalidates revoked users' API access (`403 ACCOUNT_REVOKED`), and preserves PR #164's public signup isolation guarantees.

## 2. Confirmed current problems (reproduced before repair)

### A. Onboarding checklist & status contract
1. **Response shape mismatch:** `GET /api/onboarding/status` returns `{ steps: [{ key, label, required, completed }], completed, total, percentage, isComplete }`, while `OnboardingChecklist.tsx` reads obsolete flat fields (`profile_completed`, `logo_uploaded`, `package_created`, `departure_created`, `reservation_created`, `pdf_template_customized`), displaying `0 / 6` even for configured agencies.
2. **Broken links:** `OnboardingChecklist.tsx` links to nonexistent routes `/admin/packages` and `/admin/departures` (real routes are `/packages` and `/departures`).
3. **Silent error swallowing & non-director 403:** `GET /api/onboarding/status` wraps count queries in `try { ... } catch {}` (reporting false `0` on DB failures), omits persisted `onboarding_skipped`, and `OnboardingChecklist.tsx` runs for every role (causing `403` for managers/agents) and swallows read failures into an empty `0 / 0` card with no retry button.
4. **Local-only dismiss & hardcoded Bosnian API labels:** Dismiss only writes `localStorage` instead of calling `POST /api/onboarding/skip`, and API step labels are hardcoded Bosnian.

### B. Staff provisioning, role management & revocation (`ONBOARD-01`)
1. **No director staff lifecycle endpoints or UI:** Agencies cannot add staff accounts, change roles (`director`/`manager`/`agent`/`viewer`), or revoke/reactivate access without manual DB intervention or unactivated SMTP email invites.
2. **No profile-level revocation enforcement:** `authenticateToken` and `requireOrgContext` do not check a revocation timestamp (`profiles.revoked_at`), so an existing JWT remains valid until expiry even if access should be revoked immediately.
3. **Self-service trigger vs admin staff creation:** `handle_new_user()` unconditionally creates a fresh organization + `director` profile on every `auth.users` INSERT, creating an orphan organization whenever a staff account is provisioned unless service-role `raw_app_meta_data` staff provisioning is explicitly supported without weakening public `raw_user_meta_data` isolation.

## 3. In scope

- Append-only migration `nmt-analytics-api/supabase/migrations/20261124120000_staff_lifecycle_and_revocation.sql`:
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS revoked_at timestamptz;`
  - Update `public.handle_new_user()` (retaining `SECURITY DEFINER SET search_path = ''`, service-only ACL, and 100% unchanged public `auth.signUp()` isolation) to allow `service_role`-only `raw_app_meta_data` staff provisioning (`travline_staff_org_id` + `travline_staff_role` in `director|manager|agent|viewer`, never `super_admin`, verifying target org exists, creating zero orphan orgs).
- Rollback-only SQL contract `nmt-analytics-api/scripts/staff-lifecycle-integrity.sql` wired into `migration-replay.sh` and `.github/workflows/staging-acceptance.yml`.
- Auth enforcement in `authenticateToken.ts` and `requireOrgContext.ts`: reject profiles with non-null `revoked_at` with `403 ACCOUNT_REVOKED` (while remaining backward-compatible if `revoked_at` column is absent on pre-migration schemas, failing closed on mutation endpoints with `503 MIGRATION_PENDING`).
- API routes:
  - Hardened `GET /api/onboarding/status` (fail-closed on DB errors, returns `skipped` and `steps` including `pdf_template`) and `POST /api/onboarding/skip`.
  - New director+ routes in `nmt-analytics-api/src/routes/staff.ts` mounted at `/settings/team`:
    - `GET /settings/team` — list active and revoked staff in `req.orgId`.
    - `POST /settings/team` — provision new staff account in `req.orgId` with `email_confirm: true` (works with SMTP disabled), validated `role` (`director|manager|agent|viewer`), server-generated high-entropy temporary password (or validated director-supplied password >= 12 chars), one-time password returned once in response (never logged or returned on GET), full audit entry, rollback auth user on profile mismatch.
    - `PATCH /settings/team/:memberId/role` — change role within `req.orgId`; blocks `super_admin`, blocks demoting the last active `director`, returns `404` across tenants, writes audit log.
    - `POST /settings/team/:memberId/revoke` — blocks self-revocation and revoking last active `director`, sets `profiles.revoked_at`, bans Auth user (`876000h`), writes audit log.
    - `POST /settings/team/:memberId/reactivate` — clears `profiles.revoked_at`, lifts Auth ban (`none`), writes audit log.
- Admin UI:
  - Repaired `OnboardingChecklist.tsx` (director+ only, consumes canonical `steps` + `skipped`, valid routes, persisted skip via `POST /onboarding/skip`, fail-closed error + retry, live BS/EN switching).
  - New `TeamManagementPanel.tsx` integrated into `Settings.tsx` (list staff, create staff without SMTP with one-time copyable temporary password notice, change role, revoke/reactivate, fail-closed read + retry, ref-locked submits, live BS ↔ EN conflict/error switching with preserved drafts).
  - BS/EN parity in `bs.ts` and `en.ts`.
- Automated tests:
  - Pre-repair failing reproductions,
  - API unit/HTTP tests (`onboardingAndStaffLifecycle.test.ts`),
  - Admin Vitest component tests (`onboardingAndStaffLifecycle.test.tsx`),
  - Real Chromium Playwright matrix (`e2e/finance-forms/onboarding-staff.spec.ts` across BS/EN × light/dark × 390/768/1440),
  - Real-Auth isolated two-agency acceptance (`e2e/pilot-onboarding-staff-lifecycle.spec.ts`).

## 4. Out of scope

- Activating SMTP/email delivery, SMS, or external payment/identity providers.
- Applying migrations to hosted/production Supabase or touching customer data.
- Rewriting `Settings.tsx` or existing `SignUp` / `SignIn` pages.
- Allowing directors to assign `super_admin` or modify commercial subscription plans.

## 5. Acceptance criteria

- [x] Pre-repair defects reproduced via failing tests before source edits (6/6 failing tests on `origin/main` `43da03c`: 3 API + 3 admin).
- [x] `OnboardingChecklist` renders accurate progress from canonical `/onboarding/status` steps, links only to valid routes, persists skip via `POST /onboarding/skip`, stays hidden for non-directors, and fails closed with retry on error.
- [x] Director can provision staff without SMTP, receive one-time temporary password, change roles, revoke (immediately returning `403 ACCOUNT_REVOKED` on existing JWTs), and reactivate within own tenant only.
- [x] Self-revocation, demoting/revoking the last active director, assigning `super_admin`, and all cross-tenant mutations are rejected (`400`/`403`/`404`) with zero unintended writes.
- [x] Public `auth.signUp()` still ignores `raw_user_meta_data` `org_id`/`role` and creates isolated tenants (PR #164 contract preserved; SQL contract wired into CI).
- [x] Live BS ↔ EN toggle re-localizes visible errors/conflicts while preserving operator drafts; 12-case Chromium browser matrix + 14-case organization-settings regression pass with screenshot review.
- [x] Full API build/strict/tests and Admin lint/tests/build pass under official Node 24 LTS.

## 6. Local verification checkpoint (Node 24.22.3)

- **Pre-repair reproduction:** 6/6 failing tests on `origin/main` `43da03c` (3 API + 3 admin).
- **Final local verification under official Node 24 LTS (`v24.22.3`):**
  - API strict serverless `tsc --project ../tsconfig.json --noEmit` & NodeNext `tsc`: **PASS**
  - API `npm run build`: **PASS**
  - API `npm test`: **123/123 files, 1,133/1,133 tests PASS** (including `onboardingAndStaffLifecycle.test.ts` 9/9, `documentTemplatePersistence.test.ts` 12/12, `authContextAudit.test.ts` 6/6)
  - Admin `npm run lint`: **0 errors, 49 warnings** (1 fewer than `main` baseline)
  - Admin `npm test`: **77/77 files, 581/581 tests PASS** (including `i18nParity.test.ts` 16/16 and `onboardingAndStaffLifecycle.test.tsx` 6/6)
  - Admin `npm run build`: **PASS**
  - Real Chromium Playwright (`playwright.finance-forms.config.ts`): `onboarding-staff.spec.ts` (12/12) + `organization-settings.spec.ts` (14/14) = **26/26 PASS** (screenshots visually reviewed for `bs-dark-390` and `en-light-1440`)
- **Not executed locally (wired into GitHub CI):**
  - PostgreSQL 17 migration replay (`20261124120000_staff_lifecycle_and_revocation.sql` + `staff-lifecycle-integrity.sql`) and real-Auth isolated two-agency Playwright acceptance (`pilot-onboarding-staff-lifecycle.spec.ts`): local host lacks `docker`/`psql`.
  - Note: Branch starts cleanly from `origin/main` (`43da03c`); once PR #172 (`fix/commercial-allocation-edit-and-transport-integrity`, which includes `follow-redirects@1.16.2`) merges to `main`, rebase this branch onto `main` so CI `npm audit` inherits `follow-redirects@1.16.2` cleanly.

