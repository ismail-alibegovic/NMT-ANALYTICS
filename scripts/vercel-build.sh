#!/usr/bin/env bash
set -euo pipefail

# Every Supabase value comes from the Vercel environment of THIS deployment
# (Production or Preview scope). Nothing here names a project, and nothing
# falls back to another environment's credentials.
#
# The browser uses the same project as the API. VITE_SUPABASE_ANON_KEY may be
# set to the modern publishable key; otherwise the environment's own public
# anon key is used. Server-side secrets are never mapped to VITE_* variables.
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${TRAVLINE_SUPABASE_URL:-}}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${TRAVLINE_SUPABASE_ANON_KEY:-}}"
export VITE_API_URL="/api"

# Block the deployment if the configuration is missing, mismatched, or would
# connect a non-production deployment to the production Supabase project.
node scripts/deployment-env.cjs check

# Check the actual serverless entrypoint with the API's strict compiler settings.
nmt-analytics-api/node_modules/.bin/tsc --project tsconfig.json --noEmit
npm run build --prefix nmt-analytics-admin

# Prove the shipped bundle carries no server-side secrets, and that
# non-production bundles do not reference the production project.
FORBID_ARGS=()
if [ "${VERCEL_ENV:-}" != "production" ]; then
  PRODUCTION_REF="$(node -p "require('./scripts/deployment-guard.json').productionSupabaseProjectRef")"
  FORBID_ARGS=(--forbid-supabase-ref "$PRODUCTION_REF")
fi
node scripts/check-bundle-secrets.cjs nmt-analytics-admin/dist "${FORBID_ARGS[@]}"
