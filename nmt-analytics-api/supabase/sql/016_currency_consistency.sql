-- ============================================================================
-- CURRENCY CONSISTENCY MIGRATION
-- Date: 2026-01-15
-- Purpose: Fix currency inconsistency - make reservation.currency source of truth
-- ============================================================================

-- ============================================================================
-- RULE: reservation.currency is the source of truth
-- - All reservations default to 'BAM'
-- - All payments inherit currency from their reservation
-- - Packages default to 'BAM'
-- ============================================================================

-- ============================================================================
-- 1. UPDATE RESERVATIONS TABLE DEFAULT
-- ============================================================================

-- Change reservations.currency default from 'USD' to 'BAM'
ALTER TABLE reservations 
ALTER COLUMN currency SET DEFAULT 'BAM';

-- Update existing reservations with 'USD' to 'BAM' (if desired)
-- Comment out if you want to keep existing USD reservations
-- UPDATE reservations SET currency = 'BAM' WHERE currency = 'USD';

COMMENT ON COLUMN reservations.currency IS 'Currency code (default BAM) - SOURCE OF TRUTH for payments';

-- ============================================================================
-- 2. PAYMENTS TABLE - ALREADY DEFAULTS TO 'BAM' (NO CHANGE NEEDED)
-- ============================================================================

-- Payments already default to 'BAM' - this is correct
-- COMMENT ON COLUMN payments.currency IS 'Currency code (default BAM) - should match reservation.currency';

-- ============================================================================
-- 3. ADD CURRENCY VALIDATION (OPTIONAL BUT RECOMMENDED)
-- ============================================================================

-- Create function to validate payment currency matches reservation currency
CREATE OR REPLACE FUNCTION validate_payment_currency()
RETURNS TRIGGER AS $$
DECLARE
    v_reservation_currency TEXT;
BEGIN
    -- Get the reservation's currency
    SELECT currency INTO v_reservation_currency
    FROM reservations
    WHERE id = NEW.reservation_id;
    
    -- If payment currency is NULL, inherit from reservation
    IF NEW.currency IS NULL THEN
        NEW.currency := v_reservation_currency;
    END IF;
    
    -- Optional: Enforce currency match (uncomment to enable strict validation)
    -- IF NEW.currency != v_reservation_currency THEN
    --     RAISE EXCEPTION 'Payment currency (%) must match reservation currency (%)', 
    --         NEW.currency, v_reservation_currency;
    -- END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to payments table
DROP TRIGGER IF EXISTS trg_validate_payment_currency ON payments;

CREATE TRIGGER trg_validate_payment_currency
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_currency();

-- ============================================================================
-- 4. UPDATE PACKAGES TABLE DEFAULT (FOR CONSISTENCY)
-- ============================================================================

-- Packages already default to 'USD' in schema, but API uses 'BAM'
-- Update to match API default
ALTER TABLE packages 
ALTER COLUMN currency SET DEFAULT 'BAM';

COMMENT ON COLUMN packages.currency IS 'Currency code (default BAM)';

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_reservations_default TEXT;
    v_payments_default TEXT;
    v_packages_default TEXT;
    v_trigger_exists BOOLEAN;
BEGIN
    -- Check reservations default
    SELECT column_default INTO v_reservations_default
    FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'currency';
    
    -- Check payments default
    SELECT column_default INTO v_payments_default
    FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'currency';
    
    -- Check packages default
    SELECT column_default INTO v_packages_default
    FROM information_schema.columns
    WHERE table_name = 'packages' AND column_name = 'currency';
    
    -- Check trigger
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trg_validate_payment_currency'
    ) INTO v_trigger_exists;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Currency Defaults ===';
    RAISE NOTICE 'reservations.currency: %', v_reservations_default;
    RAISE NOTICE 'payments.currency: %', v_payments_default;
    RAISE NOTICE 'packages.currency: %', v_packages_default;
    RAISE NOTICE '';
    
    IF v_trigger_exists THEN
        RAISE NOTICE '✅ trg_validate_payment_currency trigger exists';
    ELSE
        RAISE WARNING '❌ trg_validate_payment_currency trigger missing';
    END IF;
    
    IF v_reservations_default LIKE '%BAM%' THEN
        RAISE NOTICE '✅ reservations.currency defaults to BAM';
    ELSE
        RAISE WARNING '❌ reservations.currency does not default to BAM';
    END IF;
    
    IF v_payments_default LIKE '%BAM%' THEN
        RAISE NOTICE '✅ payments.currency defaults to BAM';
    ELSE
        RAISE WARNING '❌ payments.currency does not default to BAM';
    END IF;
    
    IF v_packages_default LIKE '%BAM%' THEN
        RAISE NOTICE '✅ packages.currency defaults to BAM';
    ELSE
        RAISE WARNING '❌ packages.currency does not default to BAM';
    END IF;
END $$;

-- ============================================================================
-- 6. DATA AUDIT (OPTIONAL)
-- ============================================================================

-- Check for currency mismatches between reservations and payments
DO $$
DECLARE
    v_mismatch_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_mismatch_count
    FROM payments p
    INNER JOIN reservations r ON r.id = p.reservation_id
    WHERE p.currency != r.currency;
    
    IF v_mismatch_count > 0 THEN
        RAISE WARNING '⚠️  Found % payment(s) with currency mismatch', v_mismatch_count;
        RAISE NOTICE 'Run this query to see mismatches:';
        RAISE NOTICE 'SELECT p.id as payment_id, p.currency as payment_currency, r.id as reservation_id, r.currency as reservation_currency';
        RAISE NOTICE 'FROM payments p INNER JOIN reservations r ON r.id = p.reservation_id';
        RAISE NOTICE 'WHERE p.currency != r.currency;';
    ELSE
        RAISE NOTICE '✅ No currency mismatches found';
    END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Currency consistency migration completed successfully';
    RAISE NOTICE '';
    RAISE NOTICE 'Currency Rules:';
    RAISE NOTICE '1. reservation.currency is the SOURCE OF TRUTH';
    RAISE NOTICE '2. All defaults are now BAM (reservations, payments, packages)';
    RAISE NOTICE '3. Payments inherit currency from reservation if not specified';
    RAISE NOTICE '4. Optional: Enable strict validation in trigger (currently disabled)';
END $$;
