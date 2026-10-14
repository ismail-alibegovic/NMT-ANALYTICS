# Travline staging acceptance matrix

Date: 2026-10-12
Baseline: `d43004b2ee35336afc7c580d13e6012561ba3faa`
Branch: `chore/staging-acceptance-setup`

This PR adds the reproducible local setup; it does not claim pilot acceptance. The current
machine has no running Docker daemon, so infrastructure-dependent checks remain BLOCKED.

| Gate | Result | Evidence |
|---|---|---|
| API build and unit suite | PASS | `npm run build`; 71 files / 638 tests |
| Admin lint, build and unit suite | PASS | `npm run lint`, `npm run build`; 42 files / 283 tests; existing warnings only |
| PostgreSQL 17 configuration | PASS | `nmt-analytics-api/supabase/config.toml` declares `major_version = 17`; CI replay now uses `postgres:17` |
| Local Supabase/Auth/Storage/SMTP setup | BLOCKED | Requires Docker daemon and `supabase start` |
| Isolated two-tenant seed | BLOCKED | Seed implementation is present; not executed without local Supabase |
| Playwright project discovery | PASS | `npx playwright test --list` discovers 2 acceptance tests |
| Playwright browser shell | BLOCKED | Browser binaries and admin server are not running; `npx playwright test` reports 2 skipped |
| New Sale idempotency | BLOCKED | Playwright scenario is present; requires seeded Auth/API/database |
| Capacity, seating, rooming, payments, documents | BLOCKED | Require authenticated browser/API and database assertions |
| SMTP/storage delivery | BLOCKED | Requires local Supabase services and Inbucket |

## Remaining mandatory actions

1. Run `npm run staging:up` on a Docker-enabled machine.
2. Reset migrations and capture PostgreSQL 17 output.
3. Seed the three local users and export the printed IDs/password into an untracked env file.
4. Run API/admin tests, Playwright, storage/document checks, SMTP inspection, and tenant/role matrix.
5. Replace each BLOCKED row with PASS or FAIL evidence before making a pilot recommendation.

No production resource, credential, deployment, branch merge, or live schema was modified.
