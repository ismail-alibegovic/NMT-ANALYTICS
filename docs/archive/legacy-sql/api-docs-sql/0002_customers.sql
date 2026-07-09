-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_org_id_created_at ON customers(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_org_id_phone ON customers(org_id, phone);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
CREATE POLICY "Organizations can view their own customers" ON customers
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can insert their own customers" ON customers
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can update their own customers" ON customers
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  ) WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organizations can delete their own customers" ON customers
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Super admins can view all customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Add unique constraint to prevent duplicate phone numbers per organization
ALTER TABLE customers ADD CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone);
