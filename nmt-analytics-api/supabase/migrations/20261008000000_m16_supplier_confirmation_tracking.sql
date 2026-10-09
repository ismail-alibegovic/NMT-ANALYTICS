-- M16.1: supplier confirmation tracking for departure cost items (Master Plan M16).
-- Adds booking/confirmation status to each departure-level supplier service and an
-- append-only request/notes history for supplier confirmations.

ALTER TABLE public.departure_cost_items
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed'
  CHECK (confirmation_status IN ('unconfirmed', 'requested', 'confirmed', 'cancelled'));

ALTER TABLE public.departure_cost_items
  ADD CONSTRAINT departure_cost_items_id_org_key UNIQUE (id, org_id);

DROP INDEX IF EXISTS idx_departure_cost_items_org_confirmation;
CREATE INDEX idx_departure_cost_items_org_confirmation
  ON public.departure_cost_items(org_id, confirmation_status)
  WHERE confirmation_status <> 'confirmed';

CREATE TABLE IF NOT EXISTS public.supplier_confirmation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL,
  cost_item_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unconfirmed', 'requested', 'confirmed', 'cancelled')),
  note TEXT,
  actor_id TEXT,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_confirmation_events_cost_item_org_fk
    FOREIGN KEY (cost_item_id, org_id) REFERENCES public.departure_cost_items(id, org_id) ON DELETE CASCADE,
  CONSTRAINT supplier_confirmation_events_departure_org_fk
    FOREIGN KEY (departure_id, org_id) REFERENCES public.departures(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_confirmation_events_org_departure
  ON public.supplier_confirmation_events(org_id, departure_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_supplier_confirmation_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'supplier confirmation events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_confirmation_events_append_only ON public.supplier_confirmation_events;
CREATE TRIGGER trg_supplier_confirmation_events_append_only
BEFORE UPDATE OR DELETE ON public.supplier_confirmation_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_supplier_confirmation_event_mutation();

ALTER TABLE public.supplier_confirmation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_confirmation_events_org_isolation ON public.supplier_confirmation_events;
CREATE POLICY supplier_confirmation_events_org_isolation ON public.supplier_confirmation_events
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

REVOKE ALL ON TABLE public.supplier_confirmation_events FROM anon;
REVOKE ALL ON TABLE public.supplier_confirmation_events FROM authenticated;
GRANT ALL ON TABLE public.supplier_confirmation_events TO service_role;

COMMENT ON COLUMN public.departure_cost_items.confirmation_status IS 'M16 booking/confirmation status for the supplier service: unconfirmed | requested | confirmed | cancelled.';
COMMENT ON TABLE public.supplier_confirmation_events IS 'Append-only supplier confirmation history for departure cost items: status changes with optional request notes (Master Plan M16).';
