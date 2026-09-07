-- M14.1: Atomic canonical installment schedule replacement.
-- Uses existing payments rows with installment_number/due_date as the persisted schedule.

CREATE OR REPLACE FUNCTION public.replace_reservation_installment_schedule_atomic(
  p_org_id UUID,
  p_reservation_id UUID,
  p_schedule JSONB
)
RETURNS TABLE (
  id UUID,
  installment_number INTEGER,
  amount NUMERIC,
  currency TEXT,
  status TEXT,
  payment_date DATE,
  due_date DATE,
  remaining_after NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  SELECT r.id, r.org_id
    INTO v_reservation
    FROM public.reservations r
   WHERE r.id = p_reservation_id
     AND r.org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_schedule IS NULL
     OR jsonb_typeof(p_schedule) <> 'array'
     OR jsonb_array_length(p_schedule) = 0 THEN
    RAISE EXCEPTION 'INVALID_INSTALLMENT_SCHEDULE'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payments p
     WHERE p.reservation_id = p_reservation_id
       AND p.org_id = p_org_id
       AND p.installment_number IS NOT NULL
       AND p.status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_HISTORY_EXISTS'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.payments p
   WHERE p.reservation_id = p_reservation_id
     AND p.org_id = p_org_id
     AND p.installment_number IS NOT NULL
     AND p.status = 'pending';

  RETURN QUERY
  WITH input_rows AS (
    SELECT *
      FROM jsonb_to_recordset(p_schedule) AS row(
        installment_number INTEGER,
        amount NUMERIC,
        currency TEXT,
        due_date DATE,
        remaining_after NUMERIC
      )
  ),
  inserted AS (
    INSERT INTO public.payments (
      reservation_id,
      org_id,
      amount,
      currency,
      status,
      payment_method,
      payment_date,
      installment_number,
      due_date,
      remaining_after
    )
    SELECT
      p_reservation_id,
      p_org_id,
      input_rows.amount,
      input_rows.currency,
      'pending',
      NULL,
      NULL,
      input_rows.installment_number,
      input_rows.due_date,
      input_rows.remaining_after
    FROM input_rows
    ORDER BY input_rows.installment_number
    RETURNING
      payments.id,
      payments.installment_number,
      payments.amount,
      payments.currency,
      payments.status,
      payments.payment_date,
      payments.due_date,
      payments.remaining_after,
      payments.created_at
  )
  SELECT
    inserted.id,
    inserted.installment_number,
    inserted.amount,
    inserted.currency,
    inserted.status,
    inserted.payment_date,
    inserted.due_date,
    inserted.remaining_after,
    inserted.created_at
  FROM inserted
  ORDER BY inserted.installment_number;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) TO service_role;
