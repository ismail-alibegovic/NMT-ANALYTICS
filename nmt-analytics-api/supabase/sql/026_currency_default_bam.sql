-- ============================================================================
-- FIX CURRENCY DEFAULTS TO BAM (Bosnia and Herzegovina)
-- Date: 2026-06-30
-- Purpose: Org currency is BAM; set consistent defaults across all tables
-- ============================================================================

-- Change reservations currency default to BAM
ALTER TABLE reservations 
  ALTER COLUMN currency SET DEFAULT 'BAM';

-- Change packages currency default to BAM  
ALTER TABLE packages 
  ALTER COLUMN currency SET DEFAULT 'BAM';

-- Change organizations currency default to BAM
ALTER TABLE organizations 
  ALTER COLUMN currency SET DEFAULT 'BAM';

-- Comment explaining the change
COMMENT ON COLUMN reservations.currency IS 'Currency code (default BAM)';
COMMENT ON COLUMN packages.currency IS 'Currency code (default BAM)';
COMMENT ON COLUMN organizations.currency IS 'Organization base currency (default BAM)';

-- Verification
DO $$
BEGIN
    RAISE NOTICE '✅ Currency defaults updated to BAM';
END $$;
