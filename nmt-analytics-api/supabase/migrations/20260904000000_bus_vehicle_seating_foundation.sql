-- M11.1: Bus vehicle + manual seat foundation
-- Canonical operational vehicle snapshot + physical seat layout for BUS departures,
-- plus manual/locked seat state on departure_passengers.
-- No fleet CRUD, no automatic seating (M12 later).

-- 1) Vehicle assignments --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departure_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  vehicle_label TEXT NOT NULL,
  registration_number TEXT,
  capacity INT NOT NULL CHECK (capacity > 0),
  layout_type TEXT NOT NULL DEFAULT 'standard_2_plus_2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (departure_id)
);

CREATE INDEX IF NOT EXISTS idx_dva_org ON public.departure_vehicle_assignments(org_id);
CREATE INDEX IF NOT EXISTS idx_dva_departure ON public.departure_vehicle_assignments(departure_id);

COMMENT ON TABLE public.departure_vehicle_assignments
IS 'Operational snapshot of the physical vehicle serving a bus departure (not a reusable fleet entity).';
COMMENT ON COLUMN public.departure_vehicle_assignments.layout_type
IS 'Seat layout template; currently only standard_2_plus_2 is supported.';

-- 2) Physical seats --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departure_vehicle_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  departure_vehicle_assignment_id UUID NOT NULL REFERENCES public.departure_vehicle_assignments(id) ON DELETE CASCADE,
  departure_id UUID NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  seat_number INT NOT NULL CHECK (seat_number > 0),
  seat_label TEXT NOT NULL,
  row_number INT NOT NULL,
  column_index INT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (departure_vehicle_assignment_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_dvs_org ON public.departure_vehicle_seats(org_id);
CREATE INDEX IF NOT EXISTS idx_dvs_vehicle ON public.departure_vehicle_seats(departure_vehicle_assignment_id);
CREATE INDEX IF NOT EXISTS idx_dvs_departure ON public.departure_vehicle_seats(departure_id);

COMMENT ON TABLE public.departure_vehicle_seats
IS 'Physical seat layout rows for a bus vehicle assignment. 2+2 layout: columns 0..3 per row, sides left (0..1) / right (2..3).';
COMMENT ON COLUMN public.departure_vehicle_seats.seat_number
IS '1-based seat number unique within the vehicle assignment.';

-- 3) Manual / locked seat state on passengers ------------------------------------
ALTER TABLE public.departure_passengers
  ADD COLUMN IF NOT EXISTS seat_is_manual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seat_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.departure_passengers.seat_is_manual
IS 'True when the current seat_number was set through the manual seat workspace (M11).';
COMMENT ON COLUMN public.departure_passengers.seat_locked
IS 'When true, the manual seat assignment cannot be moved/unassigned until unlocked.';

-- 4) RLS -------------------------------------------------------------------------
ALTER TABLE public.departure_vehicle_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - departure_vehicle_assignments" ON public.departure_vehicle_assignments;
CREATE POLICY "Tenant access - departure_vehicle_assignments" ON public.departure_vehicle_assignments
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

ALTER TABLE public.departure_vehicle_seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - departure_vehicle_seats" ON public.departure_vehicle_seats;
CREATE POLICY "Tenant access - departure_vehicle_seats" ON public.departure_vehicle_seats
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

REVOKE ALL ON TABLE public.departure_vehicle_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.departure_vehicle_seats FROM anon, authenticated;
GRANT ALL ON TABLE public.departure_vehicle_assignments TO service_role;
GRANT ALL ON TABLE public.departure_vehicle_seats TO service_role;

-- 5) Backfill existing BUS departures --------------------------------------------
-- For every BUS departure with positive capacity, create a vehicle assignment and
-- a full standard 2+2 seat layout. Flight/none departures are intentionally skipped.
DO $$
DECLARE
  v_dep RECORD;
  v_vehicle UUID;
  v_seat INT;
  v_cap INT;
BEGIN
  FOR v_dep IN
    SELECT id, org_id, capacity
    FROM public.departures
    WHERE transport_type = 'bus' AND capacity > 0
  LOOP
    v_cap := v_dep.capacity;

    INSERT INTO public.departure_vehicle_assignments (
      org_id, departure_id, vehicle_label, capacity, layout_type
    ) VALUES (
      v_dep.org_id,
      v_dep.id,
      'Bus ' || left(v_dep.id::text, 8),
      v_cap,
      'standard_2_plus_2'
    )
    ON CONFLICT (departure_id) DO NOTHING
    RETURNING id INTO v_vehicle;

    IF v_vehicle IS NULL THEN
      SELECT id INTO v_vehicle
      FROM public.departure_vehicle_assignments
      WHERE departure_id = v_dep.id;
    END IF;

    FOR v_seat IN 1..v_cap LOOP
      INSERT INTO public.departure_vehicle_seats (
        org_id,
        departure_vehicle_assignment_id,
        departure_id,
        seat_number,
        seat_label,
        row_number,
        column_index,
        side,
        is_active
      ) VALUES (
        v_dep.org_id,
        v_vehicle,
        v_dep.id,
        v_seat,
        'Seat ' || v_seat,
        ((v_seat - 1) / 4) + 1,
        (v_seat - 1) % 4,
        CASE WHEN ((v_seat - 1) % 4) < 2 THEN 'left' ELSE 'right' END,
        true
      )
      ON CONFLICT (departure_vehicle_assignment_id, seat_number) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
