-- bus seat categories and grouping
CREATE TABLE IF NOT EXISTS bus_seat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  departure_id UUID NOT NULL,
  seat_number INT NOT NULL,
  category TEXT NOT NULL DEFAULT 'standard',
  price_modifier NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, departure_id, seat_number)
);
ALTER TABLE bus_seat_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bus_seat_categories org" ON bus_seat_categories FOR ALL USING (org_id = current_setting('request.jwt.claims', true)::json->>'org_id'::uuid);
