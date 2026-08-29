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

-- 4) Atomic itinerary reorder RPC ----------------------------------------------
-- Single transaction: validates departure ownership, exact segment set,
-- no duplicate ids / (direction, segment_order) targets, applies temporary
-- positions then final positions, rolls back everything on any error.

CREATE OR REPLACE FUNCTION public.reorder_departure_flights_atomic(
  p_org_id UUID,
  p_departure_id UUID,
  p_segments JSONB
)
RETURNS TABLE (
  id UUID,
  flight_id UUID,
  direction TEXT,
  segment_order INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment_count INT;
  v_existing_count INT;
  v_dup_ids INT;
  v_dup_targets INT;
  v_foreign INT;
BEGIN
  -- Departure must exist inside the org
  IF NOT EXISTS (
    SELECT 1 FROM public.departures d
    WHERE d.id = p_departure_id AND d.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'departure_not_found_in_org';
  END IF;

  v_segment_count := jsonb_array_length(p_segments);
  IF v_segment_count < 1 THEN
    RAISE EXCEPTION 'empty_segment_set';
  END IF;

  -- No duplicate segment ids
  SELECT COUNT(*) INTO v_dup_ids
  FROM (
    SELECT seg->>'id' AS sid, COUNT(*) AS c
    FROM jsonb_array_elements(p_segments) seg
    GROUP BY 1 HAVING COUNT(*) > 1
  ) dups;
  IF v_dup_ids > 0 THEN
    RAISE EXCEPTION 'duplicate_segment_ids';
  END IF;

  -- No duplicate (direction, segment_order) targets
  SELECT COUNT(*) INTO v_dup_targets
  FROM (
    SELECT seg->>'direction' AS dir, (seg->>'segmentOrder')::int AS ord, COUNT(*) AS c
    FROM jsonb_array_elements(p_segments) seg
    GROUP BY 1, 2 HAVING COUNT(*) > 1
  ) dups;
  IF v_dup_targets > 0 THEN
    RAISE EXCEPTION 'duplicate_direction_order_targets';
  END IF;

  -- All supplied segments must exist in this departure + org
  SELECT COUNT(*) INTO v_foreign
  FROM jsonb_array_elements(p_segments) seg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.departure_flights df
    WHERE df.id = (seg->>'id')::uuid
      AND df.departure_id = p_departure_id
      AND df.org_id = p_org_id
  );
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'segment_not_in_departure';
  END IF;

  -- Submitted set must exactly match the departure itinerary
  SELECT COUNT(*) INTO v_existing_count
  FROM public.departure_flights df
  WHERE df.departure_id = p_departure_id AND df.org_id = p_org_id;
  IF v_existing_count <> v_segment_count THEN
    RAISE EXCEPTION 'incomplete_segment_set';
  END IF;

  BEGIN
    -- Phase 1: temporary non-conflicting positions
    FOR i IN 0 .. (v_segment_count - 1) LOOP
      UPDATE public.departure_flights df
      SET segment_order = 100000 + i
      WHERE df.id = (p_segments->i->>'id')::uuid
        AND df.departure_id = p_departure_id
        AND df.org_id = p_org_id;
    END LOOP;

    -- Phase 2: final direction + order
    FOR i IN 0 .. (v_segment_count - 1) LOOP
      UPDATE public.departure_flights df
      SET direction = p_segments->i->>'direction',
          segment_order = (p_segments->i->>'segmentOrder')::int
      WHERE df.id = (p_segments->i->>'id')::uuid
        AND df.departure_id = p_departure_id
        AND df.org_id = p_org_id;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE;  -- roll back the whole function call
  END;

  RETURN QUERY
  SELECT df.id, df.flight_id, df.direction, df.segment_order
  FROM public.departure_flights df
  WHERE df.departure_id = p_departure_id AND df.org_id = p_org_id
  ORDER BY df.direction, df.segment_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_departure_flights_atomic(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_departure_flights_atomic(UUID, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_departure_flights_atomic(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_departure_flights_atomic(UUID, UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.reorder_departure_flights_atomic(UUID, UUID, JSONB)
  IS 'Atomic two-phase departure itinerary reorder; service_role only';

