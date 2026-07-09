-- ============================================================================
-- FINANCIAL TRUTH FIELDS MIGRATION
-- Date: 2026-01-15
-- Purpose: Add balance_due and payment_status fields to reservations
--          Update trigger to auto-calculate financial truth
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO RESERVATIONS
-- ============================================================================

-- Add balance_due column (allows negative for overpayment/credit)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Add payment_status column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservations' AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE reservations 
        ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' 
        CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded'));
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN reservations.balance_due IS 'Remaining balance (total_amount - paid_amount). Can be negative for overpayment/credit.';
COMMENT ON COLUMN reservations.payment_status IS 'Payment status: unpaid, partially_paid, paid, refunded';

-- ============================================================================
-- 2. REMOVE OLD CONSTRAINT (paid_amount <= total_amount)
-- ============================================================================

-- Drop the constraint that prevents overpayments
ALTER TABLE reservations 
DROP CONSTRAINT IF EXISTS reservations_paid_amount_total_check;

-- Keep the non-negative constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'reservations_paid_amount_check'
    ) THEN
        ALTER TABLE reservations 
        ADD CONSTRAINT reservations_paid_amount_check 
        CHECK (paid_amount >= 0);
    END IF;
END $$;

-- ============================================================================
-- 3. CREATE/REPLACE TRIGGER FUNCTION WITH FINANCIAL TRUTH LOGIC
-- ============================================================================

/*
FINANCIAL RULES:
1. paid_amount = SUM(payments.amount WHERE status = 'succeeded')
2. balance_due = total_amount - paid_amount (can be negative for overpayment)
3. payment_status:
   - 'unpaid': paid_amount <= 0
   - 'partially_paid': 0 < paid_amount < total_amount
   - 'paid': paid_amount >= total_amount
   - 'refunded': (reserved for future use when refund tracking is implemented)
*/

CREATE OR REPLACE FUNCTION update_reservation_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
    v_reservation_id UUID;
    v_total_amount NUMERIC(12, 2);
    v_paid_amount NUMERIC(12, 2);
    v_balance_due NUMERIC(12, 2);
    v_payment_status TEXT;
BEGIN
    -- Get the reservation_id from the payment record
    v_reservation_id := COALESCE(NEW.reservation_id, OLD.reservation_id);
    
    -- Get the reservation's total_amount
    SELECT total_amount INTO v_total_amount
    FROM reservations
    WHERE id = v_reservation_id;
    
    -- Calculate paid_amount: sum of all succeeded payments
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_amount
    FROM payments
    WHERE reservation_id = v_reservation_id
      AND status = 'succeeded';
    
    -- Calculate balance_due (can be negative for overpayment)
    v_balance_due := v_total_amount - v_paid_amount;
    
    -- Determine payment_status based on financial rules
    IF v_paid_amount <= 0 THEN
        v_payment_status := 'unpaid';
    ELSIF v_paid_amount < v_total_amount THEN
        v_payment_status := 'partially_paid';
    ELSE
        -- paid_amount >= total_amount
        v_payment_status := 'paid';
    END IF;
    
    -- Update the reservation with all financial truth fields
    UPDATE reservations
    SET 
        paid_amount = v_paid_amount,
        balance_due = v_balance_due,
        payment_status = v_payment_status
    WHERE id = v_reservation_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. ENSURE TRIGGER IS ATTACHED
-- ============================================================================

-- Drop and recreate trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trg_update_reservation_paid_amount ON payments;

CREATE TRIGGER trg_update_reservation_paid_amount
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_reservation_paid_amount();

-- ============================================================================
-- 5. ADD INDEX FOR PERFORMANCE
-- ============================================================================

-- Add composite index on payments for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_reservation_date 
ON payments(reservation_id, payment_date);

-- Add index on payment_status for filtering
CREATE INDEX IF NOT EXISTS idx_reservations_payment_status 
ON reservations(org_id, payment_status);

-- ============================================================================
-- 6. BACKFILL EXISTING DATA
-- ============================================================================

-- Update all existing reservations to calculate financial truth
DO $$
DECLARE
    v_reservation RECORD;
    v_paid_amount NUMERIC(12, 2);
    v_balance_due NUMERIC(12, 2);
    v_payment_status TEXT;
BEGIN
    FOR v_reservation IN 
        SELECT id, total_amount FROM reservations
    LOOP
        -- Calculate paid_amount
        SELECT COALESCE(SUM(amount), 0) INTO v_paid_amount
        FROM payments
        WHERE reservation_id = v_reservation.id
          AND status = 'succeeded';
        
        -- Calculate balance_due
        v_balance_due := v_reservation.total_amount - v_paid_amount;
        
        -- Determine payment_status
        IF v_paid_amount <= 0 THEN
            v_payment_status := 'unpaid';
        ELSIF v_paid_amount < v_reservation.total_amount THEN
            v_payment_status := 'partially_paid';
        ELSE
            v_payment_status := 'paid';
        END IF;
        
        -- Update reservation
        UPDATE reservations
        SET 
            paid_amount = v_paid_amount,
            balance_due = v_balance_due,
            payment_status = v_payment_status
        WHERE id = v_reservation.id;
    END LOOP;
    
    RAISE NOTICE '✅ Backfilled financial truth for all existing reservations';
END $$;

-- ============================================================================
-- 7. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_column_exists BOOLEAN;
    v_trigger_exists BOOLEAN;
    v_index_exists BOOLEAN;
BEGIN
    -- Check balance_due column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservations' AND column_name = 'balance_due'
    ) INTO v_column_exists;
    
    IF v_column_exists THEN
        RAISE NOTICE '✅ reservations.balance_due column exists';
    ELSE
        RAISE WARNING '❌ reservations.balance_due column missing';
    END IF;
    
    -- Check payment_status column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservations' AND column_name = 'payment_status'
    ) INTO v_column_exists;
    
    IF v_column_exists THEN
        RAISE NOTICE '✅ reservations.payment_status column exists';
    ELSE
        RAISE WARNING '❌ reservations.payment_status column missing';
    END IF;
    
    -- Check trigger
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'trg_update_reservation_paid_amount'
    ) INTO v_trigger_exists;
    
    IF v_trigger_exists THEN
        RAISE NOTICE '✅ trg_update_reservation_paid_amount trigger exists';
    ELSE
        RAISE WARNING '❌ trg_update_reservation_paid_amount trigger missing';
    END IF;
    
    -- Check index
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_payments_reservation_date'
    ) INTO v_index_exists;
    
    IF v_index_exists THEN
        RAISE NOTICE '✅ idx_payments_reservation_date index exists';
    ELSE
        RAISE WARNING '❌ idx_payments_reservation_date index missing';
    END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Financial truth fields migration completed successfully';
    RAISE NOTICE '';
    RAISE NOTICE 'Financial Rules Applied:';
    RAISE NOTICE '1. paid_amount = SUM(payments.amount WHERE status = ''succeeded'')';
    RAISE NOTICE '2. balance_due = total_amount - paid_amount (can be negative)';
    RAISE NOTICE '3. payment_status:';
    RAISE NOTICE '   - unpaid: paid_amount <= 0';
    RAISE NOTICE '   - partially_paid: 0 < paid_amount < total_amount';
    RAISE NOTICE '   - paid: paid_amount >= total_amount';
    RAISE NOTICE '   - refunded: (reserved for future use)';
END $$;
