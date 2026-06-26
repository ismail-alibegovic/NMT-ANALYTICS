-- Create org_modules table
CREATE TABLE IF NOT EXISTS org_modules (
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (org_id, module_key)
);

-- Enable RLS
ALTER TABLE org_modules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read modules for their org
CREATE POLICY "Users can read modules for their org" ON org_modules
    FOR SELECT USING (org_id = get_my_org_id());

-- Policy: Admins can manage modules for their org
CREATE POLICY "Admins can manage modules for their org" ON org_modules
    FOR ALL USING (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Insert default modules for existing orgs
-- This will run for each org, enabling all modules by default
INSERT INTO org_modules (org_id, module_key, enabled)
SELECT o.id, m.module_key, true
FROM organizations o
CROSS JOIN (VALUES
    ('travel_core'),
    ('analytics'),
    ('documents'),
    ('integrations')
) AS m(module_key)
ON CONFLICT (org_id, module_key) DO NOTHING;
