-- Preserve commercial terms once a quotation has ever been accepted.
-- Only approval-lock metadata is backfilled; historical prices are untouched.
ALTER TABLE public.quotations ADD COLUMN commercial_locked boolean NOT NULL DEFAULT false;
UPDATE public.quotations SET commercial_locked = true
WHERE status = 'accepted' OR accepted_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.guard_accepted_quotation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  item_count bigint;
  matching_currency boolean;
  saved_net numeric;
  saved_sell numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.commercial_locked OR NEW.status = 'accepted' OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_INVALID_PRICING';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.commercial_locked OR OLD.status = 'accepted' OR OLD.accepted_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_LOCKED';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['internal_notes','updated_at','status','rejected_at','commercial_locked'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['internal_notes','updated_at','status','rejected_at','commercial_locked'])
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('rejected','expired')) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_LOCKED';
    END IF;
    NEW.commercial_locked := true;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF (NEW.commercial_locked OR NEW.accepted_at IS NOT NULL) AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_INVALID_PRICING';
  END IF;

  IF NEW.status = 'accepted' THEN
    -- The header row is already locked by UPDATE. Item writes take that
    -- same lock before touching any row, so acceptance sees a stable snapshot.
    SELECT count(*), bool_and(i.currency = NEW.currency),
           round(sum(i.quantity * i.net_unit_price), 2),
           round(sum(i.quantity * i.net_unit_price *
             (1 + CASE WHEN NEW.markup_strategy = 'uniform'
                       THEN coalesce(NEW.global_markup_percent, 0)
                       ELSE i.markup_percent END / 100)), 2)
    INTO item_count, matching_currency, saved_net, saved_sell
    FROM public.quotation_items i
    WHERE i.quotation_id = OLD.id AND i.org_id = OLD.org_id;
    IF item_count = 0 OR matching_currency IS DISTINCT FROM true
       OR NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_INVALID_PRICING';
    END IF;
    NEW.net_total := saved_net;
    NEW.sell_total := saved_sell;
    NEW.margin_total := saved_sell - saved_net;
    NEW.accepted_at := clock_timestamp();
    NEW.commercial_locked := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_accepted_quotation_item()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  target_id uuid;
  target_org uuid;
  parent_status text;
  parent_accepted_at timestamptz;
  parent_locked boolean;
BEGIN
  -- Moving an existing item would bypass the old parent's approval lock.
  IF TG_OP = 'UPDATE' AND
     (NEW.id IS DISTINCT FROM OLD.id OR NEW.quotation_id IS DISTINCT FROM OLD.quotation_id
      OR NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_ITEM_IDENTITY_LOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.quotation_id; target_org := OLD.org_id;
  ELSE
    target_id := NEW.quotation_id; target_org := NEW.org_id;
  END IF;

  SELECT q.status, q.accepted_at, q.commercial_locked INTO parent_status, parent_accepted_at, parent_locked
  FROM public.quotations q WHERE q.id = target_id AND q.org_id = target_org FOR UPDATE;
  IF parent_locked OR parent_status = 'accepted' OR parent_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUOTATION_LOCKED';
  END IF;
  -- Draft header deletion can cascade; its parent row is then already absent.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_accepted_quotation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_accepted_quotation_item() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_accepted_quotation() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_accepted_quotation_item() TO service_role;

CREATE TRIGGER quotations_accepted_terms_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_accepted_quotation();

CREATE TRIGGER quotation_items_accepted_terms_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.guard_accepted_quotation_item();
