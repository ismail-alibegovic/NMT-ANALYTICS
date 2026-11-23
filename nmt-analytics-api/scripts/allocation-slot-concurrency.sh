#!/usr/bin/env bash
# Two-session PostgreSQL concurrency regression for allotment shrink vs room-slot assignment.
# Disposable replay/acceptance databases ONLY; cleans up its synthetic organization on exit.
set -euo pipefail

DB_URL="${1:-}"
if [ -n "$DB_URL" ]; then
  PSQL_BASE=(psql -v ON_ERROR_STOP=1 "$DB_URL")
else
  DB_NAME="${MIGRATION_REPLAY_DB:-travline_replay}"
  PSQL_BASE=(psql -v ON_ERROR_STOP=1 -d "$DB_NAME")
fi

ORG_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee301"
PKG_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee302"
DEP_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee303"
HOTEL_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee304"
ALLOC_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee305"
RES_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee306"
PAX1_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee307"
PAX2_ID="d4d47871-5b1c-47d1-96e3-39ad8c3ee308"

TMPDIR_CONC="$(mktemp -d)"
cleanup() {
  "${PSQL_BASE[@]}" -c "DELETE FROM public.organizations WHERE id = '$ORG_ID';" >/dev/null 2>&1 || true
  rm -rf "$TMPDIR_CONC"
}
trap cleanup EXIT

# Seed disposable fixture committed so two concurrent PostgreSQL sessions can race on it.
"${PSQL_BASE[@]}" <<SQL
DELETE FROM public.organizations WHERE id = '$ORG_ID';
INSERT INTO public.organizations(id, name, slug, currency)
VALUES ('$ORG_ID', 'Synthetic Concurrency Org', 'synthetic-conc-org', 'EUR');
INSERT INTO public.packages(id, org_id, name, destination, base_price, transport_type)
VALUES ('$PKG_ID', '$ORG_ID', 'Concurrency Package', 'Sarajevo', 150, 'none');
INSERT INTO public.departures(id, org_id, package_id, depart_at, return_at, capacity, status, transport_type)
VALUES ('$DEP_ID', '$ORG_ID', '$PKG_ID', '2042-08-01T08:00:00Z', '2042-08-05T18:00:00Z', 10, 'active', 'none');
INSERT INTO public.hotels(id, org_id, name, destination, total_rooms)
VALUES ('$HOTEL_ID', '$ORG_ID', 'Concurrency Hotel', 'Sarajevo', 10);
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
SQL

SLOT3_ID="$("${PSQL_BASE[@]}" -Atc "SELECT id FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID' AND slot_number = 3;")"
test -n "$SLOT3_ID"

# ── Race 1: Assign holds slot 3 FOR UPDATE while concurrent shrink 3 -> 1 runs ──
# Session 1 inserts assignment into slot 3 (trigger locks slot 3 FOR UPDATE), sleeps 1.5s, commits.
("${PSQL_BASE[@]}" <<SQL >"$TMPDIR_CONC/race1_assign.out" 2>"$TMPDIR_CONC/race1_assign.err"
BEGIN;
INSERT INTO public.departure_room_slot_assignments(
  org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name
) VALUES (
  '$ORG_ID', '$DEP_ID', '$SLOT3_ID', '$PAX1_ID', '$RES_ID', 'Concurrent Pax 1'
);
SELECT pg_sleep(1.5);
COMMIT;
SQL
) &
PID1=$!

sleep 0.3

# Session 2 tries to shrink allotment 3 -> 1 while Session 1 holds slot 3 lock.
# Must wait for Session 1, then fail with ROOM_SLOT_OCCUPIED, preserving rooms_reserved = 3 AND the assignment!
set +e
"${PSQL_BASE[@]}" -c "SELECT public.update_departure_accommodation_allotment_atomic('$ORG_ID', '$DEP_ID', '$ALLOC_ID', 1);" \
  >"$TMPDIR_CONC/race1_shrink.out" 2>"$TMPDIR_CONC/race1_shrink.err"
SHRINK_RC=$?
set -e

wait "$PID1"

if [ "$SHRINK_RC" -eq 0 ] || ! grep -q "ROOM_SLOT_OCCUPIED" "$TMPDIR_CONC/race1_shrink.err"; then
  echo "FAIL Race 1: shrink did not fail with ROOM_SLOT_OCCUPIED (rc=$SHRINK_RC)" >&2
  cat "$TMPDIR_CONC/race1_shrink.err" >&2
  exit 1
fi

ROOMS_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT rooms_reserved FROM public.hotel_allocations WHERE id = '$ALLOC_ID';")"
ASSIGN_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slot_assignments WHERE passenger_id = '$PAX1_ID';")"
SLOTS_AFTER="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID';")"

if [ "$ROOMS_AFTER" != "3" ] || [ "$ASSIGN_AFTER" != "1" ] || [ "$SLOTS_AFTER" != "3" ]; then
  echo "FAIL Race 1: state corrupted (rooms=$ROOMS_AFTER assign=$ASSIGN_AFTER slots=$SLOTS_AFTER)" >&2
  exit 1
fi

# ── Race 2: Shrink 3 -> 1 holds slot locks while concurrent assign to slot 3 runs ──
"${PSQL_BASE[@]}" -c "DELETE FROM public.departure_room_slot_assignments WHERE passenger_id = '$PAX1_ID';" >/dev/null

("${PSQL_BASE[@]}" <<SQL >"$TMPDIR_CONC/race2_shrink.out" 2>"$TMPDIR_CONC/race2_shrink.err"
BEGIN;
SELECT public.update_departure_accommodation_allotment_atomic('$ORG_ID', '$DEP_ID', '$ALLOC_ID', 1);
SELECT pg_sleep(1.5);
COMMIT;
SQL
) &
PID2=$!

sleep 0.3

# Session 2 tries to assign Pax 2 to slot 3 while shrink holds slot 3 FOR UPDATE.
# After shrink commits and deletes slot 3, trigger must see NOT FOUND (ROOM_SLOT_NOT_FOUND) or FK error,
# NEVER succeed and lose the row.
set +e
"${PSQL_BASE[@]}" -c "INSERT INTO public.departure_room_slot_assignments(org_id, departure_id, room_slot_id, passenger_id, reservation_id, passenger_name) VALUES ('$ORG_ID', '$DEP_ID', '$SLOT3_ID', '$PAX2_ID', '$RES_ID', 'Concurrent Pax 2');" \
  >"$TMPDIR_CONC/race2_assign.out" 2>"$TMPDIR_CONC/race2_assign.err"
ASSIGN_RC=$?
set -e

wait "$PID2"

if [ "$ASSIGN_RC" -eq 0 ]; then
  echo "FAIL Race 2: concurrent assignment to deleted slot unexpectedly succeeded" >&2
  exit 1
fi

ROOMS_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT rooms_reserved FROM public.hotel_allocations WHERE id = '$ALLOC_ID';")"
SLOTS_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slots WHERE hotel_allocation_id = '$ALLOC_ID';")"
ASSIGN_FINAL="$("${PSQL_BASE[@]}" -Atc "SELECT COUNT(*) FROM public.departure_room_slot_assignments WHERE departure_id = '$DEP_ID';")"

if [ "$ROOMS_FINAL" != "1" ] || [ "$SLOTS_FINAL" != "1" ] || [ "$ASSIGN_FINAL" != "0" ]; then
  echo "FAIL Race 2: final state mismatch (rooms=$ROOMS_FINAL slots=$SLOTS_FINAL assign=$ASSIGN_FINAL)" >&2
  exit 1
fi

echo "Allocation slot concurrency contract PASS (Race 1 & Race 2)"
