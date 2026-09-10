DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'packages_id_org_key'
      AND conrelid = 'public.packages'::regclass
  ) THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_id_org_key UNIQUE (id, org_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.package_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL,
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
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  supplier_id UUID NULL,
  supplier_service_id UUID NULL,
  unit TEXT NOT NULL DEFAULT 'fixed' CHECK (unit IN (
    'per_person',
    'per_room',
    'per_night',
    'per_vehicle',
    'per_group',
    'per_booking',
    'per_day',
    'per_hour',
    'fixed'
  )),
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  currency TEXT NOT NULL DEFAULT 'BAM' CHECK (char_length(currency) = 3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT package_cost_items_package_org_fk
    FOREIGN KEY (package_id, org_id)
    REFERENCES public.packages(id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT package_cost_items_supplier_org_fk
    FOREIGN KEY (supplier_id, org_id)
    REFERENCES public.suppliers(id, org_id)
    ON DELETE SET NULL (supplier_id),
  CONSTRAINT package_cost_items_supplier_service_org_fk
    FOREIGN KEY (supplier_service_id, org_id)
    REFERENCES public.supplier_services(id, org_id)
    ON DELETE SET NULL (supplier_service_id),
  CONSTRAINT package_cost_items_supplier_service_requires_supplier
    CHECK (supplier_service_id IS NULL OR supplier_id IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'package_cost_items_id_org_key'
      AND conrelid = 'public.package_cost_items'::regclass
  ) THEN
    ALTER TABLE public.package_cost_items
      ADD CONSTRAINT package_cost_items_id_org_key UNIQUE (id, org_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_package_cost_items_org_package
  ON public.package_cost_items(org_id, package_id);

CREATE INDEX IF NOT EXISTS idx_package_cost_items_package_org_fk
  ON public.package_cost_items(package_id, org_id);

CREATE INDEX IF NOT EXISTS idx_package_cost_items_org_supplier
  ON public.package_cost_items(org_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_package_cost_items_supplier_org_fk
  ON public.package_cost_items(supplier_id, org_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_package_cost_items_org_supplier_service
  ON public.package_cost_items(org_id, supplier_service_id)
  WHERE supplier_service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_package_cost_items_supplier_service_org_fk
  ON public.package_cost_items(supplier_service_id, org_id)
  WHERE supplier_service_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_package_cost_items_updated_at ON public.package_cost_items;
CREATE TRIGGER trg_package_cost_items_updated_at
BEFORE UPDATE ON public.package_cost_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.package_cost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS package_cost_items_org_isolation ON public.package_cost_items;
CREATE POLICY package_cost_items_org_isolation ON public.package_cost_items
  FOR ALL
  USING (org_id = public.get_my_org_id())
  WITH CHECK (org_id = public.get_my_org_id());

REVOKE ALL ON TABLE public.package_cost_items FROM anon;
REVOKE ALL ON TABLE public.package_cost_items FROM authenticated;
GRANT ALL ON TABLE public.package_cost_items TO service_role;

ALTER TABLE public.departure_cost_items
  ADD COLUMN IF NOT EXISTS source_package_cost_item_id UUID NULL;

ALTER TABLE public.departure_cost_items
  DROP CONSTRAINT IF EXISTS departure_cost_items_source_package_cost_item_org_fk;

ALTER TABLE public.departure_cost_items
  ADD CONSTRAINT departure_cost_items_source_package_cost_item_org_fk
  FOREIGN KEY (source_package_cost_item_id, org_id)
  REFERENCES public.package_cost_items(id, org_id)
  ON DELETE SET NULL (source_package_cost_item_id);

CREATE INDEX IF NOT EXISTS idx_departure_cost_items_source_package_cost_item_org_fk
  ON public.departure_cost_items(source_package_cost_item_id, org_id)
  WHERE source_package_cost_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departure_cost_items_unique_package_snapshot
  ON public.departure_cost_items(org_id, departure_id, source_package_cost_item_id);

COMMENT ON TABLE public.package_cost_items IS 'Package-level internal cost defaults used to snapshot future departure cost items.';
COMMENT ON COLUMN public.package_cost_items.unit_cost IS 'Canonical package cost per unit in the package currency; total is derived as quantity * unit_cost.';
COMMENT ON COLUMN public.package_cost_items.supplier_service_id IS 'Optional supplier catalogue source. Values are snapshotted into this row and do not live-update from the catalogue.';
COMMENT ON COLUMN public.departure_cost_items.source_package_cost_item_id IS 'Optional trace to the package cost row used to snapshot this departure cost item. Departure cost values remain independent snapshots.';
