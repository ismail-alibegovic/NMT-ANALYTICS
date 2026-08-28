#!/usr/bin/env bash
# Thin wrapper around the authoritative Python schema fingerprint implementation.
# Does not independently produce a schema diff JSON.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$ROOT/nmt-analytics-api/scripts/schema_fingerprint.py" "$@"
