-- ============================================================================
-- REVENUE ANALYTICS REFACTOR - Payments as Single Source of Truth
-- Date: 2026-01-11
-- Purpose: Add indexes and RPC function for payment-based revenue analytics
-- ============================================================================

-- ============================================================================
-- 1. SCHEMA ENHANCEMENTS
-- ============================================================================

-- Add status column to transactions (if not exists)
-- This allows tracking payment status: succeeded, pending, failed
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'succeeded';

-- Add constraint for status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'transactions_status_check'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT transactions_status_check 
          CHECK (status IN ('succeeded', 'pending', 'failed'));
    END IF;
END $$;

-- Ensure reservation_id exists (should already exist from previous migrations)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

-- Ensure currency column exists
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Update existing records to have succeeded status
UPDATE transactions SET status = 'succeeded' WHERE status IS NULL;

COMMENT ON COLUMN transactions.status IS 'Payment status: succeeded, pending, or failed';
COMMENT ON COLUMN transactions.reservation_id IS 'Optional link to reservation for payment tracking';
COMMENT ON COLUMN transactions.currency IS 'Currency code (ISO 4217)';

-- ============================================================================
-- 2. PERFORMANCE INDEXES
-- ============================================================================

-- Index for filtering payments by type and org
-- Partial index to reduce size (only index payment records)
CREATE INDEX IF NOT EXISTS idx_transactions_type_org_id 
  ON transactions(type, org_id, occurred_at) 
  WHERE type = 'payment';

-- Index for filtering by status (only index non-succeeded for efficiency)
CREATE INDEX IF NOT EXISTS idx_transactions_status 
  ON transactions(status, org_id) 
  WHERE status != 'succeeded';

-- Index for joining payments to reservations
CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id 
  ON transactions(reservation_id, org_id) 
  WHERE reservation_id IS NOT NULL;

-- Composite index for common analytics queries
CREATE INDEX IF NOT EXISTS idx_transactions_analytics 
  ON transactions(org_id, type, status, occurred_at)
  WHERE type = 'payment' AND status = 'succeeded';

COMMENT ON INDEX idx_transactions_type_org_id IS 'Optimizes payment queries filtered by org and date';
COMMENT ON INDEX idx_transactions_status IS 'Optimizes queries filtering by payment status';
COMMENT ON INDEX idx_transactions_reservation_id IS 'Optimizes joins between payments and reservations';
COMMENT ON INDEX idx_transactions_analytics IS 'Optimizes revenue analytics queries';

-- ============================================================================
-- 3. REVENUE ANALYTICS RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_revenue_analytics(
  p_org_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Validate inputs
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id cannot be null';
  END IF;
  
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date cannot be null';
  END IF;
  
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start_date must be before or equal to end_date';
  END IF;

  WITH payment_metrics AS (
    -- Core payment metrics: total revenue, count, average
    SELECT 
      COALESCE(SUM(amount), 0) as total_revenue,
      COUNT(*) as payment_count,
      COALESCE(AVG(amount), 0) as avg_payment_amount
    FROM transactions
    WHERE org_id = p_org_id
      AND type = 'payment'
      AND status = 'succeeded'
      AND occurred_at >= p_start_date
      AND occurred_at <= p_end_date
  ),
  booking_metrics AS (
    -- Booking context: expected revenue, reservation count, customers
    SELECT 
      COALESCE(SUM(total_amount), 0) as booked_amount,
      COUNT(*) as reservation_count,
      COUNT(DISTINCT customer_id) as unique_customers
    FROM reservations
    WHERE org_id = p_org_id
      AND reservation_at >= p_start_date
      AND reservation_at <= p_end_date
      AND status IN ('confirmed', 'completed')
  ),
  revenue_by_day AS (
    -- Daily revenue time series
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', date,
        'revenue', daily_revenue,
        'paymentCount', payment_count
      ) ORDER BY date
    ) as daily_data
    FROM (
      SELECT 
        DATE(occurred_at) as date,
        COALESCE(SUM(amount), 0) as daily_revenue,
        COUNT(*) as payment_count
      FROM transactions
      WHERE org_id = p_org_id
        AND type = 'payment'
        AND status = 'succeeded'
        AND occurred_at >= p_start_date
        AND occurred_at <= p_end_date
      GROUP BY DATE(occurred_at)
    ) daily
  ),
  revenue_by_package AS (
    -- Revenue breakdown by package
    SELECT jsonb_agg(
      jsonb_build_object(
        'packageId', package_id,
        'packageName', package_name,
        'destination', destination,
        'revenue', revenue,
        'paymentCount', payment_count,
        'reservationCount', reservation_count
      ) ORDER BY revenue DESC
    ) as package_data
    FROM (
      SELECT 
        p.id as package_id,
        p.name as package_name,
        p.destination,
        COALESCE(SUM(t.amount), 0) as revenue,
        COUNT(DISTINCT t.id) as payment_count,
        COUNT(DISTINCT t.reservation_id) as reservation_count
      FROM transactions t
      LEFT JOIN reservations r ON t.reservation_id = r.id
      LEFT JOIN departures d ON r.departure_id = d.id
      LEFT JOIN packages p ON d.package_id = p.id
      WHERE t.org_id = p_org_id
        AND t.type = 'payment'
        AND t.status = 'succeeded'
        AND t.occurred_at >= p_start_date
        AND t.occurred_at <= p_end_date
        AND p.id IS NOT NULL
      GROUP BY p.id, p.name, p.destination
      LIMIT 10
    ) pkg
  ),
  revenue_by_customer AS (
    -- Revenue breakdown by customer (top 10)
    SELECT jsonb_agg(
      jsonb_build_object(
        'customerId', customer_id,
        'customerName', customer_name,
        'revenue', revenue,
        'paymentCount', payment_count,
        'lastPaymentDate', last_payment_date
      ) ORDER BY revenue DESC
    ) as customer_data
    FROM (
      SELECT 
        c.id as customer_id,
        c.full_name as customer_name,
        COALESCE(SUM(t.amount), 0) as revenue,
        COUNT(DISTINCT t.id) as payment_count,
        MAX(t.occurred_at) as last_payment_date
      FROM transactions t
      LEFT JOIN reservations r ON t.reservation_id = r.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE t.org_id = p_org_id
        AND t.type = 'payment'
        AND t.status = 'succeeded'
        AND t.occurred_at >= p_start_date
        AND t.occurred_at <= p_end_date
        AND c.id IS NOT NULL
      GROUP BY c.id, c.full_name
      ORDER BY revenue DESC
      LIMIT 10
    ) cust
  )
  SELECT jsonb_build_object(
    -- Primary metrics (payments-based)
    'totalRevenue', ROUND(pm.total_revenue, 2),
    'paidRevenue', ROUND(pm.total_revenue, 2),
    'paymentCount', pm.payment_count,
    'avgPaymentAmount', ROUND(pm.avg_payment_amount, 2),
    
    -- Context metrics (bookings-based)
    'bookedAmount', ROUND(bm.booked_amount, 2),
    'unpaidAmount', ROUND(GREATEST(bm.booked_amount - pm.total_revenue, 0), 2),
    'reservationCount', bm.reservation_count,
    'uniqueCustomers', bm.unique_customers,
    
    -- Calculated metrics
    'paidPercent', CASE 
      WHEN bm.booked_amount > 0 
      THEN ROUND((pm.total_revenue / bm.booked_amount) * 100, 2)
      ELSE 0 
    END,
    
    -- Breakdown data
    'revenueByDay', COALESCE(rbd.daily_data, '[]'::jsonb),
    'revenueByPackage', COALESCE(rbp.package_data, '[]'::jsonb),
    'revenueByCustomer', COALESCE(rbc.customer_data, '[]'::jsonb)
  ) INTO v_result
  FROM payment_metrics pm, booking_metrics bm, revenue_by_day rbd, 
       revenue_by_package rbp, revenue_by_customer rbc;
  
  RETURN v_result;
  
EXCEPTION WHEN OTHERS THEN
  -- Return error details for debugging
  RETURN jsonb_build_object(
    'error', true,
    'message', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION get_revenue_analytics IS 'Returns comprehensive revenue analytics based on payments (single source of truth)';

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Get total revenue for an organization (all-time or date range)
CREATE OR REPLACE FUNCTION get_total_revenue(
  p_org_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM transactions
  WHERE org_id = p_org_id
    AND type = 'payment'
    AND status = 'succeeded'
    AND (p_start_date IS NULL OR occurred_at >= p_start_date)
    AND (p_end_date IS NULL OR occurred_at <= p_end_date);
$$;

COMMENT ON FUNCTION get_total_revenue IS 'Returns total revenue from successful payments for an organization';

-- Get revenue by day for charting
CREATE OR REPLACE FUNCTION get_revenue_by_day(
  p_org_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  date DATE,
  revenue NUMERIC,
  payment_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    DATE(occurred_at) as date,
    COALESCE(SUM(amount), 0) as revenue,
    COUNT(*) as payment_count
  FROM transactions
  WHERE org_id = p_org_id
    AND type = 'payment'
    AND status = 'succeeded'
    AND occurred_at >= p_start_date
    AND occurred_at <= p_end_date
  GROUP BY DATE(occurred_at)
  ORDER BY date;
$$;

COMMENT ON FUNCTION get_revenue_by_day IS 'Returns daily revenue breakdown for time series charts';

-- ============================================================================
-- 5. VERIFICATION QUERIES
-- ============================================================================

-- Verify indexes were created
DO $$
DECLARE
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename = 'transactions'
    AND indexname LIKE 'idx_transactions_%';
  
  RAISE NOTICE '✅ Found % indexes on transactions table', idx_count;
END $$;

-- Verify columns exist
DO $$
DECLARE
  status_exists BOOLEAN;
  reservation_id_exists BOOLEAN;
  currency_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'status'
  ) INTO status_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'reservation_id'
  ) INTO reservation_id_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'currency'
  ) INTO currency_exists;
  
  IF status_exists THEN
    RAISE NOTICE '✅ transactions.status column exists';
  ELSE
    RAISE WARNING '❌ transactions.status column missing';
  END IF;
  
  IF reservation_id_exists THEN
    RAISE NOTICE '✅ transactions.reservation_id column exists';
  ELSE
    RAISE WARNING '❌ transactions.reservation_id column missing';
  END IF;
  
  IF currency_exists THEN
    RAISE NOTICE '✅ transactions.currency column exists';
  ELSE
    RAISE WARNING '❌ transactions.currency column missing';
  END IF;
END $$;

-- Verify functions were created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_revenue_analytics') THEN
    RAISE NOTICE '✅ get_revenue_analytics() function created';
  ELSE
    RAISE WARNING '❌ get_revenue_analytics() function missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_total_revenue') THEN
    RAISE NOTICE '✅ get_total_revenue() function created';
  ELSE
    RAISE WARNING '❌ get_total_revenue() function missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_revenue_by_day') THEN
    RAISE NOTICE '✅ get_revenue_by_day() function created';
  ELSE
    RAISE WARNING '❌ get_revenue_by_day() function missing';
  END IF;
END $$;

-- ============================================================================
-- 6. SAMPLE USAGE
-- ============================================================================

/*
-- Example 1: Get comprehensive revenue analytics
SELECT get_revenue_analytics(
  'your-org-id'::uuid,
  '2026-01-01'::timestamptz,
  '2026-01-31'::timestamptz
);

-- Example 2: Get total revenue for last 30 days
SELECT get_total_revenue(
  'your-org-id'::uuid,
  NOW() - INTERVAL '30 days',
  NOW()
);

-- Example 3: Get daily revenue for charting
SELECT * FROM get_revenue_by_day(
  'your-org-id'::uuid,
  '2026-01-01'::timestamptz,
  '2026-01-31'::timestamptz
);

-- Example 4: Simple revenue query
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue
FROM transactions
WHERE org_id = 'your-org-id'::uuid
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= '2026-01-01'::timestamptz
  AND occurred_at <= '2026-01-31'::timestamptz;
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '✅ Revenue analytics refactor migration completed successfully';
END $$;
