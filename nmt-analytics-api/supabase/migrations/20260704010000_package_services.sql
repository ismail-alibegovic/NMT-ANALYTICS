-- 033_package_services.sql
-- Multi-service package builder: hotels, transport, tours, insurance bundled into one arrangement.

CREATE TABLE IF NOT EXISTS package_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('hotel','transport','tour','insurance','extra')),
    provider_name TEXT,
    provider_contact TEXT,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BAM',
    quantity INT NOT NULL DEFAULT 1,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_services_package ON package_services(package_id);
CREATE INDEX IF NOT EXISTS idx_package_services_type ON package_services(package_id, service_type);

ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Package services" ON package_services;
CREATE POLICY "Tenant access - Package services" ON package_services
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE package_services IS 'Service line items within a package';
COMMENT ON COLUMN package_services.total_price IS 'unit_price * quantity (auto-calculated on write)';
COMMENT ON COLUMN package_services.is_optional IS 'Traveler can opt in/out of this service';
