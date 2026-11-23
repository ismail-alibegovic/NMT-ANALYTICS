#!/usr/bin/env bash
# Two-session PostgreSQL concurrency regression for allotment shrink vs room-slot assignment.
# Synthetic disposable replay/acceptance database ONLY. Never accepts connection URLs.
set -euo pipefail

# 1) Fail-closed argument & environment guards (mirroring isolated-recovery-rehearsal.sh).
if [[ $# -ne 0 ]]; then
  echo 'Refusing: positional arguments and connection URLs are forbidden.' >&2
  exit 1
fi

if [[ "${TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY:-}" != "1" ]]; then
  echo 'Refusing: requires TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY=1' >&2
  exit 1
fi

HOST="${PGHOST:-}"
PORT="${PGPORT:-5432}"
DB="${TRAVLINE_CONCURRENCY_DB:-${MIGRATION_REPLAY_DB:-}}"

if [[ "$HOST" != "localhost" && "$HOST" != "127.0.0.1" ]]; then
  echo 'Refusing: PGHOST must be localhost or 127.0.0.1' >&2
  exit 1
fi

case "$DB" in
  travline_replay)
    ;;
  postgres)
    if [[ "$HOST" == "127.0.0.1" && "$PORT" == "54322" ]]; then
      : # Disposable local Supabase mapped port on loopback
    elif [[ "$HOST" == "127.0.0.1" && "$PORT" == "5432" && "${TRAVLINE_CONCURRENCY_CONTAINER_LOOPBACK:-}" == "1" && -f /.dockerenv ]]; then
      : # Inside disposable local Supabase DB container over its own loopback
    else
      echo 'Refusing: postgres DB is allowed only on disposable local Supabase 127.0.0.1:54322 or inside a disposable Supabase container loopback (127.0.0.1:5432 with TRAVLINE_CONCURRENCY_CONTAINER_LOOPBACK=1)' >&2
      exit 1
    fi
    ;;
  *)
    echo 'Refusing: database must be travline_replay or disposable local Supabase postgres (127.0.0.1:54322 or container loopback)' >&2
    exit 1
    ;;
esac

# Block libpq service/URL/hostaddr redirection.
unset PGSERVICE PGSERVICEFILE PGDATABASE PGHOSTADDR PGPASSFILE DATABASE_URL

PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -d "$DB")

# Confirm server-side identity before any write: expected DB + strict loopback server address.
SERVER_CHECK="$("${PSQL_BASE[@]}" -Atc "SELECT current_database() || '|' || COALESCE(host(inet_server_addr()), 'local') || '|' || EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')::text;")"
IFS='|' read -r SERVER_DB SERVER_ADDR HAS_SUPABASE_ADMIN <<< "$SERVER_CHECK"
if [[ "$SERVER_DB" != "$DB" ]]; then
  echo 'Refusing: connected database name does not match requested disposable database' >&2
  exit 1
fi
if [[ "$SERVER_ADDR" != "local" && "$SERVER_ADDR" != "127.0.0.1" && "$SERVER_ADDR" != "::1" ]]; then
  echo 'Refusing: PostgreSQL server address is not local loopback' >&2
  exit 1
fi
if [[ "$DB" == "postgres" && "$HAS_SUPABASE_ADMIN" != "true" ]]; then
  echo 'Refusing: postgres DB target does not match disposable local Supabase instance' >&2
  exit 1
fi

umask 077
WORK="$(mktemp -d)"
mkfifo "$WORK/r1_gate" "$WORK/r2_gate"

ORG_ID=""
fixture_created=0
PID1=""
PID2=""

cleanup() {
  for pid in "$PID1" "$PID2"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      if command -v pkill >/dev/null 2>&1; then
        pkill -P "$pid" 2>/dev/null || true
      fi
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if [[ "$fixture_created" == "1" && -n "$ORG_ID" ]]; then
    "${PSQL_BASE[@]}" >/dev/null 2>&1 <<SQL || true
BEGIN;
DELETE FROM public.departure_room_slot_assignments WHERE org_id = '$ORG_ID';
DELETE FROM public.departure_room_slots WHERE org_id = '$ORG_ID';
DELETE FROM public.departure_passengers WHERE org_id = '$ORG_ID';
DELETE FROM public.reservations WHERE org_id = '$ORG_ID';
DELETE FROM public.hotel_allocations WHERE org_id = '$ORG_ID';
DELETE FROM public.hotels WHERE org_id = '$ORG_ID';
DELETE FROM public.departures WHERE org_id = '$ORG_ID';
DELETE FROM public.packages WHERE org_id = '$ORG_ID';
DELETE FROM public.organizations WHERE id = '$ORG_ID';
COMMIT;
SQL
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_for_file() {
  local target="$1"
  local deadline=$((SECONDS + 10))
  while [[ ! -f "$target" ]]; do
    if (( SECONDS >= deadline )); then
      echo "Timeout waiting for barrier file: $(basename "$target")" >&2
      return 1
    fi
    sleep 0.05
  done
}

wait_for_lock_waiter() {
  local app_name="$1"
  local deadline=$((SECONDS + 10))
  while true; do
    local waiting
    waiting="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name = '$app_name' AND state = 'active' AND wait_event_type = 'Lock';")"
    if [[ "$waiting" -ge 1 ]]; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      echo "Timeout waiting for $app_name to block on row lock" >&2
      return 1
    fi
    sleep 0.05
  done
}

# Generate fresh per-run UUIDs so cleanup only ever deletes data created by this run.
IDS="$("${PSQL_BASE[@]}" -Atc "SELECT gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid()||'|'||gen_random_uuid();")"
IFS='|' read -r ORG_ID PKG_ID DEP_ID HOTEL_ID ALLOC_ID RES_ID PAX1_ID PAX2_ID <<< "$IDS"

if [[ "$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.organizations WHERE id = '$ORG_ID';")" != "0" ]]; then
  echo 'Refusing: generated synthetic organization ID already exists' >&2
  exit 1
fi

"${PSQL_BASE[@]}" >/dev/null <<SQL
BEGIN;
INSERT INTO public.organizations(id, name, slug, currency)
VALUES ('$ORG_ID', 'Synthetic Concurrency Org', 'synthetic-conc-' || left('$ORG_ID', 8), 'EUR');
INSERT INTO public.packages(id, org_id, name, destination, base_price, transport_type)
VALUES ('$PKG_ID', '$ORG_ID', 'Concurrency Package', 'Sarajevo', 150, 'none');
INSERT INTO public.departures(id, org_id, package_id, depart_at, return_at, capacity, status, transport_type)
VALUES ('$DEP_ID', '$ORG_ID', '$PKG_ID', '2042-08-01T08:00:00Z', '2042-08-05T18:00:00Z', 10, 'active', 'none');
INSERT INTO public.hotels(id, org_id, name, destination, total_rooms, slug)
VALUES ('$HOTEL_ID', '$ORG_ID', 'Concurrency Hotel', 'Sarajevo', 10, '$HOTEL_ID');
INSERT INTO public.hotel_allocations(
  id, org_id, departure_id, hotel_id, room_type, room_label,
  rooms_reserved, template_rooms, capacity_per_room, check_in, check_out,
  price_per_night, net_price, sell_price
) VALUES (
  '$ALLOC_ID', '$ORG_ID', '$DEP_ID', '$HOTEL_ID', 'double', 'Double',
  3, 3, 2, '2042-08-01', '2042-08-05', 80, 80, 110
);
SELECT public.sync_departure_room_slots_atomic('$ORG_ID', '$DEP_ID', '$ALLOC_ID');
INSERT INTO public.reservations(id, org_id, departure_id, customer_name, party_size, reservation_at, total_amount, status)
VALUES ('$RES_ID', '$ORG_ID', '$DEP_ID', 'Concurrency Guest', 2, now(), 300, 'confirmed');
INSERT INTO public.departure_passengers(id, org_id, reservation_id, departure_id, full_name)
VALUES
  ('$PAX1_ID', '$ORG_ID', '$RES_ID', '$DEP_ID', 'Concurrent Pax 1'),
  ('$PAX2_ID', '$ORG_ID', '$RES_ID', '$DEP_ID', 'Concurrent Pax 2');
COMMIT;
SQL
fixture_created=1

SLOT3_ID="$("${PSQL_BASE[@]}" -Atc "SELECT id FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID' AND slot_number = 3;")"
test -n "$SLOT3_ID"

# ── Race 1: Assign holds slot 3 FOR UPDATE while concurrent shrink 3 -> 1 blocks ──
PGAPPNAME=travline_conc_r1_assign "${PSQL_BASE[@]}" >"$WORK/race1_assign.out" 2>"$WORK/race1_assign.err" <<SQL &
SET statement_timeout = '15s';
SET lock_timeout = '12s';
BEGIN;
INSERT INTO public.departure_room_slot_assignments(
  org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name
) VALUES (
  '$ORG_ID', '$DEP_ID', '$SLOT3_ID', '$PAX1_ID', '$RES_ID', 'Concurrent Pax 1'
);
\! touch "$WORK/r1_inserted"
\! head -n 1 "$WORK/r1_gate" >/dev/null
COMMIT;
SQL
PID1=$!

wait_for_file "$WORK/r1_inserted"

# Launch shrink; wait until PostgreSQL confirms it is actively waiting on Session 1's lock.
(
  set +e
  PGAPPNAME=travline_conc_r1_shrink "${PSQL_BASE[@]}" \
    -c "SET statement_timeout = '15s';" \
    -c "SET lock_timeout = '12s';" \
    -c "SELECT public.update_departure_accommodation_allotment_atomic('$ORG_ID', '$DEP_ID', '$ALLOC_ID', 1);" \
    >"$WORK/race1_shrink.out" 2>"$WORK/race1_shrink.err"
  echo $? >"$WORK/race1_shrink.rc"
) &
PID2=$!

wait_for_lock_waiter "travline_conc_r1_shrink"
printf 'go\n' >"$WORK/r1_gate"

wait "$PID1"; PID1=""
wait "$PID2"; PID2=""
SHRINK_RC="$(cat "$WORK/race1_shrink.rc")"

if [[ "$SHRINK_RC" -eq 0 ]] || ! grep -q "ROOM_SLOT_OCCUPIED" "$WORK/race1_shrink.err"; then
  echo "FAIL Race 1: shrink did not fail with ROOM_SLOT_OCCUPIED (rc=$SHRINK_RC)" >&2
  cat "$WORK/race1_shrink.err" >&2
  exit 1
fi

ROOMS_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT rooms_reserved FROM public.hotel_allocations WHERE id = '$ALLOC_ID';")"
ASSIGN_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slot_assignments WHERE passenger_id = '$PAX1_ID';")"
SLOTS_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID';")"

if [[ "$ROOMS_AFTER" != "3" || "$ASSIGN_AFTER" != "1" || "$SLOTS_AFTER" != "3" ]]; then
  echo "FAIL Race 1: state corrupted (rooms=$ROOMS_AFTER assign=$ASSIGN_AFTER slots=$SLOTS_AFTER)" >&2
  exit 1
fi

# ── Race 2: Shrink 3 -> 1 holds slot locks while concurrent assign to slot 3 blocks ──
"${PSQL_BASE[@]}" -c "DELETE FROM public.departure_room_slot_assignments WHERE passenger_id = '$PAX1_ID';" >/dev/null

PGAPPNAME=travline_conc_r2_shrink "${PSQL_BASE[@]}" >"$WORK/race2_shrink.out" 2>"$WORK/race2_shrink.err" <<SQL &
SET statement_timeout = '15s';
SET lock_timeout = '12s';
BEGIN;
SELECT public.update_departure_accommodation_allotment_atomic('$ORG_ID', '$DEP_ID', '$ALLOC_ID', 1);
\! touch "$WORK/r2_shrunk"
\! head -n 1 "$WORK/r2_gate" >/dev/null
COMMIT;
SQL
PID1=$!

wait_for_file "$WORK/r2_shrunk"

(
  set +e
  PGAPPNAME=travline_conc_r2_assign "${PSQL_BASE[@]}" \
    -c "SET statement_timeout = '15s';" \
    -c "SET lock_timeout = '12s';" \
    -c "INSERT INTO public.departure_room_slot_assignments(org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name) VALUES ('$ORG_ID', '$DEP_ID', '$SLOT3_ID', '$PAX2_ID', '$RES_ID', 'Concurrent Pax 2');" \
    >"$WORK/race2_assign.out" 2>"$WORK/race2_assign.err"
  echo $? >"$WORK/race2_assign.rc"
) &
PID2=$!

wait_for_lock_waiter "travline_conc_r2_assign"
printf 'go\n' >"$WORK/r2_gate"

wait "$PID1"; PID1=""
wait "$PID2"; PID2=""
ASSIGN_RC="$(cat "$WORK/race2_assign.rc")"

if [[ "$ASSIGN_RC" -eq 0 ]] || ! grep -Eq "ROOM_SLOT_NOT_FOUND|departure_room_slot_assignments_room_slot_id_fkey|23503" "$WORK/race2_assign.err"; then
  echo "FAIL Race 2: concurrent assign did not fail with expected ROOM_SLOT_NOT_FOUND or FK violation (rc=$ASSIGN_RC)" >&2
  cat "$WORK/race2_assign.err" >&2
  exit 1
fi

ROOMS_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT rooms_reserved FROM public.hotel_allocations WHERE id = '$ALLOC_ID';")"
SLOTS_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID';")"
ASSIGN_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slot_assignments WHERE departure_id = '$DEP_ID';")"

if [[ "$ROOMS_FINAL" != "1" || "$SLOTS_FINAL" != "1" || "$ASSIGN_FINAL" != "0" ]]; then
  echo "FAIL Race 2: final state mismatch (rooms=$ROOMS_FINAL slots=$SLOTS_FINAL assign=$ASSIGN_FINAL)" >&2
  exit 1
fi

echo "Allocation slot concurrency contract PASS (lock-verified Race 1 & Race 2)"
