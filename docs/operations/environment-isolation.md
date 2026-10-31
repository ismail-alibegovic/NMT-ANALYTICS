# Environment isolation (Production / Preview / Local)

Status: code guard implemented on branch `claude/brave-mendel-cd5g9f`. Hosted configuration changes listed below are **manual** and have **not** been performed by automation.

## 1. Findings that motivated this change (verified 2026-10-31)

| Finding | Evidence |
|---|---|
| Preview used the production database with full privileges | Vercel project `travline` env list (read-only, no decryption): `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` scoped to **production + preview**. `TRAVLINE_SUPABASE_URL`/`TRAVLINE_SUPABASE_ANON_KEY`/`ADMIN_URL` were not in the dashboard at all — they came from `vercel.json` `env`, which applies to every target. |
| Build scripts hardcoded the production project | `scripts/vercel-build.sh` exported the production URL + publishable key; `scripts/vercel-install.sh` used the production URL and the production anon JWT (as a fake service-role key) for the boot smoke test. |
| Local example config pointed at production | `nmt-analytics-api/.env.example` defaulted `TRAVLINE_SUPABASE_PROJECT_REF`/`URL` to the production project, which `scripts/apply_migrations.py` also consumes. |
| No cross-environment guard | API config only checked that values existed; nothing compared the target environment with the project in use. |

Previously created Preview deployments keep their old configuration (production URL + service-role key). This change does not alter them — see §6.

## 2. How configuration is selected now

There is **no default and no fallback** to another environment's credentials.

| Target | Determined by | Supabase project | Source of values |
|---|---|---|---|
| Vercel Production | `VERCEL_ENV=production` | must be the production project | Vercel env vars scoped **Production** |
| Vercel Preview | `VERCEL_ENV=preview` | must **not** be the production project | Vercel env vars scoped **Preview** |
| `vercel dev` | `VERCEL_ENV=development` | must not be production | Vercel **Development** scope / local |
| Local / CI | `TRAVLINE_DEPLOY_TARGET` (`local`, `ci`) or default `local` | must not be production unless `TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS=true` | `.env` / CI env |
| ZO launcher | `start-production.sh` (`NODE_ENV=production`, no `VERCEL_ENV`) | unchanged | ZO env file |

The browser uses the same project as the API: `VITE_SUPABASE_URL` defaults to `TRAVLINE_SUPABASE_URL` of the same deployment, `VITE_SUPABASE_ANON_KEY` defaults to that deployment's `TRAVLINE_SUPABASE_ANON_KEY` (or may be set explicitly to the project's `sb_publishable_…` key).

`scripts/deployment-guard.json` holds the production project ref. It is a deny/allow list for verification only; it never selects an endpoint.

## 3. Safeguards

1. **Build guard** — `scripts/deployment-env.cjs check` (run by `scripts/vercel-build.sh` before compiling). Blocks the build when:
   - a required variable is missing (`TRAVLINE_SUPABASE_URL`, `TRAVLINE_SUPABASE_PROJECT_REF`, `TRAVLINE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ADMIN_URL`);
   - Preview/Development point at the production project, or Production does not;
   - the declared `TRAVLINE_SUPABASE_PROJECT_REF` differs from the URL;
   - anon/service-role/browser keys belong to a different project than the URL;
   - the service-role variable does not hold a service-role key;
   - a privileged key or server secret appears in any `VITE_*` variable;
   - `DEV_BYPASS_AUTH`/`DEV_AUTO_BOOTSTRAP` are enabled on a hosted target.
   A blocked build leaves the currently live deployment untouched.
2. **Bundle scan** — `scripts/check-bundle-secrets.cjs` scans `nmt-analytics-admin/dist` after build for server-secret values from the environment, `sb_secret_`, `sbp_`, and service-role JWTs. For non-production builds it also fails if the production project ref appears in the bundle.
3. **Runtime guard** — `nmt-analytics-api/src/lib/supabaseEnvironmentGuard.ts`, called from `config.ts`. The API refuses to start when a Vercel non-production runtime is wired to the production project, when keys from different projects are mixed, when dev auth bypass/bootstrap is enabled against production, or when local development targets production without explicit acknowledgement.
4. **CI** — job `Deployment Environment Isolation` runs the unit tests and `scripts/ci-deployment-safety.sh`, which executes the real Vercel build script with synthetic values for each target. The admin build job also scans its bundle.

## 4. Required Vercel environment variables

All Supabase values must be added in the Vercel dashboard (Project `travline` → Settings → Environment Variables). Mark keys **Sensitive**.

| Variable | Production scope | Preview scope |
|---|---|---|
| `TRAVLINE_SUPABASE_URL` | production project URL | **staging** project URL |
| `TRAVLINE_SUPABASE_PROJECT_REF` | production ref | **staging** ref |
| `TRAVLINE_SUPABASE_ANON_KEY` | production anon (public) key | **staging** anon key |
| `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` | production service-role key | **staging** service-role key (separate variable entry) |
| `VITE_SUPABASE_ANON_KEY` (optional) | production publishable key (`sb_publishable_…`, previously hardcoded in `vercel-build.sh`) | staging publishable key |
| `ADMIN_URL` | `https://travline-ten.vercel.app` (previous `vercel.json` value) | preview/staging URL used for CORS and auth redirects |
| `CRON_SECRET`, `SENTRY_*`, `COMMUNICATION_JOBS_ENABLED` | unchanged | do not copy production values |

Never set a production value in more than one scope. Never create a `VITE_*` variable for a server secret.

## 5. Staging Supabase setup (requires explicit approval — may create paid infrastructure)

1. Create a separate Supabase project (e.g. `travline-staging`) in a region matching production. Do not use Supabase branching from production unless reviewed; never copy customer data.
2. Apply the repository migrations in order from `nmt-analytics-api/supabase/migrations/` to the **staging** project only (`TRAVLINE_SUPABASE_PROJECT_REF=<staging-ref> python3 nmt-analytics-api/scripts/apply_migrations.py`, after verifying the ref twice).
3. Verify parity with `nmt-analytics-api/scripts/schema-fingerprint-compare.sh` (schema only — no data) and compare the migration history version list with production.
4. Seed only synthetic data (`npm run seed:acceptance` against staging), never production exports.
5. Configure staging Auth: Site URL / redirect URLs = preview domains; disable public signups if not needed; separate SMTP or none.
6. Keep parity: every PR adding a migration is applied to staging first, then production after merge.

## 6. Manual dashboard steps (in order)

1. **Before merging this PR**, add `TRAVLINE_SUPABASE_URL`, `TRAVLINE_SUPABASE_PROJECT_REF`, `TRAVLINE_SUPABASE_ANON_KEY`, `ADMIN_URL` (and optionally `VITE_SUPABASE_ANON_KEY`) to the **Production** scope with the values formerly in `vercel.json`/`vercel-build.sh`. Without them the next production build is blocked (safe failure; the current deployment stays live).
2. Remove **Preview** from the scope of the existing `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` entry so it is Production-only.
3. Until staging exists, Preview builds are blocked by design. Optionally disable automatic preview deployments meanwhile.
4. Delete or protect (Vercel Authentication) older Preview deployments — they were built with the production URL and still hold the production service-role key at runtime.
5. Because the production service-role key was available to Preview runtimes, plan a service-role key rotation (new secret key / JWT secret rotation) in a maintenance window — separate approval required.
6. After staging exists, add the Preview-scoped values from §4.

## 7. Verifying preview cannot read or write production

1. Build log of a preview deployment shows `[deployment-env] target=preview … production_project=false` and `[bundle-secrets] OK`.
2. In the Vercel dashboard, no production-valued variable lists Preview as a target.
3. Preview `/api/health` reports a connected database; in the staging project dashboard, the API request logs show the preview traffic; production logs show none for the same timestamp.
4. Create a synthetic record through the preview UI; confirm it exists in staging and not in production (read-only query in production, no writes).
5. In the browser network tab of the preview, all Supabase requests go to `<staging-ref>.supabase.co`.

## 8. Rollback

- Code: revert the PR merge commit on `main`; Vercel redeploys the previous build configuration. (The previous configuration reintroduces the preview→production exposure.)
- Faster: in Vercel, "Instant Rollback"/promote the last good production deployment — it does not depend on this code.
- Dashboard variables added in §6 are harmless to keep after a code rollback.
- Local development against production (emergency only): set `TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS=true`; never combine with `DEV_BYPASS_AUTH`.

## 9. Running the checks locally

```bash
node --test scripts/deployment-env.test.cjs scripts/check-bundle-secrets.test.cjs
bash scripts/ci-deployment-safety.sh   # needs npm ci in nmt-analytics-api and nmt-analytics-admin
cd nmt-analytics-api && npx vitest run src/tests/supabaseEnvironmentGuard.test.ts
```
