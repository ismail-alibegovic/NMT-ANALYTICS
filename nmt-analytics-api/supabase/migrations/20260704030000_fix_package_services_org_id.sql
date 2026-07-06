-- 033b_fix_package_services_org_id.sql
-- Fix: Add org_id to package_services (was missing from original 033)

ALTER TABLE package_services
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE package_services ps
SET org_id = p.org_id
FROM packages p
WHERE ps.package_id = p.id AND ps.org_id IS NULL;

ALTER TABLE package_services
    ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_package_services_org ON package_services(org_id);

COMMENT ON COLUMN package_services.org_id IS 'Organization owning these services';
