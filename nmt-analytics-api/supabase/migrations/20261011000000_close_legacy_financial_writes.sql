BEGIN;

CREATE FUNCTION public.reject_legacy_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000',
    MESSAGE = 'LEGACY_TRANSACTIONS_READ_ONLY',
    HINT = 'Use the canonical payments ledger. Reconcile existing history before recording money again.';
END;
$$;

CREATE TRIGGER legacy_transactions_read_only
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.transactions
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_legacy_transaction_mutation();

REVOKE EXECUTE ON FUNCTION public.reject_legacy_transaction_mutation() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_reservation_financial_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ledger_paid numeric;
  ledger_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_amount IS DISTINCT FROM 0::numeric
      OR NEW.payment_status IS DISTINCT FROM 'unpaid'
      OR (NEW.balance_due IS DISTINCT FROM 0::numeric
          AND NEW.balance_due IS DISTINCT FROM GREATEST(NEW.total_amount, 0)) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESERVATION_FINANCE_LEDGER_ONLY';
    END IF;
    NEW.balance_due := GREATEST(NEW.total_amount, 0);
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO ledger_paid
  FROM public.payments
  WHERE reservation_id = NEW.id AND status = 'succeeded';

  ledger_status := CASE
    WHEN ledger_paid <= 0 THEN 'unpaid'
    WHEN ledger_paid < NEW.total_amount THEN 'partially_paid'
    ELSE 'paid'
  END;

  IF NEW.paid_amount IS DISTINCT FROM ledger_paid
    OR NEW.balance_due IS DISTINCT FROM GREATEST(NEW.total_amount - ledger_paid, 0)
    OR NEW.payment_status IS DISTINCT FROM ledger_status THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESERVATION_FINANCE_LEDGER_ONLY';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_financial_cache_guard
BEFORE INSERT OR UPDATE OF paid_amount, balance_due, payment_status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_reservation_financial_cache();

REVOKE EXECUTE ON FUNCTION public.guard_reservation_financial_cache() FROM PUBLIC, anon, authenticated;

COMMIT;
