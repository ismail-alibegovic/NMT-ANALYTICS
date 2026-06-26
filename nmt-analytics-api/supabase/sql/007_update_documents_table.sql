-- Migration to update documents table with upload fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id);

-- Make template_id nullable since uploaded documents don't have templates
ALTER TABLE documents ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN payload DROP NOT NULL;
