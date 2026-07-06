-- 034_hotels.sql
-- Hotel/accommodation inventory with room types, availability tracking, and allocation matrix.

CREATE TABLE IF NOT EXISTS hotels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    address TEXT,
    contact TEXT,
    total_rooms INT NOT NULL DEFAULT 0,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    room_type TEXT NOT NULL CHECK (room_type IN ('single','double','triple','apartment')),
    capacity INT NOT NULL DEFAULT 1,
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BAM',
    available INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    departure_id UUID NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    room_type TEXT NOT NULL,
    rooms_reserved INT NOT NULL DEFAULT 0,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    price_per_night NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotels_org_slug ON hotels(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_hotels_org ON hotels(org_id, name);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_hotel ON hotel_rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_allocations_departure ON hotel_allocations(departure_id);
CREATE INDEX IF NOT EXISTS idx_hotel_allocations_hotel ON hotel_allocations(hotel_id);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Hotels" ON hotels;
CREATE POLICY "Tenant access - Hotels" ON hotels
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

ALTER TABLE hotel_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Hotel rooms" ON hotel_rooms;
CREATE POLICY "Tenant access - Hotel rooms" ON hotel_rooms
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

ALTER TABLE hotel_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Hotel allocations" ON hotel_allocations;
CREATE POLICY "Tenant access - Hotel allocations" ON hotel_allocations
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE hotels IS 'Hotel and accommodation inventory';
COMMENT ON COLUMN hotels.total_rooms IS 'Total rooms across all room types for this hotel';
COMMENT ON TABLE hotel_rooms IS 'Room type definitions with pricing and availability';
COMMENT ON COLUMN hotel_rooms.available IS 'Remaining rooms available for booking';
COMMENT ON TABLE hotel_allocations IS 'Allocation matrix: hotel x departure x room type';
