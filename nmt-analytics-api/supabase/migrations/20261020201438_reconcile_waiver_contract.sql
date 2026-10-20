-- Created using Supabase CLI 2.109.0 in isolated authoring job 118861286144.
-- Add immutable consent snapshots without changing historical migration files.
ALTER TABLE public.waiver_tokens
  ADD COLUMN template_id uuid,
  ADD COLUMN template_snapshot_title text,
  ADD COLUMN template_snapshot_body text,
  ADD COLUMN template_snapshot_declarations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN passenger_name_snapshot text,
  ADD COLUMN reservation_id uuid,
  ADD COLUMN departure_id uuid,
  ADD COLUMN package_name_snapshot text,
  ADD COLUMN destination_snapshot text,
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN signed_at timestamptz,
  ADD COLUMN signer_name text,
  ADD COLUMN signed_via text,
  ADD COLUMN signature_png_base64 text,
  ADD COLUMN declaration_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Preserve historical consumed tokens. Unsigned legacy links lack an immutable
-- terms snapshot and must be reissued; never invent the terms they accepted.
UPDATE public.waiver_tokens
SET status = 'signed', signed_at = consumed_at
WHERE consumed_at IS NOT NULL;
UPDATE public.waiver_tokens
SET revoked_at = COALESCE(revoked_at, now())
WHERE consumed_at IS NULL AND template_snapshot_body IS NULL;

ALTER TABLE public.waiver_tokens
  ADD CONSTRAINT waiver_tokens_status_valid CHECK (status IN ('pending', 'signed')),
  ADD CONSTRAINT waiver_tokens_consumption_consistent
    CHECK ((status = 'pending' AND consumed_at IS NULL) OR (status = 'signed' AND consumed_at IS NOT NULL)),
  ADD CONSTRAINT waiver_tokens_pending_snapshot
    CHECK (revoked_at IS NOT NULL OR consumed_at IS NOT NULL OR
      (template_snapshot_title IS NOT NULL AND template_snapshot_body IS NOT NULL AND
       passenger_name_snapshot IS NOT NULL AND reservation_id IS NOT NULL)),
  ADD CONSTRAINT waiver_tokens_declarations_array
    CHECK (jsonb_typeof(template_snapshot_declarations) = 'array'),
  ADD CONSTRAINT waiver_tokens_answers_object
    CHECK (jsonb_typeof(declaration_answers) = 'object');

-- Expired pending links are revoked before reissue by the API. The unique
-- partial index arbitrates concurrent issue requests without storing raw tokens.
CREATE UNIQUE INDEX waiver_tokens_one_unconsumed
  ON public.waiver_tokens (org_id, passenger_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX waiver_passenger_org_identity ON public.excursion_passengers (org_id, id);
CREATE UNIQUE INDEX waiver_reservation_org_identity ON public.reservations (org_id, id);
CREATE UNIQUE INDEX waiver_departure_org_identity ON public.departures (org_id, id);
CREATE UNIQUE INDEX waiver_template_org_identity ON public.waiver_templates (org_id, id);

-- NOT VALID retains legacy history while enforcing organization-safe references
-- on new writes. Production validation of historical rows is a separate step.
ALTER TABLE public.waiver_tokens
  ADD CONSTRAINT waiver_tokens_passenger_org_fk
    FOREIGN KEY (org_id, passenger_id) REFERENCES public.excursion_passengers (org_id, id) NOT VALID,
  ADD CONSTRAINT waiver_tokens_reservation_org_fk
    FOREIGN KEY (org_id, reservation_id) REFERENCES public.reservations (org_id, id) NOT VALID,
  ADD CONSTRAINT waiver_tokens_departure_org_fk
    FOREIGN KEY (org_id, departure_id) REFERENCES public.departures (org_id, id) NOT VALID,
  ADD CONSTRAINT waiver_tokens_template_org_fk
    FOREIGN KEY (org_id, template_id) REFERENCES public.waiver_templates (org_id, id) NOT VALID;

-- Claiming the single-use capability and updating passenger consent must commit
-- together. A failed passenger update rolls back the capability claim.
CREATE FUNCTION public.sync_waiver_passenger_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE changed_rows integer;
BEGIN
  IF NEW.consumed_at IS NOT NULL AND OLD.consumed_at IS NULL THEN
    UPDATE public.excursion_passengers
    SET waiver_signed = true,
        waiver_signed_at = NEW.signed_at,
        waiver_signature = NEW.signature_png_base64,
        waiver_data = jsonb_build_object(
          'waiver_id', NEW.id,
          'template_id', NEW.template_id,
          'template_title', NEW.template_snapshot_title,
          'signer_name', NEW.signer_name,
          'declarations', NEW.declaration_answers,
          'signed_via', NEW.signed_via
        )
    WHERE id = NEW.passenger_id AND org_id = NEW.org_id
      AND reservation_id = NEW.reservation_id;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 1 THEN
      RAISE EXCEPTION 'WAIVER_PASSENGER_STATE_CHANGED';
    END IF;
    INSERT INTO public.audit_logs (org_id, user_id, action, entity, entity_id, details)
    VALUES (NEW.org_id, NULL, 'SIGN', 'waiver_token', NEW.id,
      jsonb_build_object('metadata', jsonb_build_object('actor', 'public_capability', 'signed_via', NEW.signed_via)));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_waiver_passenger_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_waiver_passenger_consent() TO service_role;
CREATE TRIGGER sync_waiver_passenger_consent
AFTER UPDATE OF consumed_at ON public.waiver_tokens
FOR EACH ROW EXECUTE FUNCTION public.sync_waiver_passenger_consent();

-- Keep business tables behind the server API. Existing RLS remains enabled.
REVOKE ALL ON public.waiver_tokens, public.waiver_templates FROM anon, authenticated;
