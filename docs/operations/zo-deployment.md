# Zo deployment contract

GitHub main is authoritative. Zo synchronizes, builds, deploys and verifies runtime. Local/CI evidence does not certify Zo runtime.

## Environment

Use **Node.js 24 LTS** and its bundled npm. The repository `.nvmrc`, package engine declarations, CI and Docker builds use this major. Select it before installing (for example, `nvm install && nvm use` when nvm is available), and verify `node --version` reports `v24.x`. Both production entry points reject other majors before installation, builds or server startup. Run `bash start-production.sh` from the repository; do not manually source environment files.

The launcher always sets `NODE_ENV=production`. It selects `nmt-analytics-api/.env.production.local`, otherwise root `.env`, otherwise process environment only. Files are parsed as dotenv data by Node, never executed as shell. Existing process variables take precedence; the files are not merged. Use literal values rather than shell substitutions/interpolation. This is an intentional security change from shell sourcing.

Set through Zo's secret configuration or the selected ignored local file:

- `TRAVLINE_SUPABASE_URL`, `TRAVLINE_SUPABASE_ANON_KEY`, `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` (existing legacy `SUPABASE_*` names remain supported; nonempty TRAVLINE names win).
- `ADMIN_URL=https://travline-sprypine.zocomputer.io` for the allowed browser origin.
- `PORT` to Zo's assigned listener port (defaults to 3001).
- `DEV_BYPASS_AUTH=false` and `DEV_AUTO_BOOTSTRAP=false` or leave both unset. Any other nonempty value is rejected before installation/build/start.
- Preserve existing approved provider/monitoring settings. Do not enable communication providers or jobs merely to deploy this change.

The frontend receives only the public Supabase URL/anon key and same-origin `/api`. Never put service-role credentials in a `VITE_*` variable. The launcher installs missing dependencies including build tools, builds admin/API and starts the API. Runtime signals are forwarded to the API child.

API imports share one environment loader. It reads only the API `.env` in development, never overrides process values, never accepts file-driven NODE_ENV, and reads no dotenv file in production or tests. Tests supply configuration explicitly.

## Build and schema ordering

Synchronize the verified immutable main commit, select Node 24, and run `npm ci --include=dev` in both `nmt-analytics-api/` and `nmt-analytics-admin/`. The launcher builds both and serves the admin through the API; do not run a development Vite server. A clean locked install is required when synchronizing a new release: launcher installation on missing `node_modules` alone does not refresh an existing dependency directory.

Before launching a commit containing the atomic reservation editor, confirm the approved database migration process has applied `20261024120000_atomic_reservation_editor.sql`. Deploy the matching API and editor together. This runbook does not authorize production migration execution or data repair. If rolling application code back, use its previously verified runtime/commit contract; the additive RPC can remain with service-role-only execution privileges.

## Zo-only verification after syncing the final merged commit

1. Record `git rev-parse HEAD`; require it to match the final reported main SHA. Use a clean checkout and `npm ci --include=dev` in both subprojects for reproducible dependency state.
2. Confirm environment variable names/flags without printing values or secrets. Launch with `bash start-production.sh`; verify the service stays running and restart signals shut it down cleanly.
3. Request `/api/health` and check database connectivity and disabled dev bypass. A successful build is insufficient.
4. Verify an anonymous protected `/api/me/context` request returns 401 JSON. Verify login, session refresh and logout through the actual public origin.
5. Verify representative existing booking/traveler, rooming/seating, finance/document and reporting flows using an authorized non-production test tenant/environment. Do not create or edit real production records for verification.
6. Confirm browser assets load, `/api` stays JSON, deep links work and desktop/tablet/mobile screens are usable. Confirm approved monitoring receives events only if already authorized/configured.

Production schema parity, backup/restore and provider delivery are separate runtime/infrastructure checks; the runtime-alignment change applies no migrations and activates no services.
