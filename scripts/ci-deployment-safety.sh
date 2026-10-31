#!/usr/bin/env bash
# End-to-end deployment-safety rehearsal using SYNTHETIC values only.
# It runs the real Vercel build script for each target and asserts that:
#   1. a preview wired to the production project is blocked;
#   2. missing configuration is blocked;
#   3. a correctly isolated preview builds and its bundle has no secrets and
#      no reference to the production project;
#   4. a valid production configuration still builds.
# No hosted service is contacted. Requires API and admin node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."

PROD_REF="$(node -p "require('./scripts/deployment-guard.json').productionSupabaseProjectRef")"
STAGING_REF="stagingprojectref000"
jwt() { node -e "const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');console.log(b({alg:'HS256',typ:'JWT'})+'.'+b({role:process.argv[1],ref:process.argv[2]})+'.synthetic-signature')" "$1" "$2"; }

build() { # <vercel-env> <project-ref> [extra env...]
  local target="$1" ref="$2"; shift 2
  env -i PATH="$PATH" HOME="${HOME:-/tmp}" CI=true VERCEL=1 VERCEL_ENV="$target" \
    TRAVLINE_SUPABASE_URL="https://$ref.supabase.co" TRAVLINE_SUPABASE_PROJECT_REF="$ref" \
    TRAVLINE_SUPABASE_ANON_KEY="$(jwt anon "$ref")" \
    TRAVLINE_SUPABASE_SERVICE_ROLE_KEY="$(jwt service_role "$ref")" \
    ADMIN_URL="https://travline-ci.example.com" DEV_BYPASS_AUTH=false DEV_AUTO_BOOTSTRAP=false \
    "$@" bash scripts/vercel-build.sh
}
expect_blocked() { # <description> <command...>
  local description="$1"; shift
  if "$@" > /tmp/deployment-safety.log 2>&1; then
    cat /tmp/deployment-safety.log; echo "FAIL: $description was NOT blocked"; exit 1
  fi
  grep -q "BLOCKED" /tmp/deployment-safety.log || { cat /tmp/deployment-safety.log; echo "FAIL: $description failed for an unexpected reason"; exit 1; }
  echo "PASS: $description is blocked"
}

expect_blocked "preview using the production Supabase project" build preview "$PROD_REF"
expect_blocked "preview with missing Supabase configuration" \
  env -i PATH="$PATH" HOME="${HOME:-/tmp}" VERCEL=1 VERCEL_ENV=preview bash scripts/vercel-build.sh
expect_blocked "preview with a production service-role key" \
  build preview "$STAGING_REF" TRAVLINE_SUPABASE_SERVICE_ROLE_KEY="$(jwt service_role "$PROD_REF")"

build preview "$STAGING_REF"
echo "PASS: isolated preview builds; bundle has no secrets or production reference"
build production "$PROD_REF"
echo "PASS: valid production configuration still builds"
rm -rf nmt-analytics-admin/dist
