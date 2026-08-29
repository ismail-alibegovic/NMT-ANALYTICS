-- Flight Operations 2.0 — multi-segment departure flight itinerary
-- New join model: departure_flights (outbound / return / other segments)
-- Backfills legacy departures.flight_id into the new model without breaking it.

-- 1) Join table -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departure_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  flight_id UUID NOT NULL REFERENCES public.flights(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'return', 'other')),
  segment_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (departure_id, direction, segment_order)
);

CREATE INDEX IF NOT EXISTS idx_departure_flights_org ON public.departure_flights(org_id);
CREATE INDEX IF NOT EXISTS idx_departure_flights_departure ON public.departure_flights(departure_id);
CREATE INDEX IF NOT EXISTS idx_departure_flights_flight ON public.departure_flights(flight_id);

COMMENT ON TABLE public.departure_flights IS 'Ordered flight segments (outbound/return/other) attached to a departure itinerary';
COMMENT ON COLUMN public.departure_flights.direction IS 'Leg direction: outbound | return | other';
COMMENT ON COLUMN public.departure_flights.segment_order IS 'Order within the direction (0-based) for connecting segments';

-- 2) RLS ------------------------------------------------------------------------
ALTER TABLE public.departure_flights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant access - departure_flights" ON public.departure_flights;
CREATE POLICY "Tenant access - departure_flights" ON public.departure_flights
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

REVOKE ALL ON TABLE public.departure_flights FROM anon;
REVOKE ALL ON TABLE public.departure_flights FROM authenticated;
GRANT ALL ON TABLE public.departure_flights TO service_role;

-- 3) Backfill legacy departures.flight_id --------------------------------------
-- Existing single-flight departures become one outbound segment.
INSERT INTO public.departure_flights (org_id, departure_id, flight_id, direction, segment_order)
SELECT d.org_id, d.id, d.flight_id, 'outbound', 0
FROM public.departures d
WHERE d.flight_id IS NOT NULL
ON CONFLICT (departure_id, direction, segment_order) DO NOTHING;
