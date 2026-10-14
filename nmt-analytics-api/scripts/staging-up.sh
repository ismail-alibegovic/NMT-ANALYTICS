#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v supabase >/dev/null || {
  echo "supabase CLI is required; install it without connecting to a hosted project." >&2
  exit 1
}

if [[ -n "${TRAVLINE_SUPABASE_URL:-}" && "${TRAVLINE_SUPABASE_URL}" != http://127.0.0.1:* && "${TRAVLINE_SUPABASE_URL}" != http://localhost:* ]]; then
  echo "Refusing to start staging with a non-local TRAVLINE_SUPABASE_URL." >&2
  exit 1
fi

supabase start
supabase status
echo
echo "Local Supabase is ready. Copy the anon and service_role values above into a local env file."
echo "Next: npm run seed:acceptance"
