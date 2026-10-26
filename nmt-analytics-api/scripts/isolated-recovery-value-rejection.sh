#!/usr/bin/env bash
# Negative control for disposable replay recovery only; never accepts a hosted URL.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${TRAVLINE_ISOLATED_RECOVERY:-}" != 1 || "${PGHOST:-}" != localhost || "${MIGRATION_REPLAY_DB:-}" != travline_replay ]]; then
  echo 'Refusing: requires the isolated localhost travline_replay database' >&2; exit 1
fi
unset PGSERVICE PGSERVICEFILE PGDATABASE PGHOSTADDR
[[ "$(psql -X -v ON_ERROR_STOP=1 -At -d travline_replay -c "SELECT to_regclass('public.recovery_value_probe') IS NULL")" == t ]] || {
  echo 'Refusing: recovery value probe already exists' >&2; exit 1;
}
umask 077
WORK="$(mktemp -d)"
probe=0
cleanup() {
  if [[ "$probe" == 1 ]]; then psql -X -v ON_ERROR_STOP=1 -d travline_replay -c 'DROP TABLE public.recovery_value_probe' >/dev/null; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -d travline_replay <<'SQL'
CREATE TABLE public.recovery_value_probe(id integer PRIMARY KEY,amount numeric(12,2) NOT NULL);
INSERT INTO public.recovery_value_probe VALUES(1,123.45);
SQL
probe=1
recovery_real_restore="$(command -v pg_restore)"
cat > "$WORK/pg_restore" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
"$TRAVLINE_RECOVERY_REAL_RESTORE" "$@"
target=''
while [[ $# -gt 0 ]]; do
  if [[ "$1" == -d ]]; then target="$2"; break; fi
  shift
done
[[ "$target" == travline_phase1_restore ]] || { echo 'Refusing unexpected restore target' >&2; exit 1; }
# Change a value, keeping the table, identifiers and row count unchanged.
psql -X -v ON_ERROR_STOP=1 -d "$target" -c 'UPDATE public.recovery_value_probe SET amount=124.45 WHERE id=1' >/dev/null
WRAPPER
chmod 700 "$WORK/pg_restore"
if PATH="$WORK:$PATH" TRAVLINE_RECOVERY_REAL_RESTORE="$recovery_real_restore" bash "$ROOT/scripts/isolated-recovery-rehearsal.sh" > "$WORK/rehearsal.log" 2>&1; then
  echo 'Recovery verification accepted altered same-count financial values' >&2; exit 1
fi
if ! grep -q '^[-+]public[.]recovery_value_probe|' "$WORK/rehearsal.log"; then
  cat "$WORK/rehearsal.log" >&2
  echo 'Recovery failed before reaching the intended value-integrity assertion' >&2; exit 1
fi
printf 'Recovery value rejection PASS: same-count monetary alteration detected; only owned test fixtures removed.\n'
