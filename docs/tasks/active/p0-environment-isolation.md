# P0 Sprint 1 — Environment isolation & deployment safety

**Status:** ACTIVE
**Priority:** P0
**Branch:** `claude/brave-mendel-cd5g9f`
**Operations doc:** `docs/operations/environment-isolation.md`

## 1. Goal

Production, Preview and local development use explicitly configured, independently verifiable Supabase projects. Unsafe or incomplete configuration blocks the deployment instead of silently using production.

## 2. Current problem (verified)

- `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` is scoped to Production **and** Preview in Vercel.
- `vercel.json`, `scripts/vercel-build.sh`, `scripts/vercel-install.sh` hardcode the production project; Preview therefore runs against production.
- No build/runtime guard compares deployment target and Supabase project.

## 3. In scope

- Remove hardcoded Supabase endpoints/keys from Vercel config and build scripts.
- Build-time guard, bundle secret scan, API runtime guard.
- Unit tests + CI rehearsal with synthetic values.
- Operational documentation for the staging transition.

## 4. Out of scope

- Creating the staging project, changing Vercel variables, rotating keys, applying hosted migrations, deploying.
- ZO launcher changes, unrelated refactors, backup verification.

## 5. Acceptance

- Preview pointing at production, missing config, or mixed-project keys → build blocked (tested).
- Bundle contains no server secrets (tested in CI).
- Valid production configuration still builds and boots (tested with synthetic values).
