-- Fix customer RLS policies to be idempotent and add unique constraint safely

-- Ensure RLS is enabled on customers (idempotent)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Organizations can view their own customers" ON customers;
DROP POLICY IF EXISTS "Organizations can insert their own customers" ON customers;
DROP POLICY IF EXISTS "Organizations can update their own customers" ON customers;
DROP POLICY IF EXISTS "Organizations can delete their own customers" ON customers;
DROP POLICY IF EXISTS "Super admins can view all customers" ON customers;

-- Recreate policies with proper USING/WITH CHECK clauses
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

-- Add unique constraint on (org_id, phone) safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_phone_per_org'
        AND conrelid = 'customers'::regclass
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone);
    END IF;
END $$;
