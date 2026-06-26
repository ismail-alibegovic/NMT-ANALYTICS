-- Drop existing table if created in previous iterations to ensure fresh structure
DROP TABLE IF EXISTS audit_logs;

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB DEFAULT '{}'::jsonb, -- Stores both old and new values
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id_created_at ON audit_logs(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);

-- Policy: Admins can read all logs in their org
CREATE POLICY "Admins can read logs for their org" ON audit_logs
    FOR SELECT USING (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
