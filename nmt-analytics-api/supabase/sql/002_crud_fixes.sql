-- ============================================================================
-- CRITICAL CRUD FIXES - Database Migration
-- Date: 2026-01-11
-- Purpose: Fix missing columns and constraints for customers, packages, reservations
-- ============================================================================

-- ============================================================================
-- 1. CUSTOMERS TABLE FIXES
-- ============================================================================

-- Add missing status column
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add CHECK constraint for status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customers_status_check'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_status_check 
          CHECK (status IN ('active', 'lead', 'archived'));
    END IF;
END $$;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(org_id, status);

COMMENT ON COLUMN customers.status IS 'Customer status: active, lead, or archived';

-- ============================================================================
-- 2. PACKAGES TABLE FIXES
-- ============================================================================

-- Add missing is_active column
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add index for active filtering
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(org_id, is_active);

COMMENT ON COLUMN packages.is_active IS 'Whether the package is active and bookable';

-- ============================================================================
-- 3. RESERVATIONS TABLE FIXES
-- ============================================================================

-- Add missing paid_amount column
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;

-- Add CHECK constraint for paid_amount
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'reservations_paid_amount_check'
    ) THEN
        ALTER TABLE reservations ADD CONSTRAINT reservations_paid_amount_check 
          CHECK (paid_amount >= 0);
    END IF;
END $$;

-- Add CHECK constraint for paid_amount <= total_amount
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'reservations_paid_lte_total_check'
    ) THEN
        ALTER TABLE reservations ADD CONSTRAINT reservations_paid_lte_total_check 
          CHECK (paid_amount <= total_amount);
    END IF;
END $$;

-- Update status constraint to include 'completed'
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'));

-- Add index for paid_amount queries
CREATE INDEX IF NOT EXISTS idx_reservations_paid_amount ON reservations(org_id, paid_amount);

COMMENT ON COLUMN reservations.paid_amount IS 'Amount paid so far (must be <= total_amount)';

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================

-- Verify customers table structure
DO $$
DECLARE
    status_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'status'
    ) INTO status_exists;
    
    IF status_exists THEN
        RAISE NOTICE '✅ customers.status column exists';
    ELSE
        RAISE WARNING '❌ customers.status column missing';
    END IF;
END $$;

-- Verify packages table structure
DO $$
DECLARE
    is_active_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'packages' AND column_name = 'is_active'
    ) INTO is_active_exists;
    
    IF is_active_exists THEN
        RAISE NOTICE '✅ packages.is_active column exists';
    ELSE
        RAISE WARNING '❌ packages.is_active column missing';
    END IF;
END $$;

-- Verify reservations table structure
DO $$
DECLARE
    paid_amount_exists BOOLEAN;
    status_constraint_valid BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservations' AND column_name = 'paid_amount'
    ) INTO paid_amount_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'reservations_status_check'
        AND consrc LIKE '%completed%'
    ) INTO status_constraint_valid;
    
    IF paid_amount_exists THEN
        RAISE NOTICE '✅ reservations.paid_amount column exists';
    ELSE
        RAISE WARNING '❌ reservations.paid_amount column missing';
    END IF;
    
    IF status_constraint_valid THEN
        RAISE NOTICE '✅ reservations.status constraint includes completed';
    ELSE
        RAISE WARNING '⚠️  reservations.status constraint may need update';
    END IF;
END $$;

-- ============================================================================
-- 5. DATA MIGRATION (if needed)
-- ============================================================================

-- Set default status for existing customers (if any exist without status)
UPDATE customers SET status = 'active' WHERE status IS NULL;

-- Set default is_active for existing packages (if any exist without is_active)
UPDATE packages SET is_active = TRUE WHERE is_active IS NULL;

-- Set default paid_amount for existing reservations (if any exist without paid_amount)
UPDATE reservations SET paid_amount = 0 WHERE paid_amount IS NULL;

-- ============================================================================
-- 6. FINAL VERIFICATION
-- ============================================================================

-- Show table structures
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN ('customers', 'packages', 'reservations')
    AND column_name IN ('status', 'is_active', 'paid_amount', 'full_name', 'base_price', 'total_amount')
ORDER BY table_name, ordinal_position;

-- Show constraints
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN ('customers', 'packages', 'reservations')
    AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
-- To rollback this migration, run:

-- Remove customers.status
ALTER TABLE customers DROP COLUMN IF EXISTS status;
DROP INDEX IF EXISTS idx_customers_status;

-- Remove packages.is_active
ALTER TABLE packages DROP COLUMN IF EXISTS is_active;
DROP INDEX IF EXISTS idx_packages_is_active;

-- Remove reservations.paid_amount
ALTER TABLE reservations DROP COLUMN IF EXISTS paid_amount;
DROP INDEX IF EXISTS idx_reservations_paid_amount;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_paid_amount_check;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_paid_lte_total_check;

-- Restore old status constraint
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check 
  CHECK (status IN ('pending', 'confirmed', 'cancelled'));
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ CRUD fixes migration completed successfully';
END $$;
