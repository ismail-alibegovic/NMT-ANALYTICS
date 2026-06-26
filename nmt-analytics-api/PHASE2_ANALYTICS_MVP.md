# Phase 2: Analytics MVP - Implementation Guide

**Date**: 2026-01-15  
**Status**: ✅ Complete  
**Endpoints**: `/api/analytics/overview-v2`, `/api/analytics/by-package`

---

## 🎯 Overview

Phase 2 implements tenant-scoped analytics endpoints that provide comprehensive financial metrics for reservations and payments.

### Endpoints

1. **GET /api/analytics/overview-v2** - High-level analytics overview
2. **GET /api/analytics/by-package** - Analytics grouped by package

---

## 📊 Endpoint 1: Overview Analytics

### GET /api/analytics/overview-v2

**Purpose**: Returns comprehensive analytics overview for the organization

**Query Parameters**:
- `from` (optional): Start date (YYYY-MM-DD) - filters `reservations.created_at`
- `to` (optional): End date (YYYY-MM-DD) - filters `reservations.created_at`

**Response**:
```typescript
{
  // Reservation metrics
  reservations_count: number;
  total_amount_sum: number;
  total_paid_sum: number;
  total_balance_sum: number;
  
  // Payment status breakdown
  unpaid_count: number;
  partially_paid_count: number;
  paid_count: number;
  
  // Calculated metrics
  avg_reservation_value: number;
  
  // Payment metrics
  payments_count: number;
  payments_sum: number;
  
  // Date range
  date_from: string | null;
  date_to: string | null;
}
```

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/analytics/overview-v2?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response**:
```json
{
  "reservations_count": 150,
  "total_amount_sum": 480000.00,
  "total_paid_sum": 320000.00,
  "total_balance_sum": 160000.00,
  "unpaid_count": 25,
  "partially_paid_count": 75,
  "paid_count": 50,
  "avg_reservation_value": 3200.00,
  "payments_count": 225,
  "payments_sum": 320000.00,
  "date_from": "2026-01-01",
  "date_to": "2026-01-31"
}
```

---

## 📦 Endpoint 2: Package Analytics

### GET /api/analytics/by-package

**Purpose**: Returns analytics grouped by package

**Query Parameters**:
- `from` (optional): Start date (YYYY-MM-DD) - filters `reservations.created_at`
- `to` (optional): End date (YYYY-MM-DD) - filters `reservations.created_at`

**Response**:
```typescript
[
  {
    package_id: string;
    package_name: string;
    reservations_count: number;
    total_amount_sum: number;
    total_paid_sum: number;
    total_balance_sum: number;
  }
]
```

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/analytics/by-package?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Example Response**:
```json
[
  {
    "package_id": "uuid-1",
    "package_name": "Umra Premium",
    "reservations_count": 45,
    "total_amount_sum": 180000.00,
    "total_paid_sum": 120000.00,
    "total_balance_sum": 60000.00
  },
  {
    "package_id": "uuid-2",
    "package_name": "Umra Standard",
    "reservations_count": 65,
    "total_amount_sum": 195000.00,
    "total_paid_sum": 130000.00,
    "total_balance_sum": 65000.00
  },
  {
    "package_id": "uuid-3",
    "package_name": "Hadž",
    "reservations_count": 40,
    "total_amount_sum": 105000.00,
    "total_paid_sum": 70000.00,
    "total_balance_sum": 35000.00
  }
]
```

*Note: Results are sorted by `total_amount_sum` descending (highest revenue first)*

---

## 🔧 Implementation Details

### Date Filtering

**Reservation Metrics**:
- Uses `reservations.created_at` for filtering
- Inclusive of start date (`from`)
- Inclusive of end date (`to` + 23:59:59.999)

**Payment Metrics**:
- Uses `payments.payment_date` if available
- Falls back to `payments.created_at::date` if `payment_date` is NULL
- Filters in application code (not in SQL) due to COALESCE limitation

### Tenant Scoping

All queries are scoped to `org_id`:
```typescript
.eq('org_id', orgId)
```

This ensures:
- ✅ Multi-tenant data isolation
- ✅ Users only see their organization's data
- ✅ No cross-tenant data leakage

### Performance Considerations

**Single Aggregate Queries**:
- No N+1 queries
- Uses Supabase query builder for efficient filtering
- In-memory aggregation for package grouping (minimal overhead)

**Indexes** (recommended):
```sql
-- Reservation indexes
CREATE INDEX IF NOT EXISTS idx_reservations_created_at_org 
  ON reservations(created_at, org_id);

CREATE INDEX IF NOT EXISTS idx_reservations_org_package 
  ON reservations(org_id, package_id);

-- Payment indexes
CREATE INDEX IF NOT EXISTS idx_payments_date_org 
  ON payments(payment_date, org_id);

CREATE INDEX IF NOT EXISTS idx_payments_reservation 
  ON payments(reservation_id);
```

---

## 🧪 Testing

### Test Scenario 1: Overview Analytics

**Setup**:
```sql
-- Create test reservations
INSERT INTO reservations (org_id, customer_name, total_amount, paid_amount, balance_due, payment_status, created_at)
VALUES 
  ('org-1', 'Customer 1', 3200, 0, 3200, 'unpaid', '2026-01-15'),
  ('org-1', 'Customer 2', 3200, 1000, 2200, 'partially_paid', '2026-01-15'),
  ('org-1', 'Customer 3', 3200, 3200, 0, 'paid', '2026-01-15');

-- Create test payments
INSERT INTO payments (org_id, reservation_id, amount, status, payment_date)
VALUES 
  ('org-1', 'res-2-id', 1000, 'succeeded', '2026-01-15'),
  ('org-1', 'res-3-id', 3200, 'succeeded', '2026-01-15');
```

**Request**:
```bash
curl -X GET "http://localhost:3001/api/analytics/overview-v2?from=2026-01-15&to=2026-01-15" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response**:
```json
{
  "reservations_count": 3,
  "total_amount_sum": 9600.00,
  "total_paid_sum": 4200.00,
  "total_balance_sum": 5400.00,
  "unpaid_count": 1,
  "partially_paid_count": 1,
  "paid_count": 1,
  "avg_reservation_value": 3200.00,
  "payments_count": 2,
  "payments_sum": 4200.00,
  "date_from": "2026-01-15",
  "date_to": "2026-01-15"
}
```

### Test Scenario 2: Package Analytics

**Setup**:
```sql
-- Create reservations with package info
INSERT INTO reservations (org_id, package_id, package_name, total_amount, paid_amount, balance_due, created_at)
VALUES 
  ('org-1', 'pkg-1', 'Umra Premium', 5000, 2000, 3000, '2026-01-15'),
  ('org-1', 'pkg-1', 'Umra Premium', 5000, 5000, 0, '2026-01-15'),
  ('org-1', 'pkg-2', 'Hadž', 8000, 0, 8000, '2026-01-15');
```

**Request**:
```bash
curl -X GET "http://localhost:3001/api/analytics/by-package?from=2026-01-15&to=2026-01-15" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response**:
```json
[
  {
    "package_id": "pkg-1",
    "package_name": "Umra Premium",
    "reservations_count": 2,
    "total_amount_sum": 10000.00,
    "total_paid_sum": 7000.00,
    "total_balance_sum": 3000.00
  },
  {
    "package_id": "pkg-2",
    "package_name": "Hadž",
    "reservations_count": 1,
    "total_amount_sum": 8000.00,
    "total_paid_sum": 0.00,
    "total_balance_sum": 8000.00
  }
]
```

---

## 🔒 Security

**Authentication**: Required (`authenticateToken` middleware)
**Authorization**: Organization-scoped (`requireOrgContext` middleware)
**Validation**: Zod schema validation for query parameters

**Error Responses**:
```json
// 400 - Invalid query parameters
{
  "message": "Invalid query parameters",
  "code": "VALIDATION_ERROR",
  "details": [...]
}

// 403 - Missing organization context
{
  "message": "Organization context required",
  "code": "ORG_REQUIRED"
}

// 500 - Internal error
{
  "message": "Failed to fetch analytics",
  "code": "INTERNAL_ERROR",
  "details": "..."
}
```

---

## 📈 Use Cases

### Dashboard KPIs
```typescript
// Fetch overview for current month
const response = await fetch('/api/analytics/overview-v2?from=2026-01-01&to=2026-01-31');
const data = await response.json();

// Display KPIs
console.log(`Total Revenue: ${data.total_amount_sum} BAM`);
console.log(`Collection Rate: ${(data.total_paid_sum / data.total_amount_sum * 100).toFixed(2)}%`);
console.log(`Average Booking: ${data.avg_reservation_value} BAM`);
```

### Package Performance Report
```typescript
// Fetch package analytics for Q1
const response = await fetch('/api/analytics/by-package?from=2026-01-01&to=2026-03-31');
const packages = await response.json();

// Find top performer
const topPackage = packages[0]; // Already sorted by revenue
console.log(`Top Package: ${topPackage.package_name}`);
console.log(`Revenue: ${topPackage.total_amount_sum} BAM`);
console.log(`Bookings: ${topPackage.reservations_count}`);
```

### Financial Health Check
```typescript
// Fetch overview for last 30 days
const to = new Date().toISOString().split('T')[0];
const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const response = await fetch(`/api/analytics/overview-v2?from=${from}&to=${to}`);
const data = await response.json();

// Calculate metrics
const collectionRate = (data.total_paid_sum / data.total_amount_sum * 100).toFixed(2);
const outstandingAmount = data.total_balance_sum;
const unpaidPercentage = (data.unpaid_count / data.reservations_count * 100).toFixed(2);

console.log(`Collection Rate: ${collectionRate}%`);
console.log(`Outstanding: ${outstandingAmount} BAM`);
console.log(`Unpaid Reservations: ${unpaidPercentage}%`);
```

---

## 🎯 Success Criteria

- [ ] Both endpoints return correct data
- [ ] Date filtering works correctly
- [ ] Tenant scoping prevents cross-org data access
- [ ] Performance is acceptable (< 1s response time)
- [ ] Error handling is robust
- [ ] TypeScript types are correct
- [ ] Documentation is complete

---

## 📁 Files Modified

**Backend**:
- ✅ `src/routes/analytics.ts` - **MODIFIED** (added Phase 2 endpoints)

**Documentation**:
- ✅ This file - Complete implementation guide

---

## 🚀 Deployment

**Status**: ✅ Ready for testing

**Backend**: Running on http://localhost:3001 (auto-restarted with changes)

**Next Steps**:
1. Test endpoints with curl/Postman
2. Verify tenant scoping
3. Check performance with real data
4. Add indexes if needed
5. Integrate with frontend

---

## 💡 Future Enhancements

### Possible Improvements
1. **Caching**: Add Redis caching for frequently accessed metrics
2. **Real-time**: WebSocket updates for live analytics
3. **Exports**: CSV/Excel export functionality
4. **Comparisons**: Period-over-period comparisons
5. **Forecasting**: Predictive analytics based on trends
6. **Drill-down**: Detailed breakdowns by customer, date, etc.

---

## ✅ Summary

**Endpoints**: 2 new analytics endpoints  
**DTOs**: Fully typed with TypeScript interfaces  
**Validation**: Zod schema validation  
**Tenant Scoping**: Organization-level isolation  
**Performance**: Single aggregate queries (no N+1)  
**Documentation**: Complete with examples  

**Status**: ✅ **COMPLETE** - Ready for testing! 🚀

---

**End of Guide**
