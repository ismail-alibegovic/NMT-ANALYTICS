# Travline Intelligence — Milestone 0 Baseline & Protection Evidence

**Date:** 2026-11-25  
**Branch:** `feat/travline-intelligence`  
**Base Commit:** `3cf2d013c8d6054d232fcf1ac64171e20688b9bc` (`release/commercial-rc-2026-11-24`)  
**Repository:** `ismail-alibegovic/NMT-ANALYTICS`

---

## 1. Repository & Pull Request State (Verified via `git fetch --all --prune` and `gh pr list`)

| Ref / PR | HEAD SHA | Status | Notes |
|---|---|---|---|
| `release/commercial-rc-2026-11-24` (PR #176) | `3cf2d013c8d6054d232fcf1ac64171e20688b9bc` | OPEN, MERGEABLE | Commercial release candidate. Preserved untouched; never merged or modified. |
| `chore/supabase-modern-api-key-compatibility` (PR #177) | `bc5a0eb16542aa45fc7c408fad004eb38d93e2ad` | OPEN, MERGEABLE | Not an ancestor of `HEAD`. Touches only `nmt-analytics-api/src/config.ts`, `nmt-analytics-api/src/lib/supabaseEnvironmentGuard.ts`, and `nmt-analytics-api/src/tests/supabaseEnvironmentGuard.test.ts` (+166/−7). Independent of M0–M1 audit; compatibility integration deferred to Milestone 5. |
| `feat/travline-intelligence` | `3cf2d013c8d6054d232fcf1ac64171e20688b9bc` (clean base) | Active development branch | Created from `release/commercial-rc-2026-11-24`. |

---

## 2. CI Baseline (Authoritative — Node 24 LTS)

- **PR #176 @ `3cf2d013c8d6054d232fcf1ac64171e20688b9bc`**: **12/12 GitHub Actions checks PASSED**, including:
  - Docker Migration Replay
  - Isolated Supabase Staging Acceptance (23m35s)
  - UI Audit
  - Shared UI

---

## 3. Local Verification Baseline

> **Toolchain Note:** Local machine Node.js is `v26.13.1`, whereas `.nvmrc` and `package.json` specify Node `24.x`. CI (Node 24 LTS) is the authoritative runtime baseline.

### 3.1 `nmt-analytics-admin`

| Command | Result | Details |
|---|---|---|
| `npm run lint` | PASS | 0 errors, 44 warnings |
| `NODE_OPTIONS=--no-experimental-webstorage npm test` | PASS | 86/86 test files passed, 636/636 tests passed |
| `npx tsc --noEmit` | PASS | `ADMIN_TSC_OK` |

### 3.2 `nmt-analytics-api`

| Command | Result | Details |
|---|---|---|
| `npx tsc --noEmit` | PASS | `API_TSC_OK` |
| `npm test` | 129/130 files passed | 1214/1219 tests passed; 5 failures in `productionEnvironment.test.ts` solely due to local Node `v26.13.1` vs required `24.x`. |

---

## 4. Codebase Inventory Summary

- **API routes (`nmt-analytics-api/src/routes/`):** 64 files
- **API libraries (`nmt-analytics-api/src/lib/`):** 49 files
- **API middleware (`nmt-analytics-api/src/middleware/`):** 10 files
- **Admin pages (`nmt-analytics-admin/src/pages/`):** 54 `.tsx` files
- **Database migrations:** 124 SQL migrations creating 41 tables in `public.*`

---

## 5. Environment Protection Matrix

| Environment | Project Ref | Applied Migrations | Policy |
|---|---|---|---|
| **Production Supabase** | `hacutwknfgufrqlgdiia` | 115 | **STRICTLY READ-ONLY / UNTOUCHED.** No migrations, no data edits, no credential rotation. |
| **Staging Supabase** | `hlyqrwytlrimtrjncmez` | 124 | Shared with verified RC Vercel Preview. **Decision needed** before Milestone 5+ schema changes: use additive-only migrations on shared Staging, or provision a separate Supabase branch/project for intelligence development. |
