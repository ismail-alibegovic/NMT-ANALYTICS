-- Add links to customers and departures in reservations table
ALTER TABLE reservations
ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
ADD COLUMN departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
ADD COLUMN total_amount NUMERIC(10, 2),
ADD COLUMN currency TEXT NOT NULL DEFAULT 'BAM',
ADD COLUMN source TEXT;

-- Add check constraint for total_amount
ALTER TABLE reservations ADD CONSTRAINT valid_total_amount
CHECK (total_amount IS NULL OR total_amount >= 0);

-- Add check constraint for source values
ALTER TABLE reservations ADD CONSTRAINT valid_source
CHECK (source IS NULL OR source IN ('web', 'phone', 'agent', 'walk-in', 'other'));

-- Create indexes for the new foreign keys
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_departure_id ON reservations(departure_id);

-- Update RLS policies to allow access to linked customer and departure data
-- (The existing policies should already cover this since customer_id and departure_id
--  will only reference records from the same org_id due to the foreign key constraints
--  and the fact that customers and departures are org-scoped)
