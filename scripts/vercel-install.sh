#!/usr/bin/env bash
set -euo pipefail

# Clean-install API dependencies from the committed lockfile first.
npm ci --prefix nmt-analytics-api

# exceljs@4.4 is CommonJS and loads uuid with require(). uuid@12+ is ESM-only.
# uuid@11.1.1 contains the current security fix and still supports CommonJS.
# Install it in an isolated temp directory and replace only the uuid package in
# Vercel's ephemeral node_modules tree, leaving every other locked dependency intact.
UUID_TMP_DIR="$(mktemp -d)"
npm install --prefix "$UUID_TMP_DIR" --no-save --package-lock=false uuid@11.1.1
rm -rf nmt-analytics-api/node_modules/uuid
cp -R "$UUID_TMP_DIR/node_modules/uuid" nmt-analytics-api/node_modules/uuid
rm -rf "$UUID_TMP_DIR"

# Verify the CommonJS dependency edge that previously failed at runtime.
node -e "require('./nmt-analytics-api/node_modules/exceljs'); console.log('[vercel] exceljs/uuid compatibility OK')"

# Import the full Express app before release. This is a boot smoke test only:
# it uses a local, non-routable placeholder project and a synthetic unsigned
# token so it can never reach (or need credentials for) a hosted database.
# Real configuration is validated by scripts/deployment-env.cjs in the build
# phase and by the API's own runtime guard.
BOOT_CHECK_KEY="$(node -e "const b=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');console.log(b({alg:'none',typ:'JWT'})+'.'+b({role:'service_role',ref:'bootcheck'})+'.bootcheck')")"
env -u VERCEL -u VERCEL_ENV -u TRAVLINE_SUPABASE_PROJECT_REF \
  TRAVLINE_SUPABASE_URL="http://127.0.0.1:54321" \
  TRAVLINE_SUPABASE_ANON_KEY="boot-check-placeholder-anon-key" \
  TRAVLINE_SUPABASE_SERVICE_ROLE_KEY="$BOOT_CHECK_KEY" \
  SUPABASE_URL="http://127.0.0.1:54321" \
  ADMIN_URL="https://boot-check.invalid" \
  NODE_ENV="production" \
  DEV_BYPASS_AUTH="false" \
  DEV_AUTO_BOOTSTRAP="false" \
  npx --prefix nmt-analytics-api tsx -e "import('./nmt-analytics-api/src/app.ts').then(() => console.log('[vercel] Express app import OK')).catch((err) => { console.error(err); process.exit(1); })"

# Clean-install frontend dependencies from the lockfile.
npm ci --prefix nmt-analytics-admin
