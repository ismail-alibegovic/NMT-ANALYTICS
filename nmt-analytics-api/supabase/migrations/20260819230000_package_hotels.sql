-- Package-Hotel assignment with room options
-- Each package can be linked to multiple hotels with configurable room types and pricing

CREATE TABLE IF NOT EXISTS public.package_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_modifier DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(package_id, hotel_id)
);

COMMENT ON TABLE public.package_hotels IS 'Links packages to hotels with per-room pricing and options';
COMMENT ON COLUMN public.package_hotels.room_options IS 'JSON array: [{ "type": "single|double|triple|apartment", "label": "Single Room", "net_price": 45.00, "sell_price": 55.00, "available": 5 }]';
COMMENT ON COLUMN public.package_hotels.price_modifier IS 'Flat per-person price modifier applied when this hotel is selected';

ALTER TABLE public.package_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org isolation" ON public.package_hotels
  FOR ALL USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID);

CREATE INDEX idx_package_hotels_org ON public.package_hotels(org_id);
CREATE INDEX idx_package_hotels_package ON public.package_hotels(package_id);
CREATE INDEX idx_package_hotels_hotel ON public.package_hotels(hotel_id);
