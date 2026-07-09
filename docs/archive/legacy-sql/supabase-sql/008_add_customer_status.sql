-- Add status to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('active', 'lead', 'archived')) DEFAULT 'active';
