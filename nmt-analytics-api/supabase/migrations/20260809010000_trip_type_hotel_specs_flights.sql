-- Trip types, hotel specifications, and flights table
-- Adds: package trip_type enum, hotel star rating + amenities + description,
--       flights catalog, departure.flight_id link

-- 1. Packages: trip type (primary category) -------------------------------
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS trip_type TEXT NULL
    CHECK (trip_type IS NULL OR trip_type IN (
      'beach', 'city', 'pilgrimage', 'honeymoon', 'ski', 'adventure',
      'cruise', 'cultural', 'wellness', 'other'
    ));

COMMENT ON COLUMN packages.trip_type IS 'Primary category: beach, city, pilgrimage, honeymoon, ski, adventure, cruise, cultural, wellness, other';

-- 2. Hotels: star rating, description, amenities, email, website ----------
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS stars INTEGER NULL CHECK (stars IS NULL OR (stars >= 1 AND stars <= 5)),
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS amenities JSONB NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS email TEXT NULL,
  ADD COLUMN IF NOT EXISTS website TEXT NULL;

COMMENT ON COLUMN hotels.stars IS 'Hotel star rating 1-5';
COMMENT ON COLUMN hotels.amenities IS 'JSON array of amenity strings: wifi, pool, spa, gym, restaurant, parking, bar, breakfast, shuttle, pet_friendly';
COMMENT ON COLUMN hotels.email IS 'Hotel contact email';
COMMENT ON COLUMN hotels.website IS 'Hotel website URL';

-- 3. Flights catalog ------------------------------------------------------
CREATE TABLE IF NOT EXISTS flights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    airline TEXT NOT NULL,
    flight_number TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    arrival_airport TEXT NOT NULL,
    departure_time TIMESTAMPTZ,
    arrival_time TIMESTAMPTZ,
    capacity INTEGER NOT NULL DEFAULT 0,
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BAM',
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_org ON flights(org_id);
CREATE INDEX IF NOT EXISTS idx_flights_route ON flights(org_id, departure_airport, arrival_airport);

ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Flights" ON flights;
CREATE POLICY "Tenant access - Flights" ON flights
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE flights IS 'Flight inventory catalog — airline, route, times, capacity, pricing';

-- 4. Departures: link to flight -------------------------------------------
ALTER TABLE departures
  ADD COLUMN IF NOT EXISTS flight_id UUID NULL REFERENCES flights(id) ON DELETE SET NULL;

COMMENT ON COLUMN departures.flight_id IS 'Linked flight when transport_type = flight';
