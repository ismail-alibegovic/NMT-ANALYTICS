#!/usr/bin/env bash
# Disposable CI PostgreSQL only. Never point this at production or a tunnel.
set -euo pipefail
[[ "${TRAVLINE_ISOLATED_REHEARSAL:-}" == 1 && "${PGHOST:-}" == localhost ]] || { echo 'Requires explicit isolated localhost CI database'; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB=travline_upgrade_rehearsal
RESTORED=travline_restore_rehearsal
createdb "$DB"
psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/migration-test-bootstrap.sql" >/dev/null
count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < 20261016000000 ]] || continue
  psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
  count=$((count+1))
done
[[ "$count" == 110 ]]
psql -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$
DECLARE o uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); x uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.organizations(id,name,slug) VALUES(o,'Synthetic recovery',o::text);
 INSERT INTO public.packages(id,org_id,name,destination,base_price) VALUES(p,o,'Synthetic','Synthetic',100);
 INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity) VALUES(d,o,p,now(),now()+interval '1 day',10);
 INSERT INTO public.reservations(id,org_id,departure_id,customer_name,party_size,reservation_at,total_amount) VALUES(r,o,d,'Synthetic',1,now(),100);
 INSERT INTO public.payments(org_id,reservation_id,amount,currency,status,payment_method) VALUES(o,r,40,'BAM','succeeded','cash');
 INSERT INTO public.excursion_passengers(id,org_id,reservation_id,full_name) VALUES(x,o,r,'Synthetic');
 INSERT INTO public.waiver_tokens(org_id,passenger_id,token_hash,expires_at) VALUES(o,x,repeat('a',64),now()+interval '1 day');
 INSERT INTO public.waiver_tokens(org_id,passenger_id,token_hash,expires_at,consumed_at) VALUES(o,x,repeat('b',64),now()+interval '1 day',now());
END $$;
SQL
fingerprint() {
 psql -X -At -v ON_ERROR_STOP=1 -d "$1" -c "SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id),'')) FROM public.payments t; SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id),'')) FROM public.reservations t;"
}
before="$(fingerprint "$DB")"
for f in "$ROOT"/supabase/migrations/202610{16,20}*.sql; do psql -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$f" >/dev/null; done
[[ "$(fingerprint "$DB")" == "$before" ]]
psql -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.waiver_tokens WHERE status='signed' AND signed_at=consumed_at)<>1 THEN RAISE EXCEPTION 'Consumed legacy history changed'; END IF;
 IF (SELECT count(*) FROM public.waiver_tokens WHERE status='pending' AND revoked_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'Unsigned legacy capability not revoked'; END IF;
 IF (SELECT paid_amount FROM public.reservations)<>40 OR (SELECT balance_due FROM public.reservations)<>60 THEN RAISE EXCEPTION 'Financial truth changed'; END IF;
END $$;
ALTER TABLE public.waiver_tokens VALIDATE CONSTRAINT waiver_tokens_passenger_org_fk;
ALTER TABLE public.waiver_tokens VALIDATE CONSTRAINT waiver_tokens_reservation_org_fk;
ALTER TABLE public.waiver_tokens VALIDATE CONSTRAINT waiver_tokens_departure_org_fk;
ALTER TABLE public.waiver_tokens VALIDATE CONSTRAINT waiver_tokens_template_org_fk;
SQL
psql -X -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/database-function-security.sql" >/dev/null
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
start=$SECONDS
docker run --rm --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD postgres:17 pg_dump -Fc --no-owner -d "$DB" > "$archive"
createdb "$RESTORED"
docker run --rm -i --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD postgres:17 pg_restore --exit-on-error --no-owner -d "$RESTORED" < "$archive"
[[ "$(fingerprint "$RESTORED")" == "$before" ]]
psql -X -v ON_ERROR_STOP=1 -d "$RESTORED" -c "DO \$\$ BEGIN IF (SELECT count(*) FROM public.waiver_tokens)<>2 THEN RAISE EXCEPTION 'Consent history missing after restore'; END IF; END \$\$;" >/dev/null
psql -X -v ON_ERROR_STOP=1 -d "$RESTORED" -f "$ROOT/scripts/database-function-security.sql" >/dev/null
echo "PASS: 110-to-114 upgrade; legacy consent preservation/revocation; financial row fingerprints unchanged; four FKs validated; logical restore in $((SECONDS-start)) seconds. Synthetic only; not a production RTO measurement."
