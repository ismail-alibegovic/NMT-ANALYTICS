-- Extend hotel_allocations into a departure-specific accommodation allotment snapshot.
-- Package hotels remain the reusable template; hotel_allocations are the operational
-- departure copy that can be overridden per departure without mutating the package.

ALTER TABLE public.package_hotels
  ADD CONSTRAINT package_hotels_id_org_key UNIQUE (id, org_id);

ALTER TABLE public.hotel_allocations
  ADD COLUMN IF NOT EXISTS package_hotel_id UUID,
  ADD COLUMN IF NOT EXISTS source_room_option_index INTEGER,
  ADD COLUMN IF NOT EXISTS room_label TEXT,
  ADD COLUMN IF NOT EXISTS template_rooms INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_per_room INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS net_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_package_hotel_org_fk
  FOREIGN KEY (package_hotel_id, org_id)
  REFERENCES public.package_hotels (id, org_id)
  ON DELETE SET NULL (package_hotel_id);

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_rooms_reserved_nonnegative
  CHECK (rooms_reserved >= 0);

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_template_rooms_nonnegative
  CHECK (template_rooms >= 0);

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_capacity_per_room_positive
  CHECK (capacity_per_room >= 1);

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_prices_nonnegative
  CHECK (price_per_night >= 0 AND net_price >= 0 AND sell_price >= 0);

ALTER TABLE public.hotel_allocations
  ADD CONSTRAINT hotel_allocations_source_room_option_index_nonnegative
  CHECK (source_room_option_index IS NULL OR source_room_option_index >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_allocations_departure_source_room_option
  ON public.hotel_allocations(org_id, departure_id, package_hotel_id, source_room_option_index)
  WHERE package_hotel_id IS NOT NULL AND source_room_option_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_allocations_package_hotel
  ON public.hotel_allocations(package_hotel_id);

DROP TRIGGER IF EXISTS trg_hotel_allocations_updated_at ON public.hotel_allocations;
CREATE TRIGGER trg_hotel_allocations_updated_at
BEFORE UPDATE ON public.hotel_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.hotel_allocations.package_hotel_id IS 'Package hotel template link used to materialize this departure allotment';
COMMENT ON COLUMN public.hotel_allocations.source_room_option_index IS 'Index of the package_hotels.room_options item copied into this departure allocation';
COMMENT ON COLUMN public.hotel_allocations.template_rooms IS 'Room count copied from the package template at departure creation time';
COMMENT ON COLUMN public.hotel_allocations.rooms_reserved IS 'Departure-specific room allotment count; may be overridden without changing the package template';
COMMENT ON COLUMN public.hotel_allocations.capacity_per_room IS 'Operational person capacity for this room type on this departure';
COMMENT ON COLUMN public.hotel_allocations.net_price IS 'Package-specific net price copied into the departure allotment snapshot';
COMMENT ON COLUMN public.hotel_allocations.sell_price IS 'Package-specific sell price copied into the departure allotment snapshot';
