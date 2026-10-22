-- Validate the tenant foreign keys introduced by the consent-contract migration.
-- No business rows are inserted, updated or deleted. Validation fails on orphans.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.waiver_tokens
  VALIDATE CONSTRAINT waiver_tokens_passenger_org_fk,
  VALIDATE CONSTRAINT waiver_tokens_reservation_org_fk,
  VALIDATE CONSTRAINT waiver_tokens_departure_org_fk,
  VALIDATE CONSTRAINT waiver_tokens_template_org_fk;
COMMIT;
