#!/usr/bin/env bash
set -euo pipefail

# Clean-install API dependencies from the lockfile first.
npm ci --prefix nmt-analytics-api

# exceljs@4.4 is CommonJS and loads uuid with require(). uuid@12+ is ESM-only,
# while uuid@11.1.1 contains the current security fix and still supports CJS.
# Keep this Vercel runtime compatibility pin local to the deployment install step.
npm install --prefix nmt-analytics-api --no-save --package-lock=false uuid@11.1.1

# Clean-install frontend dependencies from the lockfile.
npm ci --prefix nmt-analytics-admin
