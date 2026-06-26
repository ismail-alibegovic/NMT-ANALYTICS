# Analytics Readiness Report - NMT Analytics

**Date:** 2026-01-11  
**Purpose:** Prepare for analytics dashboards  
**Status:** ✅ **READY** - Schema supports revenue analytics

---

## 📊 Database Schema Review

### **Tables Available for Analytics**

| Table | Revenue Fields | Time Fields | Status Fields | Notes |
|-------|---------------|-------------|---------------|-------|
| **reservations** | `total_amount`, `paid_amount` | `reservation_at`, `created_at` | `status` | ✅ Primary revenue source |
| **transactions** | `amount` | `occurred_at`, `created_at` | `type` | ✅ Payment tracking |
| **packages** | `base_price` | `start_date`, `end_date`, `created_at` | `is_active` | ℹ️ Pricing reference |
| **departures** | - | `depart_at`, `return_at`, `created_at` | `status` | ℹ️ Capacity analytics |
| **customers** | - | `created_at` | `status` | ℹ️ Customer growth |

---

## 💰 Revenue Analytics Fields

### **1. Reservations Table** (Primary Revenue Source)

**Schema (with migration):**
```sql
CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,                    -- ✅ Multi-tenant isolation
    customer_id UUID,
    departure_id UUID,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    party_size INT NOT NULL DEFAULT 1,
    reservation_at TIMESTAMPTZ NOT NULL,     -- ✅ Booking date
    status TEXT NOT NULL,                     -- ✅ pending, confirmed, cancelled, completed
    total_amount NUMERIC(12, 2) NOT NULL,    -- ✅ Total revenue
    paid_amount NUMERIC(12, 2) DEFAULT 0,    -- ✅ Collected revenue (after migration)
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,                              -- ✅ web, phone, agent, walk-in, other
    created_at TIMESTAMPTZ DEFAULT NOW()      -- ✅ Record creation
);
```

**Key Fields for Analytics:**
- ✅ `total_amount` - Total revenue (booked)
- ✅ `paid_amount` - Collected revenue (requires migration)
- ✅ `reservation_at` - Booking date (for time-series)
- ✅ `status` - Filter by confirmed/completed
- ✅ `currency` - Multi-currency support
- ✅ `source` - Channel attribution
- ✅ `org_id` - Multi-tenant isolation

**Calculated Fields:**
- `remaining_amount = total_amount - paid_amount`
- `collection_rate = paid_amount / total_amount`

---

### **2. Transactions Table** (Payment Tracking)

**Schema:**
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,                    -- ✅ Multi-tenant isolation
    amount NUMERIC(12, 2) NOT NULL,          -- ✅ Transaction amount
    type TEXT NOT NULL,                       -- ✅ payment, refund
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,        -- ✅ Transaction date
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Fields for Analytics:**
- ✅ `amount` - Transaction amount
- ✅ `type` - Payment vs refund
- ✅ `occurred_at` - Transaction date
- ✅ `org_id` - Multi-tenant isolation

**Note:** Currently missing `reservation_id` foreign key. Consider adding for better tracking.

---

### **3. Packages Table** (Pricing Reference)

**Schema (with migration):**
```sql
CREATE TABLE packages (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,      -- ✅ Base pricing
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,          -- ✅ Active packages (after migration)
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Fields for Analytics:**
- ✅ `base_price` - Package pricing
- ✅ `is_active` - Active vs inactive
- ℹ️ Used for pricing trends, not direct revenue

---

## 🔒 Safe Aggregations per org_id

### **Multi-Tenant Isolation**

All tables have `org_id` column with:
- ✅ Foreign key to `organizations(id)`
- ✅ RLS policies enforcing `org_id = get_my_org_id()`
- ✅ Indexes on `(org_id, created_at)` for performance

**Safe Aggregation Pattern:**
```sql
SELECT 
    -- aggregations --
FROM table_name
WHERE org_id = :org_id  -- ✅ ALWAYS filter by org_id
    AND created_at >= :start_date
    AND created_at < :end_date
GROUP BY ...
```

**Security Guarantees:**
- ✅ RLS policies prevent cross-org data access
- ✅ Backend middleware injects `org_id` from JWT
- ✅ All queries MUST filter by `org_id`

---

## 📈 MVP Analytics Metrics

### **Metric 1: Total Revenue (Booked vs Collected)**

**Description:**
- Shows total revenue booked vs actually collected
- Helps track payment collection efficiency
- Time-series view (daily, weekly, monthly)

**SQL Query:**
```sql
-- Total Revenue: Booked vs Collected
SELECT 
    DATE_TRUNC('day', reservation_at) AS date,
    COUNT(*) AS total_reservations,
    SUM(total_amount) AS revenue_booked,
    SUM(paid_amount) AS revenue_collected,
    SUM(total_amount - paid_amount) AS revenue_outstanding,
    ROUND(
        CASE 
            WHEN SUM(total_amount) > 0 
            THEN (SUM(paid_amount) / SUM(total_amount)) * 100 
            ELSE 0 
        END, 
        2
    ) AS collection_rate_percent
FROM reservations
WHERE org_id = :org_id
    AND reservation_at >= :start_date
    AND reservation_at < :end_date
    AND status IN ('confirmed', 'completed')  -- Only confirmed bookings
GROUP BY DATE_TRUNC('day', reservation_at)
ORDER BY date DESC;
```

**Expected Output:**
```
date       | total_reservations | revenue_booked | revenue_collected | revenue_outstanding | collection_rate_percent
-----------|--------------------|----------------|-------------------|---------------------|------------------------
2026-01-11 | 15                 | 15000.00       | 12000.00          | 3000.00             | 80.00
2026-01-10 | 12                 | 12000.00       | 10000.00          | 2000.00             | 83.33
2026-01-09 | 18                 | 18000.00       | 15000.00          | 3000.00             | 83.33
```

**Use Cases:**
- Track daily revenue trends
- Monitor payment collection
- Identify outstanding payments

---

### **Metric 2: Revenue by Source (Channel Attribution)**

**Description:**
- Shows which channels generate most revenue
- Helps optimize marketing/sales efforts
- Compares web, phone, agent, walk-in, other

**SQL Query:**
```sql
-- Revenue by Source (Channel Attribution)
SELECT 
    COALESCE(source, 'unknown') AS channel,
    COUNT(*) AS total_reservations,
    SUM(total_amount) AS revenue_booked,
    SUM(paid_amount) AS revenue_collected,
    ROUND(AVG(total_amount), 2) AS avg_booking_value,
    ROUND(
        CASE 
            WHEN SUM(total_amount) > 0 
            THEN (SUM(paid_amount) / SUM(total_amount)) * 100 
            ELSE 0 
        END, 
        2
    ) AS collection_rate_percent
FROM reservations
WHERE org_id = :org_id
    AND reservation_at >= :start_date
    AND reservation_at < :end_date
    AND status IN ('confirmed', 'completed')
GROUP BY source
ORDER BY revenue_booked DESC;
```

**Expected Output:**
```
channel  | total_reservations | revenue_booked | revenue_collected | avg_booking_value | collection_rate_percent
---------|--------------------|-----------------|--------------------|-------------------|------------------------
web      | 45                 | 45000.00        | 38000.00           | 1000.00           | 84.44
phone    | 30                 | 30000.00        | 25000.00           | 1000.00           | 83.33
agent    | 20                 | 22000.00        | 18000.00           | 1100.00           | 81.82
walk-in  | 10                 | 8000.00         | 7000.00            | 800.00            | 87.50
unknown  | 5                  | 5000.00         | 4000.00            | 1000.00           | 80.00
```

**Use Cases:**
- Identify most profitable channels
- Optimize marketing spend
- Track channel performance

---

### **Metric 3: Revenue by Status (Conversion Funnel)**

**Description:**
- Shows revenue at each stage of booking lifecycle
- Helps identify conversion bottlenecks
- Tracks cancellation impact

**SQL Query:**
```sql
-- Revenue by Status (Conversion Funnel)
SELECT 
    status,
    COUNT(*) AS total_reservations,
    SUM(total_amount) AS revenue_potential,
    SUM(paid_amount) AS revenue_collected,
    ROUND(AVG(total_amount), 2) AS avg_booking_value,
    ROUND(AVG(party_size), 2) AS avg_party_size,
    ROUND(
        (COUNT(*) * 100.0) / SUM(COUNT(*)) OVER (), 
        2
    ) AS percent_of_total
FROM reservations
WHERE org_id = :org_id
    AND reservation_at >= :start_date
    AND reservation_at < :end_date
GROUP BY status
ORDER BY 
    CASE status
        WHEN 'completed' THEN 1
        WHEN 'confirmed' THEN 2
        WHEN 'pending' THEN 3
        WHEN 'cancelled' THEN 4
        ELSE 5
    END;
```

**Expected Output:**
```
status    | total_reservations | revenue_potential | revenue_collected | avg_booking_value | avg_party_size | percent_of_total
----------|--------------------|--------------------|-------------------|-------------------|----------------|------------------
completed | 50                 | 50000.00           | 50000.00          | 1000.00           | 2.50           | 41.67
confirmed | 40                 | 42000.00           | 30000.00          | 1050.00           | 2.30           | 33.33
pending   | 20                 | 18000.00           | 5000.00           | 900.00            | 2.10           | 16.67
cancelled | 10                 | 10000.00           | 2000.00           | 1000.00           | 2.00           | 8.33
```

**Use Cases:**
- Track conversion rates
- Identify drop-off points
- Monitor cancellation impact
- Forecast revenue

---

## 🔍 Additional Analytics Queries

### **Query 4: Monthly Revenue Trend**

```sql
-- Monthly Revenue Trend (Last 12 Months)
SELECT 
    TO_CHAR(reservation_at, 'YYYY-MM') AS month,
    COUNT(*) AS total_reservations,
    SUM(total_amount) AS revenue_booked,
    SUM(paid_amount) AS revenue_collected,
    SUM(total_amount - paid_amount) AS revenue_outstanding,
    ROUND(AVG(total_amount), 2) AS avg_booking_value
FROM reservations
WHERE org_id = :org_id
    AND reservation_at >= NOW() - INTERVAL '12 months'
    AND status IN ('confirmed', 'completed')
GROUP BY TO_CHAR(reservation_at, 'YYYY-MM')
ORDER BY month DESC;
```

---

### **Query 5: Top Customers by Revenue**

```sql
-- Top 10 Customers by Revenue
SELECT 
    customer_name,
    customer_phone,
    COUNT(*) AS total_bookings,
    SUM(total_amount) AS lifetime_revenue,
    SUM(paid_amount) AS total_paid,
    ROUND(AVG(total_amount), 2) AS avg_booking_value,
    MAX(reservation_at) AS last_booking_date
FROM reservations
WHERE org_id = :org_id
    AND status IN ('confirmed', 'completed')
GROUP BY customer_name, customer_phone
ORDER BY lifetime_revenue DESC
LIMIT 10;
```

---

### **Query 6: Package Performance**

```sql
-- Package Performance (via Departures and Reservations)
SELECT 
    p.name AS package_name,
    p.destination,
    p.base_price,
    COUNT(DISTINCT d.id) AS total_departures,
    COUNT(r.id) AS total_reservations,
    SUM(r.total_amount) AS total_revenue,
    SUM(r.paid_amount) AS collected_revenue,
    ROUND(AVG(r.total_amount), 2) AS avg_booking_value
FROM packages p
LEFT JOIN departures d ON d.package_id = p.id AND d.org_id = :org_id
LEFT JOIN reservations r ON r.departure_id = d.id AND r.org_id = :org_id
    AND r.status IN ('confirmed', 'completed')
    AND r.reservation_at >= :start_date
    AND r.reservation_at < :end_date
WHERE p.org_id = :org_id
    AND p.is_active = TRUE
GROUP BY p.id, p.name, p.destination, p.base_price
ORDER BY total_revenue DESC;
```

---

## ⚠️ Important Considerations

### **1. Migration Required**

**Critical:** The `paid_amount` column is added in `002_crud_fixes.sql`

```sql
-- Must run this migration first
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;
```

**Without migration:**
- ❌ `paid_amount` queries will fail
- ❌ Revenue collected metrics unavailable
- ✅ `total_amount` queries will still work

---

### **2. Currency Handling**

**Current State:**
- Each reservation has a `currency` field (USD, BAM, EUR, etc.)
- Queries return raw amounts without conversion

**Recommendations:**
- Convert all amounts to base currency (e.g., BAM) for aggregation
- Store exchange rates in a separate table
- Or: Group by currency and show separate totals

**Example with Currency Grouping:**
```sql
SELECT 
    currency,
    SUM(total_amount) AS revenue_booked,
    SUM(paid_amount) AS revenue_collected
FROM reservations
WHERE org_id = :org_id
    AND status IN ('confirmed', 'completed')
GROUP BY currency;
```

---

### **3. Time Zone Handling**

**Current State:**
- All timestamps are `TIMESTAMPTZ` (timezone-aware)
- Stored in UTC

**Recommendations:**
- Convert to organization's timezone for display
- Use `AT TIME ZONE 'Europe/Sarajevo'` or similar

**Example:**
```sql
SELECT 
    DATE_TRUNC('day', reservation_at AT TIME ZONE 'Europe/Sarajevo') AS date,
    SUM(total_amount) AS revenue
FROM reservations
WHERE org_id = :org_id
GROUP BY date;
```

---

### **4. Performance Optimization**

**Existing Indexes:**
```sql
-- Already created in 001_init.sql
CREATE INDEX idx_reservations_org_id_reservation_at ON reservations(org_id, reservation_at);
CREATE INDEX idx_transactions_org_id_occurred_at ON transactions(org_id, occurred_at);
```

**Additional Recommended Indexes:**
```sql
-- For status filtering
CREATE INDEX idx_reservations_org_status_date 
    ON reservations(org_id, status, reservation_at);

-- For source analytics
CREATE INDEX idx_reservations_org_source_date 
    ON reservations(org_id, source, reservation_at);

-- For paid_amount queries (already in migration)
CREATE INDEX idx_reservations_paid_amount 
    ON reservations(org_id, paid_amount);
```

---

## ✅ Analytics Readiness Summary

### **Ready for Analytics:**
- ✅ **Revenue tracking:** `total_amount`, `paid_amount` (after migration)
- ✅ **Time-series:** `reservation_at`, `created_at`, `occurred_at`
- ✅ **Multi-tenant:** All queries safely isolated by `org_id`
- ✅ **Status tracking:** `status` field for conversion funnel
- ✅ **Channel attribution:** `source` field for marketing analytics
- ✅ **Indexes:** Optimized for date-range queries

### **Requires Migration:**
- ⚠️ `paid_amount` column (run `002_crud_fixes.sql`)
- ⚠️ `is_active` column for packages (run `002_crud_fixes.sql`)
- ⚠️ `status = 'completed'` constraint (run `002_crud_fixes.sql`)

### **Optional Enhancements:**
- ℹ️ Add `reservation_id` to `transactions` table
- ℹ️ Add exchange rates table for multi-currency
- ℹ️ Add materialized views for faster aggregations
- ℹ️ Add `payment_method` to transactions

---

## 🎯 MVP Implementation Plan

### **Step 1: Run Migration**
```bash
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

### **Step 2: Create Analytics Endpoint**
```typescript
// src/routes/analytics.ts
router.get('/analytics/revenue', authenticateToken, requireOrgContext, async (req, res) => {
  const { start_date, end_date } = req.query;
  const orgId = req.orgId;
  
  // Execute Metric 1 query
  const { data, error } = await supabaseAdmin
    .rpc('get_revenue_summary', { 
      org_id: orgId, 
      start_date, 
      end_date 
    });
  
  res.json(data);
});
```

### **Step 3: Test Queries**
```bash
# Test in psql
psql -h <host> -U <user> -d <database>

# Run sample queries with your org_id
SELECT ... FROM reservations WHERE org_id = '<your-org-id>' ...
```

### **Step 4: Verify Multi-Tenancy**
```sql
-- Ensure no cross-org data leakage
SELECT DISTINCT org_id FROM reservations;
-- Should only show YOUR org_id when using RLS
```

---

## 📚 Safe SQL Aggregation Examples

### **Example 1: Daily Revenue**
```sql
SELECT 
    DATE_TRUNC('day', reservation_at) AS date,
    SUM(total_amount) AS revenue
FROM reservations
WHERE org_id = :org_id  -- ✅ REQUIRED
    AND reservation_at >= :start_date
    AND reservation_at < :end_date
    AND status IN ('confirmed', 'completed')
GROUP BY date
ORDER BY date DESC;
```

### **Example 2: Revenue by Month**
```sql
SELECT 
    TO_CHAR(reservation_at, 'YYYY-MM') AS month,
    SUM(total_amount) AS revenue
FROM reservations
WHERE org_id = :org_id  -- ✅ REQUIRED
    AND reservation_at >= NOW() - INTERVAL '12 months'
    AND status IN ('confirmed', 'completed')
GROUP BY month
ORDER BY month DESC;
```

### **Example 3: Collection Rate**
```sql
SELECT 
    ROUND(
        (SUM(paid_amount) / NULLIF(SUM(total_amount), 0)) * 100, 
        2
    ) AS collection_rate_percent
FROM reservations
WHERE org_id = :org_id  -- ✅ REQUIRED
    AND status IN ('confirmed', 'completed');
```

---

**Status:** ✅ **READY FOR ANALYTICS** - Schema supports comprehensive revenue analytics with proper multi-tenant isolation!
