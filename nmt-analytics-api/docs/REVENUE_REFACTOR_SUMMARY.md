# Revenue Analytics Refactor - Implementation Summary

## 📋 Overview

This refactor establishes the `transactions` table (specifically records where `type = 'payment'` and `status = 'succeeded'`) as the **single source of truth** for all revenue metrics in NMT Analytics.

## ✅ Deliverables

### 1. Documentation
- **`docs/revenue_analytics_refactor.md`**: Comprehensive guide explaining the rationale, architecture, and implementation
- **`docs/sql/revenue_queries.sql`**: Quick reference with 18+ ready-to-use SQL queries

### 2. SQL Migration
- **`supabase/sql/013_revenue_analytics_refactor.sql`**: Production-ready migration script

### 3. What's Included

#### Schema Enhancements
- ✅ `status` column on `transactions` (succeeded, pending, failed)
- ✅ `reservation_id` foreign key for linking payments to bookings
- ✅ `currency` column for multi-currency support

#### Performance Indexes
- ✅ `idx_transactions_type_org_id` - Optimizes payment filtering by org
- ✅ `idx_transactions_status` - Optimizes status filtering
- ✅ `idx_transactions_reservation_id` - Optimizes joins to reservations
- ✅ `idx_transactions_analytics` - Composite index for analytics queries

#### RPC Functions
- ✅ `get_revenue_analytics(org_id, start_date, end_date)` - Comprehensive analytics
- ✅ `get_total_revenue(org_id, start_date, end_date)` - Simple total revenue
- ✅ `get_revenue_by_day(org_id, start_date, end_date)` - Daily time series

## 🎯 Key Principles

### Revenue = Payments Only
```sql
-- ✅ CORRECT: Revenue from payments
SELECT SUM(amount) FROM transactions 
WHERE type = 'payment' AND status = 'succeeded';

-- ❌ WRONG: Revenue from reservations
SELECT SUM(total_amount) FROM reservations;
```

### Multi-Tenant Safety
```sql
-- Always filter by org_id
WHERE org_id = $org_id
  AND type = 'payment'
  AND status = 'succeeded'
```

### Date Filtering
```sql
-- Use occurred_at (when payment was received)
WHERE occurred_at >= $start_date
  AND occurred_at <= $end_date
```

## 📊 Supported Metrics

### Core Metrics (Payments-Based)
1. **total_revenue** - Sum of all successful payments
2. **paid_revenue** - Same as total_revenue (for clarity)
3. **payment_count** - Number of payment transactions
4. **avg_payment_amount** - Average payment size

### Context Metrics (Bookings-Based)
5. **booked_amount** - Expected revenue from confirmed reservations
6. **unpaid_amount** - Difference between booked and paid (for reporting)
7. **paid_percent** - Percentage of bookings that are paid

### Breakdown Metrics
8. **revenue_by_day** - Daily revenue time series
9. **revenue_by_package** - Revenue grouped by travel package
10. **revenue_by_customer** - Revenue grouped by customer
11. **revenue_by_destination** - Revenue grouped by destination

## 🚀 Quick Start

### Option 1: Use RPC Function (Recommended)
```sql
-- Get comprehensive analytics
SELECT get_revenue_analytics(
  'your-org-id'::uuid,
  '2026-01-01'::timestamptz,
  '2026-01-31'::timestamptz
);

-- Returns JSON with all metrics
{
  "totalRevenue": 50000.00,
  "paidRevenue": 50000.00,
  "unpaidAmount": 10000.00,
  "paymentCount": 125,
  "revenueByDay": [...],
  "revenueByPackage": [...],
  "revenueByCustomer": [...]
}
```

### Option 2: Simple Query
```sql
-- Just get total revenue
SELECT 
  COALESCE(SUM(amount), 0) as total_revenue
FROM transactions
WHERE org_id = 'your-org-id'::uuid
  AND type = 'payment'
  AND status = 'succeeded'
  AND occurred_at >= '2026-01-01'::timestamptz
  AND occurred_at <= '2026-01-31'::timestamptz;
```

### Option 3: Use Helper Function
```sql
-- Simplified function call
SELECT get_total_revenue(
  'your-org-id'::uuid,
  '2026-01-01'::timestamptz,
  '2026-01-31'::timestamptz
);
```

## 🔧 Implementation Steps

### Backend (API)
1. Run migration: `supabase/sql/013_revenue_analytics_refactor.sql`
2. Update analytics routes to call `get_revenue_analytics()`
3. Update reports routes to use payment-based queries
4. Test with existing data

### Frontend (Admin)
1. Update `src/api/reports.ts` to match new response structure
2. Update dashboard components to use new metrics
3. Add "Unpaid Amount" display (context metric)
4. Test UI with new data

## 📈 Performance Expectations

| Query Type | Expected Time | Dataset Size |
|------------|---------------|--------------|
| Total Revenue | <10ms | 100K transactions |
| Revenue by Day | <50ms | 1 year of data |
| Revenue by Package | <100ms | With indexes |
| Complete Analytics | <200ms | Typical dataset |

## 🔍 Why This Approach?

### Business Perspective
- **Accurate Cash Flow**: Revenue reflects actual money received
- **GAAP Compliant**: Revenue recognized when earned and realized
- **Audit Trail**: Clear record of when and how much was paid
- **Flexibility**: Supports partial payments, deposits, walk-ins

### Technical Perspective
- **Single Responsibility**: Transactions table designed for financial data
- **Data Integrity**: CHECK constraints ensure valid data
- **Performance**: Optimized indexes for fast queries
- **Scalability**: Can handle millions of transactions

### Reservations vs Payments
| Aspect | Reservations | Payments |
|--------|--------------|----------|
| Purpose | Booking management | Revenue tracking |
| Represents | Intent to purchase | Actual cash received |
| Used for | Forecasting, capacity | Financial reporting |
| Status | pending, confirmed, cancelled | succeeded, pending, failed |
| Amount field | total_amount (expected) | amount (actual) |

## 🧪 Testing Checklist

- [ ] No payments → Returns 0 revenue (not error)
- [ ] Only refunds → Returns 0 or negative revenue
- [ ] Partial payments → Correctly sums multiple payments
- [ ] Unlinked payments → Included in total, shown separately
- [ ] Multi-tenant → org_id filtering prevents data leakage
- [ ] Date ranges → Edge cases (same day, across months, empty)
- [ ] Performance → Test with 100K+ transactions

## 📚 Reference Files

1. **Full Documentation**: `docs/revenue_analytics_refactor.md`
2. **SQL Migration**: `supabase/sql/013_revenue_analytics_refactor.sql`
3. **Query Reference**: `docs/sql/revenue_queries.sql`

## 🎓 Key Takeaways

### The Golden Rule
> **Revenue = SUM(payments.amount) WHERE status = 'succeeded'**

### Always Remember
1. Filter by `org_id` (multi-tenant safety)
2. Filter by `type = 'payment'` (exclude refunds unless needed)
3. Filter by `status = 'succeeded'` (exclude pending/failed)
4. Use `occurred_at` for date filtering (when payment received)
5. Reservations are context, NOT revenue source

### Unpaid Amount
```sql
-- Unpaid is derived for reporting only
unpaid_amount = booked_amount - paid_revenue

-- Where:
-- booked_amount = SUM(reservations.total_amount) for confirmed/completed
-- paid_revenue = SUM(transactions.amount) for successful payments
```

## 🚦 Next Steps

1. **Review** the migration script: `supabase/sql/013_revenue_analytics_refactor.sql`
2. **Test** in development environment
3. **Run** migration in production
4. **Update** backend API routes
5. **Update** frontend components
6. **Monitor** query performance
7. **Document** for team

## 💡 Pro Tips

- Use `get_revenue_analytics()` for dashboard/reports
- Use `get_total_revenue()` for simple totals
- Use `get_revenue_by_day()` for charts
- Create materialized views for very large datasets
- Refresh materialized views nightly or on-demand
- Monitor slow queries and add indexes as needed

---

**Questions?** Refer to `docs/revenue_analytics_refactor.md` for detailed explanations.
