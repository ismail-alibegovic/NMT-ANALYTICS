-- RECONSTRUCTED MIGRATION SOURCE
-- Live schema_migrations.statements is NULL for this version, so exact production SQL is not recoverable.
-- The original Git file referenced departure_passengers.customer_id and customers.first_name/last_name,
-- but the production schema uses reservations.customer_id and customers.full_name.
-- This preserves the intended temporary compatibility view without creating columns absent from production.

-- Bus seat categories per departure
CREATE TABLE IF NOT EXISTS bus_seat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id UUID NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  seat_count INT NOT NULL DEFAULT 0,
  category_color TEXT NOT NULL DEFAULT '#6b7280',
  order_index INT NOT NULL DEFAULT 0,
  org_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bus_seat_categories_unique UNIQUE (departure_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_bus_seat_categories_departure ON bus_seat_categories(departure_id);
CREATE INDEX IF NOT EXISTS idx_bus_seat_categories_org ON bus_seat_categories(org_id);

-- Extend departure_passengers with group and seat category
ALTER TABLE IF EXISTS departure_passengers
  ADD COLUMN IF NOT EXISTS passenger_group_name TEXT,
  ADD COLUMN IF NOT EXISTS seat_category TEXT;

-- Create view for group seating map
CREATE OR REPLACE VIEW departure_passenger_groups AS
SELECT
  dp.id as passenger_id,
  dp.departure_id,
  dp.reservation_id,
  dp.seat_number,
  dp.passenger_group_name,
  dp.seat_category,
  c.full_name as first_name,
  NULL::text as last_name,
  r.party_size
FROM departure_passengers dp
LEFT JOIN reservations r ON r.id = dp.reservation_id
LEFT JOIN customers c ON c.id = r.customer_id;
