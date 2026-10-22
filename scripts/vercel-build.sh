#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://hacutwknfgufrqlgdiia.supabase.co"
# Use the modern browser-safe Supabase publishable key for the Vite client.
# The server-side API continues to use its own legacy anon/service-role credentials.
export VITE_SUPABASE_ANON_KEY="sb_publishable_GClS1_6ELGr33-yKYaiUlw_fcBvK4hs"
export VITE_API_URL="/api"

# Check the actual serverless entrypoint with the API's strict compiler settings.
nmt-analytics-api/node_modules/.bin/tsc --project tsconfig.json --noEmit
npm run build --prefix nmt-analytics-admin
