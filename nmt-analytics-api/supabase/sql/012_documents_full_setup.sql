-- Provjera i kreiranje tabele documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  size BIGINT,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Omogućavanje RLS-a
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Kreiranje Storage Bucketa 'documents' (ako ne postoji)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Policies za Storage (da se mogu uploadovati fajlovi)
-- Prvo brisanje postojećih polisa da izbjegnemo konflikte
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'documents' );

DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'documents' AND auth.role() = 'authenticated' );

DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE USING ( bucket_id = 'documents' AND auth.role() = 'authenticated' );

-- Policies za Tabelu
-- Prvo brisanje postojećih polisa
DROP POLICY IF EXISTS "Org Access" ON documents;
CREATE POLICY "Org Access" ON documents
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Org Insert" ON documents;
CREATE POLICY "Org Insert" ON documents
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
  
DROP POLICY IF EXISTS "Org Delete" ON documents;
CREATE POLICY "Org Delete" ON documents
  FOR DELETE USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
