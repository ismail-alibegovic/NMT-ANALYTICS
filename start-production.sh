#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Process variables override file values. Never execute configuration as shell.
# Node 20.6+ supports --env-file; the production launcher fixes the runtime mode.
export NODE_ENV=production
if [ -f "$ROOT/nmt-analytics-api/.env.production.local" ]; then
  exec node --env-file="$ROOT/nmt-analytics-api/.env.production.local" "$ROOT/scripts/start-production.cjs"
elif [ -f "$ROOT/.env" ]; then
  exec node --env-file="$ROOT/.env" "$ROOT/scripts/start-production.cjs"
fi
exec node "$ROOT/scripts/start-production.cjs"
