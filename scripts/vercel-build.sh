#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://hacutwknfgufrqlgdiia.supabase.co"
export VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaGFjdXR3a25mZ3VmcnFsZ2RpaWEiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc2NTgyMTg0MSwiZXhwIjoyMDgxMzk3ODQxfQ.juuA0J0Zr7FGb66RjWR-uULEAe8o3R3lGxk7Ts8zwJ0"
export VITE_API_URL="/api"

npm run build --prefix nmt-analytics-admin
