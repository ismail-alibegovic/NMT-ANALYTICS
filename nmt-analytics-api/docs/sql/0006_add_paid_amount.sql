-- Migration: Add paid_amount column to reservations
-- This enables proper tracking of payments and remaining amounts

-- Add paid_amount column with default 0
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- Ensure total_amount has proper default
ALTER TABLE reservations 
ALTER COLUMN total_amount SET DEFAULT 0;

-- Update existing NULL values to 0
UPDATE reservations 
SET paid_amount = 0 
WHERE paid_amount IS NULL;

UPDATE reservations 
SET total_amount = 0 
WHERE total_amount IS NULL;

-- Add check constraint to ensure paid_amount is non-negative
ALTER TABLE reservations
ADD CONSTRAINT reservations_paid_amount_non_negative 
CHECK (paid_amount >= 0);

-- Add check constraint to ensure total_amount is non-negative
ALTER TABLE reservations
ADD CONSTRAINT reservations_total_amount_non_negative 
CHECK (total_amount >= 0);

COMMENT ON COLUMN reservations.paid_amount IS 'Amount already paid by customer';
COMMENT ON COLUMN reservations.total_amount IS 'Total amount for the reservation';
