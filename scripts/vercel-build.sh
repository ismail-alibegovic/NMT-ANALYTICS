#!/usr/bin/env bash
set -euo pipefail

export VITE_SUPABASE_URL="https://hacutwknfgufrqlgdiia.supabase.co"
export VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY3V0d2tuZmd1ZnJxbGdkaWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjE4NDEsImV4cCI6MjA4MTM5Nzg0MX0.juuA0J0Zr7FGb66RjWR-uULEAe8o3R3lGxk7Ts8zwJ0"
export VITE_API_URL="/api"

npm run build --prefix nmt-analytics-admin
