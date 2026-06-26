# Payments API Documentation

## Overview

The Payments API provides endpoints to manage payment records for reservations in the NMT Analytics system. All endpoints are multi-tenant safe and require authentication.

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [GET /api/payments](#get-apipayments)
  - [POST /api/payments](#post-apipayments)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Examples](#examples)

---

## Authentication

All endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

The `org_id` is automatically derived from the authenticated user's context. You **cannot** specify `org_id` in the request body or query parameters.

---

## Endpoints

### GET /api/payments

Retrieve a paginated list of payments for your organization.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `reservation_id` | UUID | No | - | Filter payments by reservation ID |
| `from` | Date (YYYY-MM-DD) | No | - | Start date for filtering (inclusive) |
| `to` | Date (YYYY-MM-DD) | No | - | End date for filtering (inclusive) |
| `page` | Integer | No | 1 | Page number (1-indexed) |
| `limit` | Integer | No | 50 | Items per page (max: 200) |

#### Response

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
        "customerPhone": "+387123456789",
        "totalAmount": 1000.00,
        "paidAmount": 500.00,
        "status": "confirmed"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "totalPages": 3
  }
}
```

#### Sorting

Results are sorted by:
1. `payment_date` (descending, nulls last)
2. `created_at` (descending)

#### Example Requests

```bash
# Get all payments (default: page 1, limit 50)
curl -X GET "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get payments for specific reservation
curl -X GET "http://localhost:3000/api/payments?reservation_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get payments within date range
curl -X GET "http://localhost:3000/api/payments?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get payments with custom pagination
curl -X GET "http://localhost:3000/api/payments?page=2&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Combine filters
curl -X GET "http://localhost:3000/api/payments?reservation_id=123e4567-e89b-12d3-a456-426614174000&from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### POST /api/payments

Create a new payment record for a reservation.

#### Request Body

```typescript
{
  reservation_id: string;      // Required: UUID of the reservation
  amount: number;              // Required: Payment amount (must be > 0)
  currency?: string;           // Optional: Currency code (default: 'BAM')
  status?: string;             // Optional: Payment status (default: 'succeeded')
  payment_date?: string;       // Optional: Payment date YYYY-MM-DD (default: today UTC)
}
```

#### Status Values

- `pending` - Payment is pending
- `succeeded` - Payment completed successfully
- `failed` - Payment failed
- `refunded` - Payment was refunded
- `cancelled` - Payment was cancelled

#### Response

```json
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
    "totalAmount": 1000.00,
    "paidAmount": 500.00,
    "remainingAmount": 500.00,
    "status": "confirmed"
  }
}
```

#### Automatic Updates

When a payment is created, the system automatically:
1. Inserts the payment record
2. Triggers an update to `reservations.paid_amount` (sum of all succeeded payments)
3. Returns the updated reservation data

#### Validation Rules

- `reservation_id` must be a valid UUID
- Reservation must exist and belong to your organization
- `amount` must be greater than 0
- `currency` must be a valid currency code (default: BAM)
- `status` must be one of: pending, succeeded, failed, refunded, cancelled
- `payment_date` must be in YYYY-MM-DD format (if provided)

#### Example Requests

```bash
# Create payment with all fields
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

# Create payment with minimal fields (uses defaults)
curl -X POST "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 250.00
  }'

# Create pending payment
curl -X POST "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 100.00,
    "status": "pending"
  }'
```

---

## Data Models

### Payment

```typescript
interface Payment {
  id: string;                    // UUID
  reservationId: string;         // UUID
  amount: number;                // Decimal (12,2)
  currency: string;              // Currency code
  status: PaymentStatus;         // Payment status enum
  paymentDate: string | null;    // Date (YYYY-MM-DD)
  createdAt: string;             // ISO 8601 timestamp
  reservation?: Reservation;     // Nested reservation data (GET only)
}

type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
```

### Reservation (nested in response)

```typescript
interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount?: number;      // Only in POST response
  status: string;
}
```

---

## Error Handling

All errors return a consistent JSON format:

```json
{
  "error": "ERROR_CODE",
  "details": "Human-readable error message or validation details"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success (GET) |
| 201 | Created (POST) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (no organization context) |
| 404 | Not Found (reservation not found) |
| 500 | Internal Server Error |

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `RESERVATION_NOT_FOUND` | Reservation does not exist or doesn't belong to your org |
| `INTERNAL_ERROR` | Server error occurred |

### Example Error Responses

#### Validation Error (400)

```json
{
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["amount"],
      "message": "Expected number, received string"
    }
  ]
}
```

#### Reservation Not Found (404)

```json
{
  "error": "RESERVATION_NOT_FOUND",
  "details": "Reservation not found or does not belong to your organization"
}
```

#### Unauthorized (401)

```json
{
  "error": "UNAUTHORIZED",
  "details": "Invalid or missing authentication token"
}
```

---

## Multi-Tenant Safety

All endpoints automatically filter data by `org_id`:

- **GET**: Only returns payments belonging to your organization
- **POST**: Automatically sets `org_id` from authenticated user context
- **Validation**: Verifies reservation belongs to your organization before creating payment

You **cannot** access or create payments for other organizations.

---

## Database Schema

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

- `idx_payments_org_id` - Organization filtering
- `idx_payments_reservation_id` - Reservation lookups
- `idx_payments_payment_date` - Date range queries
- `idx_payments_org_date` - Combined org + date queries
- `idx_payments_status` - Status filtering (partial index)

### Triggers

- `trg_update_reservation_paid_amount` - Auto-updates `reservations.paid_amount` when payment is inserted/updated/deleted
- `trg_payments_updated_at` - Auto-updates `updated_at` timestamp

---

## Business Logic

### Payment Flow

1. User creates a payment via POST /api/payments
2. System validates input and checks reservation exists
3. Payment record is inserted into `payments` table
4. Database trigger automatically calculates and updates `reservations.paid_amount`:
   ```sql
   paid_amount = SUM(payments.amount WHERE status = 'succeeded')
   ```
5. API returns created payment with updated reservation data

### Remaining Amount Calculation

```typescript
remainingAmount = Math.max(totalAmount - paidAmount, 0)
```

This ensures `remainingAmount` is never negative.

---

## Testing

### Manual Testing

Use the provided test script:

```bash
# Set environment variables
export API_URL=http://localhost:3000/api
export AUTH_TOKEN=your_jwt_token

# Run tests
node scripts/test-payments-api.js
```

### Test Scenarios

The test script covers:
- ✅ Get all payments (default pagination)
- ✅ Get payments with custom pagination
- ✅ Get payments for specific reservation
- ✅ Get payments within date range
- ✅ Create payment with all fields
- ✅ Create payment with defaults
- ✅ Validation errors (missing fields, invalid types, etc.)

---

## Best Practices

### Creating Payments

1. **Always validate reservation exists** before creating payment
2. **Use `succeeded` status** for completed payments
3. **Use `pending` status** for payments awaiting confirmation
4. **Set `payment_date`** to the actual date payment was received (business date)
5. **Don't manually update `reservations.paid_amount`** - the trigger handles this

### Querying Payments

1. **Use `reservation_id` filter** for reservation-specific views
2. **Use date range filters** for reporting
3. **Use pagination** for large result sets
4. **Sort by `payment_date`** for chronological order

### Error Handling

1. **Check response status** before processing data
2. **Handle validation errors** gracefully in UI
3. **Display user-friendly messages** for errors
4. **Log errors** for debugging

---

## Migration

To set up the payments table, run:

```bash
# Apply migration
psql -f supabase/sql/014_create_payments_table.sql
```

This creates:
- `payments` table
- Indexes for performance
- RLS policies for security
- Triggers for auto-updating `reservations.paid_amount`

---

## Support

For issues or questions:
- Check error response for details
- Review validation rules
- Ensure reservation exists and belongs to your org
- Verify authentication token is valid
- Check database logs for trigger errors

---

**Last Updated**: 2026-01-12  
**API Version**: 1.0
