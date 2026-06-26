#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

set -a
if [ -f "$ROOT/nmt-analytics-api/.env.production.local" ]; then
  . "$ROOT/nmt-analytics-api/.env.production.local"
elif [ -f "$ROOT/.env" ]; then
  . "$ROOT/.env"
fi
set +a

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3001}"
export ADMIN_URL="${ADMIN_URL:-http://localhost:${PORT}}"
export DEV_BYPASS_AUTH="${DEV_BYPASS_AUTH:-false}"
export DEV_AUTO_BOOTSTRAP="${DEV_AUTO_BOOTSTRAP:-false}"

cd "$ROOT/nmt-analytics-admin"
if [ ! -d node_modules ]; then npm ci; fi
VITE_SUPABASE_URL="$SUPABASE_URL" \
VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
VITE_API_URL="/api" \
npm run build

cd "$ROOT/nmt-analytics-api"
if [ ! -d node_modules ]; then npm ci; fi
npm run build
exec npm start
