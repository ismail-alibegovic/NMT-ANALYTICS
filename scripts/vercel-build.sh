#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://hacutwknfgufrqlgdiia.supabase.co"
# Use the modern browser-safe Supabase publishable key for the Vite client.
# The server-side API continues to use its own legacy anon/service-role credentials.
export VITE_SUPABASE_ANON_KEY="sb_publishable_GClS1_6ELGr33-yKYaiUlw_fcBvK4hs"
export VITE_API_URL="/api"

npm run build --prefix nmt-analytics-admin
