CREATE TABLE IF NOT EXISTS public.departure_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'hotel',
    'transport',
    'flight',
    'tour',
    'insurance',
    'supplier',
    'extra_service',
    'other'
  )),
  label TEXT NOT NULL,
  supplier_id UUID,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  currency TEXT NOT NULL DEFAULT 'BAM',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT departure_cost_items_departure_org_fk
    FOREIGN KEY (departure_id, org_id) REFERENCES public.departures(id, org_id) ON DELETE CASCADE,
  CONSTRAINT departure_cost_items_supplier_org_fk
    FOREIGN KEY (supplier_id, org_id) REFERENCES public.suppliers(id, org_id) ON DELETE SET NULL (supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_departure_cost_items_org_departure
  ON public.departure_cost_items(org_id, departure_id);

CREATE INDEX IF NOT EXISTS idx_departure_cost_items_org_supplier
  ON public.departure_cost_items(org_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_departure_cost_items_updated_at ON public.departure_cost_items;
CREATE TRIGGER trg_departure_cost_items_updated_at
BEFORE UPDATE ON public.departure_cost_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.departure_cost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departure_cost_items_org_isolation ON public.departure_cost_items;
CREATE POLICY departure_cost_items_org_isolation ON public.departure_cost_items
  FOR ALL
  USING (org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

REVOKE ALL ON TABLE public.departure_cost_items FROM anon;
REVOKE ALL ON TABLE public.departure_cost_items FROM authenticated;
GRANT ALL ON TABLE public.departure_cost_items TO service_role;

COMMENT ON TABLE public.departure_cost_items IS 'Departure-level supplier cost ledger used for Finance 2.0 profitability estimates.';
COMMENT ON COLUMN public.departure_cost_items.unit_cost IS 'Canonical cost per unit in the departure currency; total cost is quantity * unit_cost.';
