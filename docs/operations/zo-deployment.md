# Zo deployment contract

GitHub main is authoritative. Zo synchronizes, builds, deploys and verifies runtime. Local/CI evidence does not certify Zo runtime.

## Environment

Use a supported Node.js release with `--env-file` support (minimum 20.6; use a maintained release) and npm. Run `bash start-production.sh` from the repository; do not manually source environment files.

The launcher always sets `NODE_ENV=production`. It selects `nmt-analytics-api/.env.production.local`, otherwise root `.env`, otherwise process environment only. Files are parsed as dotenv data by Node, never executed as shell. Existing process variables take precedence; the files are not merged. Use literal values rather than shell substitutions/interpolation. This is an intentional security change from shell sourcing.

Set through Zo's secret configuration or the selected ignored local file:

- `TRAVLINE_SUPABASE_URL`, `TRAVLINE_SUPABASE_ANON_KEY`, `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` (existing legacy `SUPABASE_*` names remain supported; nonempty TRAVLINE names win).
- `ADMIN_URL=https://travline-sprypine.zocomputer.io` for the allowed browser origin.
- `PORT` to Zo's assigned listener port (defaults to 3001).
- `DEV_BYPASS_AUTH=false` and `DEV_AUTO_BOOTSTRAP=false` or leave both unset. Any other nonempty value is rejected before installation/build/start.
- Preserve existing approved provider/monitoring settings. Do not enable communication providers or jobs merely to deploy this change.

The frontend receives only the public Supabase URL/anon key and same-origin `/api`. Never put service-role credentials in a `VITE_*` variable. The launcher installs missing dependencies including build tools, builds admin/API and starts the API. Runtime signals are forwarded to the API child.

API imports share one environment loader. It reads only the API `.env` in development, never overrides process values, never accepts file-driven NODE_ENV, and reads no dotenv file in production or tests. Tests supply configuration explicitly.

## Zo-only verification after syncing the final merged commit

1. Record `git rev-parse HEAD`; require it to match the final reported main SHA. Use a clean checkout and `npm ci --include=dev` in both subprojects for reproducible dependency state.
2. Confirm environment variable names/flags without printing values or secrets. Launch with `bash start-production.sh`; verify the service stays running and restart signals shut it down cleanly.
3. Request `/api/health` and check database connectivity and disabled dev bypass. A successful build is insufficient.
4. Verify an anonymous protected `/api/me/context` request returns 401 JSON. Verify login, session refresh and logout through the actual public origin.
5. Verify representative existing booking/traveler, rooming/seating, finance/document and reporting flows using an authorized non-production test tenant/environment. Do not create or edit real production records for verification.
6. Confirm browser assets load, `/api` stays JSON, deep links work and desktop/tablet/mobile screens are usable. Confirm approved monitoring receives events only if already authorized/configured.

Production schema parity, backup/restore and provider delivery are separate runtime/infrastructure checks; this code change applies no migrations and activates no services.
