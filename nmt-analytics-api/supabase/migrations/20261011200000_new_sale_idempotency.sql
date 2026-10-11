ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text,
  ADD COLUMN IF NOT EXISTS creation_fingerprint text,
  ADD COLUMN IF NOT EXISTS creation_state text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS creation_error_stage text;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_creation_state_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_creation_state_check
  CHECK (creation_state IN ('in_progress', 'completed', 'recovery_required'));

CREATE UNIQUE INDEX IF NOT EXISTS reservations_org_creation_key_uidx
  ON public.reservations (org_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservations_org_creation_state_idx
  ON public.reservations (org_id, creation_state);
