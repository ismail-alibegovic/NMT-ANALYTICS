#!/usr/bin/env bash
# Synthetic PostgreSQL replay database only. Never accepts a connection URL.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${TRAVLINE_ISOLATED_RECOVERY:-}" != 1 || "${PGHOST:-}" != localhost || "${MIGRATION_REPLAY_DB:-}" != travline_replay ]]; then
  echo 'Refusing: requires TRAVLINE_ISOLATED_RECOVERY=1, PGHOST=localhost, MIGRATION_REPLAY_DB=travline_replay' >&2
  exit 1
fi
# Reject URL/database overrides; libpq service files must not redirect this test.
unset PGSERVICE PGSERVICEFILE PGDATABASE PGHOSTADDR
SOURCE=travline_replay
TARGET=travline_phase1_restore
if [[ "$(psql -X -At -d "$SOURCE" -c "SELECT count(*) FROM pg_database WHERE datname='$TARGET'")" != 0 ]]; then
  echo 'Refusing: recovery target already exists' >&2; exit 1
fi
umask 077
WORK="$(mktemp -d)"
created=0
probe=0
cleanup() {
  if [[ "$created" == 1 ]]; then dropdb "$TARGET"; fi
  if [[ "$probe" == 1 ]]; then psql -X -v ON_ERROR_STOP=1 -d "$SOURCE" -c 'DROP TABLE public.phase1_restore_probe' >/dev/null; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -d "$SOURCE" <<'SQL'
CREATE TABLE public.phase1_restore_probe (id integer PRIMARY KEY, payload text NOT NULL);
INSERT INTO public.phase1_restore_probe VALUES (1,'synthetic recovery sentinel');
SQL
probe=1
# Capture every public table row count, not just whether the sentinel survived.
COUNT_QUERY="SELECT format('SELECT %L AS relation, count(*) FROM %I.%I;', schemaname||'.'||tablename,schemaname,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
psql -X -At -d "$SOURCE" -c "$COUNT_QUERY" > "$WORK/counts.sql"
psql -X -At -d "$SOURCE" -f "$WORK/counts.sql" > "$WORK/before.txt"
started=$SECONDS
pg_dump -Fc --no-owner -d "$SOURCE" -f "$WORK/database.dump"
createdb -T template0 "$TARGET"
created=1
pg_restore --exit-on-error --no-owner --clean --if-exists -d "$TARGET" "$WORK/database.dump"
psql -X -At -d "$TARGET" -f "$WORK/counts.sql" > "$WORK/after.txt"
diff -u "$WORK/before.txt" "$WORK/after.txt"
[[ "$(psql -X -At -d "$TARGET" -c 'SELECT payload FROM public.phase1_restore_probe WHERE id=1')" == 'synthetic recovery sentinel' ]]
# Remove the intentionally unprotected sentinel before catalog-wide ACL checks.
psql -X -v ON_ERROR_STOP=1 -d "$TARGET" -c 'DROP TABLE public.phase1_restore_probe' >/dev/null
for check in database-function-security authorization-security storage-api-only-security; do
  psql -X -v ON_ERROR_STOP=1 -d "$TARGET" -f "$ROOT/scripts/$check.sql"
done
printf 'Isolated logical recovery PASS: table counts, sentinel, function ACL/tenant regressions and Storage boundaries; elapsed %s seconds\n' "$((SECONDS-started))"
