CREATE OR REPLACE FUNCTION public.apply_supplier_confirmation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.departure_cost_items
  SET confirmation_status = NEW.status
  WHERE id = NEW.cost_item_id
    AND org_id = NEW.org_id
    AND departure_id = NEW.departure_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost item does not belong to confirmation organization and departure'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_confirmation_events_apply
BEFORE INSERT ON public.supplier_confirmation_events
FOR EACH ROW EXECUTE FUNCTION public.apply_supplier_confirmation_event();
