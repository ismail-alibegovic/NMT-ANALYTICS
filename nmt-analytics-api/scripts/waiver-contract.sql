-- Disposable acceptance database only; workflow uses fixed localhost:54322.
-- The negative insert runs in a rollback-only transaction.
BEGIN;
DO $$
DECLARE signed_count integer;
DECLARE foreign_passenger record;
DECLARE own_token record;
DECLARE denied boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.waiver_tokens'::regclass, 'public.waiver_templates'::regclass) AND NOT relrowsecurity) OR
     has_any_column_privilege('authenticated', 'public.waiver_tokens', 'SELECT') OR
     has_any_column_privilege('anon', 'public.waiver_tokens', 'SELECT') OR
     has_table_privilege('anon', 'public.waiver_tokens', 'SELECT') OR
     has_table_privilege('authenticated', 'public.waiver_tokens', 'SELECT') OR
     has_table_privilege('authenticated', 'public.waiver_tokens', 'UPDATE') OR
     has_function_privilege('anon', 'public.sync_waiver_passenger_consent()', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.sync_waiver_passenger_consent()', 'EXECUTE') THEN
    RAISE EXCEPTION 'WAIVER_BROWSER_BOUNDARY_FAILED';
  END IF;
  SELECT count(*) INTO signed_count FROM public.waiver_tokens w
    JOIN public.excursion_passengers p ON p.id = w.passenger_id AND p.org_id = w.org_id
    WHERE p.full_name LIKE 'Waiver audit%' AND w.consumed_at IS NOT NULL;
  IF signed_count < 14 THEN RAISE EXCEPTION 'WAIVER_ACCEPTANCE_INCOMPLETE: % signed', signed_count; END IF;
  IF EXISTS (
    SELECT 1 FROM public.waiver_tokens w
    JOIN public.excursion_passengers p ON p.id = w.passenger_id AND p.org_id = w.org_id
    WHERE p.full_name LIKE 'Waiver audit%' AND w.consumed_at IS NOT NULL
      AND (w.status <> 'signed' OR w.signed_at IS NULL OR NOT p.waiver_signed
        OR p.waiver_signed_at IS DISTINCT FROM w.signed_at
        OR p.waiver_data->>'waiver_id' IS DISTINCT FROM w.id::text
        OR p.waiver_data->>'signer_name' IS DISTINCT FROM w.signer_name
        OR NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.org_id = w.org_id
          AND a.entity = 'waiver_token' AND a.entity_id = w.id AND a.action = 'SIGN'
          AND a.user_id IS NULL AND a.details->'metadata'->>'actor' = 'public_capability'))
  ) THEN RAISE EXCEPTION 'WAIVER_ATOMIC_STATE_OR_AUDIT_FAILED'; END IF;
  IF (SELECT count(*) FROM public.waiver_tokens w JOIN public.excursion_passengers p
      ON p.id = w.passenger_id AND p.org_id = w.org_id
      WHERE p.full_name LIKE 'Waiver audit browser%' AND w.consumed_at IS NOT NULL
        AND w.signature_png_base64 LIKE 'iVBORw0KGgo%') < 12
  THEN RAISE EXCEPTION 'WAIVER_DRAWN_SIGNATURE_PERSISTENCE_FAILED'; END IF;

  SELECT p.* INTO STRICT foreign_passenger FROM public.excursion_passengers p
    WHERE p.full_name LIKE 'Waiver audit foreign%' LIMIT 1;
  SELECT w.* INTO STRICT own_token FROM public.waiver_tokens w
    JOIN public.excursion_passengers p ON p.id = w.passenger_id AND p.org_id = w.org_id
    WHERE p.full_name LIKE 'Waiver audit API%' LIMIT 1;
  BEGIN
    INSERT INTO public.waiver_tokens (
      org_id, passenger_id, reservation_id, template_id, token_hash,
      template_snapshot_title, template_snapshot_body, passenger_name_snapshot
    ) VALUES (
      own_token.org_id, foreign_passenger.id, foreign_passenger.reservation_id, own_token.template_id,
      repeat('c', 64), 'Synthetic invalid foreign link', 'Synthetic terms', 'Synthetic'
    );
  EXCEPTION WHEN foreign_key_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'WAIVER_CROSS_TENANT_FOREIGN_KEY_FAILED'; END IF;
  RAISE NOTICE 'PASS waiver consent: % signed; passenger state and public audit atomic; PNG persisted; browser ACL and cross-tenant FK enforced', signed_count;
END $$;
ROLLBACK;
