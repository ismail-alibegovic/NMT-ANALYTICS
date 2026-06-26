-- ============================================================================
-- CREATE PAYMENTS TABLE
-- Date: 2026-01-12
-- Purpose: Create dedicated payments table for tracking reservation payments
-- ============================================================================

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'BAM',
    status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_org_id ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_org_date ON payments(org_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status) WHERE status != 'succeeded';

-- Add comments
COMMENT ON TABLE payments IS 'Tracks individual payments for reservations';
COMMENT ON COLUMN payments.reservation_id IS 'Reference to the reservation this payment is for';
COMMENT ON COLUMN payments.org_id IS 'Organization ID for multi-tenant isolation';
COMMENT ON COLUMN payments.amount IS 'Payment amount (must be positive)';
COMMENT ON COLUMN payments.currency IS 'Currency code (default BAM)';
COMMENT ON COLUMN payments.status IS 'Payment status: pending, succeeded, failed, refunded, cancelled';
COMMENT ON COLUMN payments.payment_date IS 'Date when payment was received (business date)';

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS "Tenant access - Payments" ON payments;
CREATE POLICY "Tenant access - Payments" ON payments
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

-- Create trigger to update reservations.paid_amount when payment is inserted/updated/deleted
CREATE OR REPLACE FUNCTION update_reservation_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the reservation's paid_amount by summing all succeeded payments
    UPDATE reservations
    SET paid_amount = COALESCE((
        SELECT SUM(amount)
        FROM payments
        WHERE reservation_id = COALESCE(NEW.reservation_id, OLD.reservation_id)
          AND status = 'succeeded'
    ), 0)
    WHERE id = COALESCE(NEW.reservation_id, OLD.reservation_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to payments table
DROP TRIGGER IF EXISTS trg_update_reservation_paid_amount ON payments;
CREATE TRIGGER trg_update_reservation_paid_amount
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_reservation_paid_amount();

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verification
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        RAISE NOTICE '✅ payments table created successfully';
    ELSE
        RAISE WARNING '❌ payments table creation failed';
    END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Payments table migration completed successfully';
END $$;
