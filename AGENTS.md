# Travline — Codex Project Instructions

This file contains stable rules for any coding agent working in this repository. Keep it short and current. Historical implementation notes belong in Git history or `docs/plans/`, not here.

## 1. Product identity

Travline is a cloud travel-agency operating system / CRM. It supports retail agencies, group-tour organizers, DMC/incoming agencies, and tour operators through one shared tenant-aware platform.

Canonical product context: `docs/PRODUCT.md`.
Canonical technical architecture: `docs/ARCHITECTURE.md`.
Canonical product backlog: `docs/ROADMAP.md`.
Canonical product roadmap: `docs/TRAVLINE_MASTER_PLAN_2_0.md`.
Active implementation specs: `docs/tasks/active/`.
Historical redesign plan: `docs/plans/2026-08-18-travline-operating-system-redesign.md`.
Old task system (T01–T38): archived at `docs/tasks/archived/`.

## 2. Repository layout

- `nmt-analytics-admin/` — React 19 + Vite + TypeScript admin application.
- `nmt-analytics-api/` — Node.js + Express 5 + TypeScript API.
- `nmt-analytics-api/supabase/migrations/` and existing migration locations — database migrations; inspect the repository before adding a migration and follow the established location/naming convention.
- `docs/` — canonical product, architecture, roadmap, and task documentation.

## 3. Source of truth and deployment model

GitHub `main` is the authoritative source code for Travline.

Travline may be deployed through more than one runtime/hosting path, including Vercel and ZO Computer. Those deployments are consumers of the GitHub codebase; they are never alternate sources of truth.

For Codex work:

1. Start from current `origin/main`.
2. Never develop directly on `main`.
3. Use one feature/fix branch per task.
4. Open a PR back to `main`.
5. Treat Vercel Preview + CI as verification before production merge when available.
6. Do not modify ZO-hosted production or ZO-specific runtime state unless an explicit task says to do so.

Never commit secrets, service-role keys, passwords, access tokens, `.env` files containing secrets, or production credentials.

## 4. Mandatory architecture invariants

### API-first

Business workflows and tenant-owned mutations belong behind the Express API. Do not bypass established API boundaries from the frontend merely because Supabase is available in the browser.

The frontend may continue to use the existing Supabase client for authentication/session behavior and any already-approved client-side behavior, but new business-domain mutations must follow the existing API-first architecture unless the active task explicitly changes that architecture.

### Tenant isolation

Travline is multi-tenant.

- Every tenant-owned read/write must be explicitly scoped to the authenticated organization.
- Never trust an `org_id` supplied by the browser without validating it against authenticated context.
- Preserve RLS and application-level tenant checks.
- Never weaken composite organization-safe relationships for convenience.
- Cross-organization access is a release-blocking security defect.

### Database changes

- Use append-only migrations.
- Never edit an already-applied migration to change production behavior.
- Prefer backward-compatible schema evolution.
- No destructive migration unless the task explicitly requires it and includes a migration/rollback plan.
- Do not create RPCs unless there is a clear reason and the task calls for one.
- Every new tenant-owned table must have an explicit tenant-isolation strategy and tests.

### Auth

Preserve the current authentication/session-expiry protections. Do not reintroduce protected API calls from public auth routes or competing redirect loops.

### Auditability

New material business mutations should follow the repository's existing audit-log conventions. Do not silently create mutation paths that bypass established audit behavior.

## 5. Frontend and UX rules

Travline already has an established visual language. Do not perform broad mechanical redesigns while implementing a functional task.

- Change only screens required by the active task.
- Do not refactor 20 pages because a shared component could be made "cleaner".
- Preserve current spacing, typography, cards, tables, number formatting, responsive behavior, light/dark mode, and route behavior unless the task explicitly changes them.
- Any intentional redesign must be done one workflow/page at a time and browser-verified before expanding scope.
- Avoid generic AI-looking UI or unrelated visual embellishment.

## 6. Internationalization

Travline supports Bosnian and English.

- No new hardcoded user-facing strings when the surrounding code uses i18n.
- New/changed copy must maintain BS/EN parity.
- Verify both languages for user-facing tasks.
- Do not mix Bosnian and English on the same localized screen because a key was omitted.

## 7. Task discipline

Before editing code:

1. Read this file.
2. Read `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` when the task affects product behavior or architecture.
3. Read `docs/ROADMAP.md` for priority/context.
4. Read exactly the relevant spec in `docs/tasks/active/`.
5. Inspect the current implementation. Documentation may lag code; code + migrations + tests determine current implementation reality.
6. Establish a test/build baseline relevant to the task.

During implementation:

- Implement only the defined scope.
- Do not silently add adjacent roadmap items.
- Reuse existing domain models and utilities before creating duplicates.
- Keep commits understandable and task-focused.
- If the task spec conflicts with current code reality, stop expanding scope and report the conflict with evidence.

## 8. Required verification

At minimum for code changes, run the applicable commands.

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

Also run migration replay / Docker / targeted browser verification when the task affects those areas or CI requires them.

A green TypeScript build is not sufficient proof of a good UI change. User-facing changes require browser-level verification of the affected workflow where tooling permits.

## 9. Completion report contract

Every completed Codex task must report:

- branch name;
- concise implementation summary;
- exact files changed;
- migrations added/applied status;
- tenant/security considerations;
- API build/test results;
- admin lint/test/build results;
- browser/E2E verification performed;
- known issues or intentionally deferred items;
- final commit SHA;
- PR link/number if opened.

Do not report `PASS` for a command that was not actually run.

## 10. Active-task rule

Only files in `docs/tasks/active/` are actionable implementation specifications. `docs/ROADMAP.md` and `docs/TRAVLINE_MASTER_PLAN_2_0.md` are planning context, not permission to implement every listed item.

Master Plan 2.0 defines 25 milestones (M00–M24). Each milestone must be broken into a scoped task specification in `docs/tasks/active/` using `docs/tasks/TEMPLATE.md` before implementation. Only one M-task may be active at a time unless explicitly instructed otherwise.

Keep each active spec small enough to complete in a single run. The old T01–T38 decomposition has been archived at `docs/tasks/archived/` with a T→M mapping at `docs/tasks/archived/T_TO_M_MAPPING.md`.

If multiple active specs exist, work only on the one explicitly named in the prompt. If no active spec is named, ask which task to execute rather than starting a large roadmap item on your own.
