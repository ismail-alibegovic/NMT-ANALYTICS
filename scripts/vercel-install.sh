#!/usr/bin/env bash
set -euo pipefail

# Clean-install API dependencies from the committed lockfile first.
npm ci --prefix nmt-analytics-api

# exceljs@4.4 is CommonJS and loads uuid with require(). uuid@12+ is ESM-only.
# uuid@11.1.1 contains the current security fix and still supports CommonJS.
# Adjust the override only inside Vercel's ephemeral build workspace, then
# reconcile node_modules without writing a new lockfile.
npm pkg set overrides.uuid=11.1.1 --prefix nmt-analytics-api
npm install --prefix nmt-analytics-api --package-lock=false --no-save

# Clean-install frontend dependencies from the lockfile.
npm ci --prefix nmt-analytics-admin
