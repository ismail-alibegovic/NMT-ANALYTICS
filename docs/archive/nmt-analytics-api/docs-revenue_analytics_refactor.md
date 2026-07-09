# Revenue Analytics Refactor - Payments as Single Source of Truth

## Executive Summary

This document outlines the refactoring of revenue analytics to use the `transactions` table (specifically records where `type = 'payment'`) as the **single source of truth** for all revenue calculations.

## Why Payments are the Single Source of Truth

### Business Logic
1. **Revenue Recognition**: Revenue should only be recognized when actual payment is received, not when a reservation is created
2. **Cash Flow Accuracy**: The `transactions` table represents actual money movement, while `reservations.total_amount` represents potential/expected revenue
3. **Accounting Standards**: GAAP and IFRS require revenue to be recognized when earned and realized/realizable
4. **Multi-tenant Safety**: All payment queries filter by `org_id`, ensuring data isolation

### Technical Rationale
1. **Single Responsibility**: `transactions` table is designed specifically to track financial movements
2. **Audit Trail**: Each payment has a timestamp (`occurred_at`), note, and optional link to reservation
3. **Flexibility**: Supports payments, refunds, and partial payments without coupling to reservation lifecycle
4. **Data Integrity**: `type` column with CHECK constraint ensures only valid transaction types ('payment', 'refund')

### Reservations vs Payments
- **Reservations** (`reservations` table): Represent bookings/intent to purchase
  - `total_amount`: Expected revenue (booking value)
  - `paid_amount`: Tracking field for UI display (derived from payments)
  - `status`: Booking lifecycle (pending, confirmed, cancelled, completed)
  
- **Payments** (`transactions` table where `type = 'payment'`): Represent actual revenue
  - `amount`: Actual cash received
  - `occurred_at`: When payment was received
  - `reservation_id`: Optional link to booking (supports walk-in payments, deposits, etc.)

## Database Schema

### Transactions Table (Payments Source)
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('payment', 'refund')),
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'pending', 'failed'))
);
```

**Note**: The `status` column may need to be added if not present. For now, we assume all records in `transactions` with `type = 'payment'` are successful payments.

### Required Indexes for Performance
```sql
-- Already exists
CREATE INDEX IF NOT EXISTS idx_transactions_org_id_occurred_at 
  ON transactions(org_id, occurred_at);

-- Recommended additions
CREATE INDEX IF NOT EXISTS idx_transactions_type_org_id 
  ON transactions(type, org_id) WHERE type = 'payment';

CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id 
  ON transactions(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at_org_type 
  ON transactions(occurred_at, org_id, type);
```

## SQL Queries for Analytics

### 1. Total Revenue (All-Time or Date Range)

```sql
-- Total revenue for an organization
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue
FROM transactions
WHERE org_id = $1
  AND type = 'payment'
  AND ($2::timestamptz IS NULL OR occurred_at >= $2)
  AND ($3::timestamptz IS NULL OR occurred_at <= $3);
```

**Parameters**:
- `$1`: org_id (UUID)
- `$2`: start_date (timestamptz, optional)
- `$3`: end_date (timestamptz, optional)

### 2. Paid Revenue vs Unpaid Amount

```sql
-- Revenue breakdown with unpaid calculation
WITH payment_totals AS (
  SELECT 
    COALESCE(SUM(t.amount), 0) as paid_revenue
  FROM transactions t
  WHERE t.org_id = $1
    AND t.type = 'payment'
    AND t.occurred_at >= $2
    AND t.occurred_at <= $3
),
booking_totals AS (
  SELECT 
    COALESCE(SUM(r.total_amount), 0) as booked_amount,
    COALESCE(SUM(r.paid_amount), 0) as tracked_paid
  FROM reservations r
  WHERE r.org_id = $1
    AND r.reservation_at >= $2
    AND r.reservation_at <= $3
    AND r.status IN ('confirmed', 'completed')
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
```

**Note**: `unpaid_amount` is derived by comparing booked amounts (reservations) to actual payments. This is for reporting only; revenue = paid_revenue.

### 3. Revenue by Day (Time Series)

```sql
-- Daily revenue breakdown
SELECT 
  DATE(occurred_at) as date,
  COALESCE(SUM(amount), 0) as revenue,
  COUNT(*) as payment_count
FROM transactions
WHERE org_id = $1
  AND type = 'payment'
  AND occurred_at >= $2
  AND occurred_at <= $3
GROUP BY DATE(occurred_at)
ORDER BY date;
```

### 4. Revenue by Package

```sql
-- Revenue by package (via reservation linkage)
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
WHERE t.org_id = $1
  AND t.type = 'payment'
  AND t.occurred_at >= $2
  AND t.occurred_at <= $3
GROUP BY p.id, p.name, p.destination
ORDER BY revenue DESC;
```

**Note**: Payments without a `reservation_id` will show NULL for package info. Consider adding a separate row for "Unlinked Payments" in the UI.

### 5. Revenue by Customer

```sql
-- Revenue by customer (via reservation linkage)
SELECT 
  c.id as customer_id,
  c.full_name,
  c.phone,
  c.email,
  COALESCE(SUM(t.amount), 0) as total_revenue,
  COUNT(DISTINCT t.id) as payment_count,
  COUNT(DISTINCT t.reservation_id) as reservation_count,
  MAX(t.occurred_at) as last_payment_date
FROM transactions t
LEFT JOIN reservations r ON t.reservation_id = r.id
LEFT JOIN customers c ON r.customer_id = c.id
WHERE t.org_id = $1
  AND t.type = 'payment'
  AND t.occurred_at >= $2
  AND t.occurred_at <= $3
GROUP BY c.id, c.full_name, c.phone, c.email
ORDER BY total_revenue DESC;
```

### 6. Complete Analytics Summary (Recommended RPC Function)

```sql
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
  WITH payment_metrics AS (
    SELECT 
      COALESCE(SUM(amount), 0) as total_revenue,
      COUNT(*) as payment_count,
      COALESCE(AVG(amount), 0) as avg_payment_amount
    FROM transactions
    WHERE org_id = p_org_id
      AND type = 'payment'
      AND occurred_at >= p_start_date
      AND occurred_at <= p_end_date
  ),
  booking_metrics AS (
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
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', DATE(occurred_at),
        'revenue', daily_revenue
      ) ORDER BY DATE(occurred_at)
    ) as daily_data
    FROM (
      SELECT 
        DATE(occurred_at) as date,
        COALESCE(SUM(amount), 0) as daily_revenue
      FROM transactions
      WHERE org_id = p_org_id
        AND type = 'payment'
        AND occurred_at >= p_start_date
        AND occurred_at <= p_end_date
      GROUP BY DATE(occurred_at)
    ) daily
  ),
  revenue_by_package AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'packageId', package_id,
        'packageName', package_name,
        'destination', destination,
        'revenue', revenue
      ) ORDER BY revenue DESC
    ) as package_data
    FROM (
      SELECT 
        p.id as package_id,
        p.name as package_name,
        p.destination,
        COALESCE(SUM(t.amount), 0) as revenue
      FROM transactions t
      LEFT JOIN reservations r ON t.reservation_id = r.id
      LEFT JOIN departures d ON r.departure_id = d.id
      LEFT JOIN packages p ON d.package_id = p.id
      WHERE t.org_id = p_org_id
        AND t.type = 'payment'
        AND t.occurred_at >= p_start_date
        AND t.occurred_at <= p_end_date
        AND p.id IS NOT NULL
      GROUP BY p.id, p.name, p.destination
      LIMIT 10
    ) pkg
  )
  SELECT jsonb_build_object(
    'total_revenue', pm.total_revenue,
    'paid_revenue', pm.total_revenue,
    'unpaid_amount', GREATEST(bm.booked_amount - pm.total_revenue, 0),
    'payment_count', pm.payment_count,
    'avg_payment_amount', ROUND(pm.avg_payment_amount, 2),
    'booked_amount', bm.booked_amount,
    'reservation_count', bm.reservation_count,
    'unique_customers', bm.unique_customers,
    'paid_percent', CASE 
      WHEN bm.booked_amount > 0 
      THEN ROUND((pm.total_revenue / bm.booked_amount) * 100, 2)
      ELSE 0 
    END,
    'revenue_by_day', COALESCE(rbd.daily_data, '[]'::jsonb),
    'revenue_by_package', COALESCE(rbp.package_data, '[]'::jsonb)
  ) INTO v_result
  FROM payment_metrics pm, booking_metrics bm, revenue_by_day rbd, revenue_by_package rbp;
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', true,
    'message', SQLERRM
  );
END;
$$;
```

## Performance Considerations

### Index Strategy

1. **Primary Index** (already exists):
   ```sql
   idx_transactions_org_id_occurred_at ON transactions(org_id, occurred_at)
   ```
   - Supports: Date range queries filtered by org_id
   - Used by: All time-series revenue queries

2. **Type Filter Index** (recommended):
   ```sql
   idx_transactions_type_org_id ON transactions(type, org_id) WHERE type = 'payment'
   ```
   - Supports: Fast filtering of payment transactions
   - Partial index reduces size
   - Used by: All revenue queries

3. **Reservation Link Index** (recommended):
   ```sql
   idx_transactions_reservation_id ON transactions(reservation_id) WHERE reservation_id IS NOT NULL
   ```
   - Supports: Joining payments to reservations
   - Used by: Revenue by package/customer queries

### Query Optimization Tips

1. **Use Covering Indexes**: Include commonly selected columns in indexes
2. **Partition by Date**: For large datasets (>10M rows), consider partitioning `transactions` by `occurred_at`
3. **Materialized Views**: For frequently accessed aggregations, create materialized views:
   ```sql
   CREATE MATERIALIZED VIEW mv_daily_revenue AS
   SELECT 
     org_id,
     DATE(occurred_at) as date,
     SUM(amount) as revenue,
     COUNT(*) as payment_count
   FROM transactions
   WHERE type = 'payment'
   GROUP BY org_id, DATE(occurred_at);
   
   CREATE UNIQUE INDEX ON mv_daily_revenue(org_id, date);
   ```

4. **Refresh Strategy**: Refresh materialized views nightly or on-demand
5. **Connection Pooling**: Use Supabase connection pooling for high-concurrency scenarios

### Expected Performance

- **Total Revenue Query**: <10ms for 100K transactions
- **Revenue by Day**: <50ms for 1 year of data
- **Revenue by Package**: <100ms with proper indexes
- **Complete Analytics RPC**: <200ms for typical dataset

## Migration Notes

### Adding Status Column (Optional)

If you want to track payment status (succeeded, pending, failed):

```sql
-- Add status column to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'succeeded' 
CHECK (status IN ('succeeded', 'pending', 'failed'));

-- Update existing records
UPDATE transactions SET status = 'succeeded' WHERE status IS NULL;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_transactions_status 
  ON transactions(status) WHERE status != 'succeeded';
```

Then update all queries to filter by `status = 'succeeded'`:
```sql
WHERE type = 'payment' AND status = 'succeeded'
```

### Ensuring reservation_id Exists

```sql
-- Add reservation_id if not present
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id 
  ON transactions(reservation_id) WHERE reservation_id IS NOT NULL;
```

### Adding Currency Support

```sql
-- Add currency column if not present
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- For multi-currency support, add conversion logic in queries
-- or normalize all amounts to a base currency
```

## Implementation Checklist

- [ ] Review current `transactions` table schema
- [ ] Add `status` column if needed (optional)
- [ ] Ensure `reservation_id` column exists
- [ ] Create recommended indexes
- [ ] Deploy `get_revenue_analytics()` RPC function
- [ ] Update backend API routes to use new queries
- [ ] Update frontend to consume new API responses
- [ ] Add tests for edge cases (no payments, refunds, etc.)
- [ ] Monitor query performance in production
- [ ] Document for team

## Testing Scenarios

1. **No Payments**: Should return 0 revenue, not error
2. **Only Refunds**: Should return 0 or negative revenue
3. **Partial Payments**: Should correctly sum multiple payments per reservation
4. **Unlinked Payments**: Should include in total revenue, show as "Unlinked" in breakdowns
5. **Multi-tenant**: Verify org_id filtering prevents data leakage
6. **Date Ranges**: Test edge cases (same day, across months, empty ranges)
7. **Performance**: Test with 100K+ transactions

## Conclusion

By using `transactions` (where `type = 'payment'`) as the single source of truth for revenue:

✅ **Accuracy**: Revenue reflects actual cash received  
✅ **Flexibility**: Supports complex payment scenarios (partial, deposits, walk-ins)  
✅ **Auditability**: Clear trail of when and how much was paid  
✅ **Multi-tenant Safe**: All queries filter by `org_id`  
✅ **Performance**: Optimized indexes support fast queries  
✅ **Scalability**: Can handle millions of transactions with proper indexing  

Reservations remain important for booking management and forecasting, but should not be used for revenue recognition.
