-- 032_excursions.sql
-- Excursion / group booking support. Per-passenger tracking with bus list + ruming list PDF generation.

ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS is_excursion BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS route JSONB;

CREATE TABLE IF NOT EXISTS excursion_passengers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    id_document TEXT,
    seat_number INT,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    debt_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excursions_reservation ON excursion_passengers(reservation_id);
CREATE INDEX IF NOT EXISTS idx_excursions_paid ON excursion_passengers(reservation_id, paid_amount DESC);

ALTER TABLE excursion_passengers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Excursion passengers" ON excursion_passengers;
CREATE POLICY "Tenant access - Excursion passengers" ON excursion_passengers
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE excursion_passengers IS 'Per-passenger tracking within a group/excursion reservation';
COMMENT ON COLUMN excursion_passengers.debt_amount IS 'total_amount - paid_amount (auto-calculated)';
COMMENT ON COLUMN packages.is_excursion IS 'true if this package supports group/excursion mode';
COMMENT ON COLUMN packages.route IS 'JSON array of stops: [{stop:"Beč",date:"2026-08-15"},...]';
