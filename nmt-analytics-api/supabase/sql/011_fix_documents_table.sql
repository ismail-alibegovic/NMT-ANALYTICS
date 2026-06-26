-- Ensure the table exists and has all required columns
-- We use IF NOT EXISTS to prevent errors if already present
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT,
  size BIGINT,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow Admins to View/Edit their own Org's documents
-- Drop existing policies first to avoid "already exists" errors
DROP POLICY IF EXISTS "Admin View Docs" ON documents;
CREATE POLICY "Admin View Docs" ON documents FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admin Insert Docs" ON documents;
CREATE POLICY "Admin Insert Docs" ON documents FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
  
DROP POLICY IF EXISTS "Admin Delete Docs" ON documents;
CREATE POLICY "Admin Delete Docs" ON documents FOR DELETE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
