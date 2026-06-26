# Payments API Implementation Summary

**Date**: 2026-01-14  
**Status**: ✅ Complete

## Overview

The Payments API endpoints have been successfully implemented and integrated into the NMT Analytics API. The implementation follows all security best practices, multi-tenant isolation, and standardized error handling.

---

## Endpoints

### 1. GET /api/payments

**Purpose**: Retrieve paginated list of payments for the organization

**Query Parameters**:
- `reservation_id` (optional): Filter by reservation UUID
- `from` (optional): Start date in YYYY-MM-DD format
- `to` (optional): End date in YYYY-MM-DD format
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 200)

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "reservationId": "uuid",
      "amount": 500.00,
      "currency": "BAM",
      "status": "succeeded",
      "paymentDate": "2026-01-12",
      "createdAt": "2026-01-12T10:30:00Z",
      "reservation": {
        "id": "uuid",
        "customerName": "John Doe",
        "customerPhone": "+387...",
        "totalAmount": 1000.00,
        "paidAmount": 500.00,
        "status": "confirmed"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

**Features**:
- ✅ Multi-tenant isolation via `org_id`
- ✅ Date filtering on `payment_date` column
- ✅ Reservation filtering
- ✅ Sorted by `payment_date DESC, created_at DESC`
- ✅ Max 200 rows enforced
- ✅ Includes nested reservation details

---

### 2. POST /api/payments

**Purpose**: Create a new payment record

**Request Body**:
```json
{
  "reservation_id": "uuid",
  "amount": 500.00,
  "currency": "BAM",           // optional, default: "BAM"
  "status": "succeeded",       // optional, default: "succeeded"
  "payment_date": "2026-01-12" // optional, default: today (UTC)
}
```

**Response** (201 Created):
```json
{
  "payment": {
    "id": "uuid",
    "reservationId": "uuid",
    "amount": 500.00,
    "currency": "BAM",
    "status": "succeeded",
    "paymentDate": "2026-01-12",
    "createdAt": "2026-01-12T10:30:00Z"
  },
  "reservation": {
    "id": "uuid",
    "totalAmount": 1000.00,
    "paidAmount": 500.00,
    "remainingAmount": 500.00,
    "status": "confirmed"
  }
}
```

**Features**:
- ✅ Validates `reservation_id` as UUID
- ✅ Validates `amount > 0`
- ✅ Verifies reservation exists and belongs to org
- ✅ Defaults: `currency='BAM'`, `status='succeeded'`, `payment_date=today`
- ✅ Automatically updates `reservations.paid_amount` via database trigger
- ✅ Returns both created payment AND updated reservation (with new `paid_amount` and `remainingAmount`)
- ✅ Enables immediate UI updates without refetching the entire reservations list

---

## Security & Multi-Tenancy

### ✅ org_id Enforcement

All endpoints use the following middleware chain:
```typescript
authenticateToken → requireOrgContext
```

- **`authenticateToken`**: Validates JWT token from Supabase
- **`requireOrgContext`**: Ensures `req.orgId` is set from user's profile
- **Database queries**: Always filter by `org_id = req.orgId!`

**Result**: Users can ONLY access payments from their own organization.

### ✅ Validation

| Field | Validation |
|-------|------------|
| `reservation_id` | Must be valid UUID |
| `amount` | Must be > 0 (positive number) |
| `currency` | String (default: 'BAM') |
| `status` | Enum: 'pending', 'succeeded', 'failed', 'refunded', 'cancelled' |
| `payment_date` | YYYY-MM-DD format or null |
| `from`, `to` | YYYY-MM-DD format |

---

## Database Schema

### Table: `public.payments`

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'BAM',
    status TEXT NOT NULL DEFAULT 'succeeded' 
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
CREATE INDEX idx_payments_org_id ON payments(org_id);
CREATE INDEX idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_payments_org_date ON payments(org_id, payment_date);
CREATE INDEX idx_payments_status ON payments(status) WHERE status != 'succeeded';
```

### Automatic `paid_amount` Update

A database trigger automatically updates `reservations.paid_amount` when payments are inserted, updated, or deleted:

```sql
CREATE TRIGGER trg_update_reservation_paid_amount
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_reservation_paid_amount();
```

**Function logic**:
```sql
UPDATE reservations
SET paid_amount = COALESCE((
    SELECT SUM(amount)
    FROM payments
    WHERE reservation_id = <target_reservation_id>
      AND status = 'succeeded'
), 0)
WHERE id = <target_reservation_id>;
```

**Note**: Only payments with `status = 'succeeded'` are counted toward `paid_amount`.

---

## Error Handling

All errors follow the standardized format:

```json
{
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { /* optional additional context */ }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters or body |
| `RESERVATION_NOT_FOUND` | 404 | Reservation doesn't exist or doesn't belong to org |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Integration

### Route Registration

The payments route is registered in `/src/routes/index.ts`:

```typescript
import paymentsRoutes from './payments';

router.use('/', paymentsRoutes);
```

### File Location

**Route file**: `/src/routes/payments.ts`

---

## cURL Examples

### GET: Fetch all payments (last 50)

```bash
curl -X GET "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GET: Filter by reservation

```bash
curl -X GET "http://localhost:3000/api/payments?reservation_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GET: Filter by date range

```bash
curl -X GET "http://localhost:3000/api/payments?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GET: Pagination

```bash
curl -X GET "http://localhost:3000/api/payments?page=2&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### POST: Create payment with all fields

```bash
curl -X POST "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 500.00,
    "currency": "BAM",
    "status": "succeeded",
    "payment_date": "2026-01-12"
  }'
```

### POST: Create payment with defaults

```bash
curl -X POST "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 250.00
  }'
```

**Note**: This will use defaults:
- `currency`: "BAM"
- `status`: "succeeded"
- `payment_date`: today (UTC date)

---

## Testing Checklist

- [x] Build passes without TypeScript errors
- [x] Route is registered in main router
- [x] GET endpoint validates query parameters
- [x] GET endpoint filters by `org_id`
- [x] GET endpoint filters by `reservation_id` (optional)
- [x] GET endpoint filters by date range using `payment_date`
- [x] GET endpoint sorts by `payment_date DESC, created_at DESC`
- [x] GET endpoint enforces max 200 rows
- [x] POST endpoint validates request body
- [x] POST endpoint validates `reservation_id` as UUID
- [x] POST endpoint validates `amount > 0`
- [x] POST endpoint verifies reservation exists and belongs to org
- [x] POST endpoint uses defaults: `currency='BAM'`, `status='succeeded'`
- [x] POST endpoint sets `payment_date` to today if not provided
- [x] POST endpoint triggers automatic `paid_amount` update
- [x] All errors use standardized format: `{ message, code, details }`
- [x] Multi-tenant safety: `org_id` always applied from auth context

---

## Next Steps

### Frontend Integration

Update the Admin UI to:
1. Display payments list in the Reservations detail view
2. Add "Create Payment" button/modal
3. Show `paid_amount` and `remainingAmount` in reservation cards
4. Implement payment filtering by date range

### Additional Features (Future)

- [ ] Payment refunds (update status to 'refunded')
- [ ] Payment analytics dashboard
- [ ] Export payments to CSV/Excel
- [ ] Payment receipts/invoices generation
- [ ] Webhook notifications for payment events

---

## Summary

✅ **All requirements met**:
- GET and POST endpoints implemented
- Multi-tenant security enforced
- Validation in place for all inputs
- Standardized error responses
- Database trigger for automatic `paid_amount` updates
- Route registered in main router
- cURL examples provided
- Build successful

The Payments API is **production-ready** and follows all project conventions.
