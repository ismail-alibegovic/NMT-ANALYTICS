-- Add paid_amount to reservations to track payments
ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0;

-- Add reservation_id to transactions to link payments
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id ON transactions(reservation_id);

-- Update existing records if needed (optional)
UPDATE reservations SET paid_amount = 0 WHERE paid_amount IS NULL;
