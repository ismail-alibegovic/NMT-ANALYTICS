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

# Import the full Express app before release. Vercel runtime secrets are not
# exposed during the install phase, so use the public anon JWT only as a
# non-privileged placeholder for boot-time validation; runtime secret presence
# is verified separately by the deployed Function environment.
TRAVLINE_SUPABASE_URL="https://hacutwknfgufrqlgdiia.supabase.co" \
TRAVLINE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY3V0d2tuZmd1ZnJxbGdkaWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjE4NDEsImV4cCI6MjA4MTM5Nzg0MX0.juuA0J0Zr7FGb66RjWR-uULEAe8o3R3lGxk7Ts8zwJ0" \
TRAVLINE_SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY3V0d2tuZmd1ZnJxbGdkaWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjE4NDEsImV4cCI6MjA4MTM5Nzg0MX0.juuA0J0Zr7FGb66RjWR-uULEAe8o3R3lGxk7Ts8zwJ0" \
ADMIN_URL="https://travline-ten.vercel.app" \
NODE_ENV="production" \
DEV_BYPASS_AUTH="false" \
DEV_AUTO_BOOTSTRAP="false" \
npx --prefix nmt-analytics-api tsx -e "import('./nmt-analytics-api/src/app.ts').then(() => console.log('[vercel] Express app import OK')).catch((err) => { console.error(err); process.exit(1); })"

# Clean-install frontend dependencies from the lockfile.
npm ci --prefix nmt-analytics-admin
