-- ============================================================================
-- REVENUE ANALYTICS - QUICK REFERENCE QUERIES
-- Single Source of Truth: transactions table (type = 'payment', status = 'succeeded')
-- ============================================================================

-- ============================================================================
-- BASIC QUERIES
-- ============================================================================

-- 1. Total Revenue (All-Time)
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded';

-- 2. Total Revenue (Date Range)
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date;

-- 3. Revenue with Payment Count
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue,
  COUNT(*) as payment_count,
  COALESCE(AVG(amount), 0) as avg_payment
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date;

-- ============================================================================
-- REVENUE BREAKDOWN QUERIES
-- ============================================================================

-- 4. Paid vs Unpaid (with Booking Context)
WITH payment_totals AS (
  SELECT 
    COALESCE(SUM(amount), 0) as paid_revenue
  FROM transactions
  WHERE org_id = $org_id
    AND type = 'payment'
    AND status = 'succeeded'
    AND occurred_at >= $start_date
    AND occurred_at <= $end_date
),
booking_totals AS (
  SELECT 
    COALESCE(SUM(total_amount), 0) as booked_amount
  FROM reservations
  WHERE org_id = $org_id
    AND reservation_at >= $start_date
    AND reservation_at <= $end_date
    AND status IN ('confirmed', 'completed')
)
SELECT 
  pt.paid_revenue,
  bt.booked_amount,
  GREATEST(bt.booked_amount - pt.paid_revenue, 0) as unpaid_amount,
  CASE 
    WHEN bt.booked_amount > 0 
    THEN ROUND((pt.paid_revenue / bt.booked_amount) * 100, 2)
    ELSE 0 
  END as paid_percent
FROM payment_totals pt, booking_totals bt;

-- ============================================================================
-- TIME SERIES QUERIES
-- ============================================================================

-- 5. Revenue by Day
SELECT 
  DATE(occurred_at) as date,
  COALESCE(SUM(amount), 0) as revenue,
  COUNT(*) as payment_count
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date
GROUP BY DATE(occurred_at)
ORDER BY date;

-- 6. Revenue by Week (Monday as week start)
SELECT 
  DATE_TRUNC('week', occurred_at)::date as week_start,
  COALESCE(SUM(amount), 0) as revenue,
  COUNT(*) as payment_count
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date
GROUP BY DATE_TRUNC('week', occurred_at)
ORDER BY week_start;

-- 7. Revenue by Month
SELECT 
  DATE_TRUNC('month', occurred_at)::date as month_start,
  COALESCE(SUM(amount), 0) as revenue,
  COUNT(*) as payment_count
FROM transactions
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date
GROUP BY DATE_TRUNC('month', occurred_at)
ORDER BY month_start;

-- ============================================================================
-- DIMENSIONAL BREAKDOWN QUERIES
-- ============================================================================

-- 8. Revenue by Package
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
WHERE t.org_id = $org_id
  AND t.type = 'payment'
  AND t.status = 'succeeded'
  AND t.occurred_at >= $start_date
  AND t.occurred_at <= $end_date
  AND p.id IS NOT NULL
GROUP BY p.id, p.name, p.destination
ORDER BY revenue DESC
LIMIT 10;

-- 9. Revenue by Customer
SELECT 
  c.id as customer_id,
  c.full_name,
  c.phone,
  c.email,
  COALESCE(SUM(t.amount), 0) as total_revenue,
  COUNT(DISTINCT t.id) as payment_count,
  COUNT(DISTINCT t.reservation_id) as reservation_count,
  MAX(t.occurred_at) as last_payment_date,
  MIN(t.occurred_at) as first_payment_date
FROM transactions t
LEFT JOIN reservations r ON t.reservation_id = r.id
LEFT JOIN customers c ON r.customer_id = c.id
WHERE t.org_id = $org_id
  AND t.type = 'payment'
  AND t.status = 'succeeded'
  AND t.occurred_at >= $start_date
  AND t.occurred_at <= $end_date
  AND c.id IS NOT NULL
GROUP BY c.id, c.full_name, c.phone, c.email
ORDER BY total_revenue DESC
LIMIT 10;

-- 10. Revenue by Destination
SELECT 
  p.destination,
  COALESCE(SUM(t.amount), 0) as revenue,
  COUNT(DISTINCT t.id) as payment_count,
  COUNT(DISTINCT p.id) as package_count
FROM transactions t
LEFT JOIN reservations r ON t.reservation_id = r.id
LEFT JOIN departures d ON r.departure_id = d.id
LEFT JOIN packages p ON d.package_id = p.id
WHERE t.org_id = $org_id
  AND t.type = 'payment'
  AND t.status = 'succeeded'
  AND t.occurred_at >= $start_date
  AND t.occurred_at <= $end_date
  AND p.destination IS NOT NULL
GROUP BY p.destination
ORDER BY revenue DESC;

-- ============================================================================
-- ADVANCED QUERIES
-- ============================================================================

-- 11. Revenue with Refunds
SELECT 
  COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as gross_revenue,
  COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) as total_refunds,
  COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END), 0) as net_revenue,
  COUNT(CASE WHEN type = 'payment' THEN 1 END) as payment_count,
  COUNT(CASE WHEN type = 'refund' THEN 1 END) as refund_count
FROM transactions
WHERE org_id = $org_id
  AND status = 'succeeded'
  AND occurred_at >= $start_date
  AND occurred_at <= $end_date;

-- 12. Unlinked Payments (no reservation)
SELECT 
  t.id,
  t.amount,
  t.occurred_at,
  t.note,
  t.currency
FROM transactions t
WHERE t.org_id = $org_id
  AND t.type = 'payment'
  AND t.status = 'succeeded'
  AND t.reservation_id IS NULL
  AND t.occurred_at >= $start_date
  AND t.occurred_at <= $end_date
ORDER BY t.occurred_at DESC;

-- 13. Payment Completion Rate (by Reservation)
WITH reservation_payments AS (
  SELECT 
    r.id as reservation_id,
    r.total_amount,
    COALESCE(SUM(t.amount), 0) as paid_amount
  FROM reservations r
  LEFT JOIN transactions t ON t.reservation_id = r.id 
    AND t.type = 'payment' 
    AND t.status = 'succeeded'
  WHERE r.org_id = $org_id
    AND r.reservation_at >= $start_date
    AND r.reservation_at <= $end_date
    AND r.status IN ('confirmed', 'completed')
  GROUP BY r.id, r.total_amount
)
SELECT 
  COUNT(*) as total_reservations,
  COUNT(CASE WHEN paid_amount >= total_amount THEN 1 END) as fully_paid,
  COUNT(CASE WHEN paid_amount > 0 AND paid_amount < total_amount THEN 1 END) as partially_paid,
  COUNT(CASE WHEN paid_amount = 0 THEN 1 END) as unpaid,
  ROUND(AVG(CASE WHEN total_amount > 0 THEN (paid_amount / total_amount) * 100 ELSE 0 END), 2) as avg_payment_percent
FROM reservation_payments;

-- 14. Top Paying Customers (Lifetime)
SELECT 
  c.id,
  c.full_name,
  c.phone,
  c.email,
  COALESCE(SUM(t.amount), 0) as lifetime_revenue,
  COUNT(DISTINCT t.id) as total_payments,
  MAX(t.occurred_at) as last_payment_date,
  MIN(t.occurred_at) as first_payment_date
FROM customers c
LEFT JOIN reservations r ON r.customer_id = c.id
LEFT JOIN transactions t ON t.reservation_id = r.id 
  AND t.type = 'payment' 
  AND t.status = 'succeeded'
WHERE c.org_id = $org_id
GROUP BY c.id, c.full_name, c.phone, c.email
HAVING SUM(t.amount) > 0
ORDER BY lifetime_revenue DESC
LIMIT 20;

-- 15. Revenue Growth (Month-over-Month)
WITH monthly_revenue AS (
  SELECT 
    DATE_TRUNC('month', occurred_at)::date as month,
    COALESCE(SUM(amount), 0) as revenue
  FROM transactions
  WHERE org_id = $org_id
    AND type = 'payment'
    AND status = 'succeeded'
  GROUP BY DATE_TRUNC('month', occurred_at)
)
SELECT 
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month) as prev_month_revenue,
  revenue - LAG(revenue) OVER (ORDER BY month) as revenue_change,
  CASE 
    WHEN LAG(revenue) OVER (ORDER BY month) > 0 
    THEN ROUND(((revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month)) * 100, 2)
    ELSE 0 
  END as growth_percent
FROM monthly_revenue
ORDER BY month DESC;

-- ============================================================================
-- RPC FUNCTION CALLS
-- ============================================================================

-- 16. Use the comprehensive analytics function
SELECT get_revenue_analytics(
  $org_id::uuid,
  $start_date::timestamptz,
  $end_date::timestamptz
);

-- 17. Use the simple total revenue function
SELECT get_total_revenue(
  $org_id::uuid,
  $start_date::timestamptz,
  $end_date::timestamptz
);

-- 18. Use the daily revenue function
SELECT * FROM get_revenue_by_day(
  $org_id::uuid,
  $start_date::timestamptz,
  $end_date::timestamptz
);

-- ============================================================================
-- NOTES
-- ============================================================================

/*
IMPORTANT RULES:
1. Always filter by org_id for multi-tenant safety
2. Always filter by type = 'payment' for revenue (exclude refunds unless explicitly needed)
3. Always filter by status = 'succeeded' to exclude pending/failed payments
4. Use COALESCE(SUM(amount), 0) to handle NULL results
5. Use occurred_at for date filtering (when payment was received)
6. Reservations are context only, NOT the source of revenue
7. unpaid_amount = booked_amount - paid_revenue (for reporting only)

PERFORMANCE TIPS:
- Use indexes: idx_transactions_analytics, idx_transactions_type_org_id
- For large datasets, add date range filters
- Consider materialized views for frequently accessed aggregations
- Use RPC functions for complex multi-step queries

COMMON PARAMETERS:
- $org_id: UUID of the organization
- $start_date: Start of date range (timestamptz, inclusive)
- $end_date: End of date range (timestamptz, inclusive)
*/
