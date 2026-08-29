#!/usr/bin/env bash
set -euo pipefail

# Clean-install API dependencies from the committed lockfile first.
npm ci --prefix nmt-analytics-api

# exceljs@4.4 is CommonJS and loads uuid with require(). uuid@12+ is ESM-only.
# uuid@11.1.1 contains the current security fix and still supports CommonJS.
# Adjust the override only inside Vercel's ephemeral build workspace.
(
  cd nmt-analytics-api
  npm pkg set overrides.uuid=11.1.1
  npm install --no-save --package-lock=false uuid@11.1.1

  # Fail the deployment before release if the Vercel API cannot boot.
  node -e "require('exceljs'); console.log('[vercel] exceljs/uuid compatibility OK')"
  npx tsx -e "import('./src/app.ts').then(() => console.log('[vercel] Express app import OK')).catch((err) => { console.error(err); process.exit(1); })"
)

# Clean-install frontend dependencies from the lockfile.
npm ci --prefix nmt-analytics-admin
