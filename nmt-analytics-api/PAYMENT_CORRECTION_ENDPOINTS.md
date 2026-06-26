# Payment Correction Endpoints Implementation

**Date**: 2026-01-14  
**Repository**: nmt-analytics-api  
**Status**: ✅ Complete

---

## Overview

Added two new endpoints to safely correct payment mistakes:
1. **PATCH /api/payments/:id** - Update payment details
2. **POST /api/payments/:id/void** - Cancel/void a payment

Both endpoints are multi-tenant safe and automatically update affected reservations' `paid_amount` via database triggers.

---

## Endpoints

### 1. PATCH /api/payments/:id

**Purpose**: Update payment details to correct mistakes

**Authentication**: Required (Bearer token)

**Authorization**: Payment must belong to user's organization

**Allowed Fields**:
- `reservation_id` (UUID, optional) - Move payment to different reservation
- `amount` (number >= 0, optional) - Correct payment amount
- `currency` (string, optional) - Update currency
- `status` (enum, optional) - Change status (pending, succeeded, failed, refunded, cancelled)
- `payment_date` (YYYY-MM-DD, optional) - Update payment date

**Request**:
```http
PATCH /api/payments/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 300.00,
  "status": "succeeded"
}
```

**Response (200 OK)**:
```json
{
  "payment": {
    "id": "abc123-uuid",
    "reservationId": "uuid",
    "amount": 300.00,
    "currency": "BAM",
    "status": "succeeded",
    "paymentDate": "2026-01-14",
    "createdAt": "2026-01-14T13:30:00Z",
    "updatedAt": "2026-01-14T15:00:00Z"
  },
  "affectedReservations": [
    {
      "id": "reservation-uuid",
      "totalAmount": 1000.00,
      "paidAmount": 300.00,
      "remainingAmount": 700.00,
      "status": "confirmed"
    }
  ]
}
```

**Features**:
- ✅ Validates all fields (UUIDs, amount >= 0, date format)
- ✅ Enforces org_id from auth context
- ✅ Verifies payment exists and belongs to org
- ✅ If moving to new reservation, verifies target reservation exists
- ✅ Returns both old and new reservations if reservation_id changed
- ✅ Database trigger automatically updates paid_amount

**Error Responses**:
- `400` - Invalid ID format, validation failed
- `403` - Organization context required
- `404` - Payment not found, target reservation not found
- `500` - Internal error

---

### 2. POST /api/payments/:id/void

**Purpose**: Cancel/void a payment (sets status to 'cancelled')

**Authentication**: Required (Bearer token)

**Authorization**: Payment must belong to user's organization

**Request**:
```http
POST /api/payments/:id/void
Authorization: Bearer YOUR_TOKEN
```

**Response (200 OK)**:
```json
{
  "payment": {
    "id": "abc123-uuid",
    "reservationId": "uuid",
    "amount": 250.00,
    "currency": "BAM",
    "status": "cancelled",
    "paymentDate": "2026-01-14",
    "createdAt": "2026-01-14T13:30:00Z",
    "updatedAt": "2026-01-14T15:10:00Z"
  },
  "reservation": {
    "id": "uuid",
    "totalAmount": 1000.00,
    "paidAmount": 0.00,
    "remainingAmount": 1000.00,
    "status": "confirmed"
  }
}
```

**Features**:
- ✅ Sets payment status to 'cancelled'
- ✅ Enforces org_id from auth context
- ✅ Verifies payment exists and belongs to org
- ✅ Prevents double-cancellation
- ✅ Returns updated reservation with recalculated paid_amount
- ✅ Database trigger automatically updates paid_amount

**Error Responses**:
- `400` - Invalid ID format, already cancelled
- `403` - Organization context required
- `404` - Payment not found
- `500` - Internal error

---

## Multi-Tenant Safety

Both endpoints enforce strict multi-tenant isolation:

### PATCH Endpoint
```typescript
// 1. Verify payment belongs to org
.eq('id', paymentId)
.eq('org_id', orgId)

// 2. If moving payment, verify target reservation belongs to org
.eq('id', updateData.reservation_id)
.eq('org_id', orgId)

// 3. Update only within org
.eq('id', paymentId)
.eq('org_id', orgId)

// 4. Fetch reservations only from org
.in('id', affectedReservationIds)
.eq('org_id', orgId)
```

### Void Endpoint
```typescript
// 1. Verify payment belongs to org
.eq('id', paymentId)
.eq('org_id', orgId)

// 2. Update only within org
.eq('id', paymentId)
.eq('org_id', orgId)

// 3. Fetch reservation only from org
.eq('id', existingPayment.reservation_id)
.eq('org_id', orgId)
```

**Result**: Users can only modify payments within their own organization.

---

## Database Trigger Behavior

The `trg_update_reservation_paid_amount` trigger automatically handles:

### On Payment Update
1. **Amount changed**: Recalculates `paid_amount` for the reservation
2. **Status changed**: Only counts 'succeeded' payments
3. **Reservation changed**: Updates both old and new reservations

### On Payment Void
1. **Status → 'cancelled'**: Removes payment from `paid_amount` calculation
2. **Reservation updated**: `paid_amount` decreases automatically

**Trigger Logic**:
```sql
-- Recalculate paid_amount for affected reservations
UPDATE reservations
SET paid_amount = (
  SELECT COALESCE(SUM(amount), 0)
  FROM payments
  WHERE reservation_id = reservations.id
    AND status = 'succeeded'
)
WHERE id IN (old_reservation_id, new_reservation_id);
```

---

## Validation Rules

### PATCH Endpoint

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| reservation_id | UUID | Valid UUID format | No |
| amount | number | >= 0 | No |
| currency | string | Any string | No |
| status | enum | pending, succeeded, failed, refunded, cancelled | No |
| payment_date | string | YYYY-MM-DD format | No |

**Additional Checks**:
- Payment ID must be valid UUID
- Payment must exist and belong to org
- If reservation_id provided, target reservation must exist and belong to org
- At least one field must be provided

### Void Endpoint

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| (none) | - | - | - |

**Additional Checks**:
- Payment ID must be valid UUID
- Payment must exist and belong to org
- Payment must not already be cancelled

---

## Use Cases

### 1. Correct Payment Amount

**Scenario**: Payment was entered with wrong amount (200 instead of 300)

```bash
curl -X PATCH "http://localhost:3000/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 300.00
  }'
```

**Result**:
- Payment amount updated to 300
- Reservation paid_amount recalculated
- Remaining amount updated

### 2. Move Payment to Correct Reservation

**Scenario**: Payment was assigned to wrong reservation

```bash
curl -X PATCH "http://localhost:3000/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "correct-reservation-uuid"
  }'
```

**Result**:
- Payment moved to correct reservation
- Old reservation paid_amount decreases
- New reservation paid_amount increases
- Both reservations returned in response

### 3. Change Payment Status

**Scenario**: Payment was marked as succeeded but actually failed

```bash
curl -X PATCH "http://localhost:3000/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "failed"
  }'
```

**Result**:
- Payment status updated to 'failed'
- Reservation paid_amount recalculated (excludes failed payments)
- Remaining amount increases

### 4. Void Erroneous Payment

**Scenario**: Payment was created by mistake

```bash
curl -X POST "http://localhost:3000/api/payments/abc123-uuid/void" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Result**:
- Payment status set to 'cancelled'
- Reservation paid_amount decreases
- Remaining amount increases

### 5. Update Multiple Fields

**Scenario**: Correct both amount and date

```bash
curl -X PATCH "http://localhost:3000/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 350.00,
    "payment_date": "2026-01-15"
  }'
```

**Result**:
- Payment amount and date updated
- Reservation paid_amount recalculated
- Updated timestamp recorded

---

## Response Structure

### PATCH Response

```typescript
{
  payment: {
    id: string;
    reservationId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    paymentDate: string | null;
    createdAt: string;
    updatedAt: string;  // New field
  };
  affectedReservations: Array<{
    id: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  }>;
}
```

**Notes**:
- `affectedReservations` contains 1 or 2 reservations
- If reservation_id changed, both old and new are included
- If only amount/status/etc changed, only current reservation included

### Void Response

```typescript
{
  payment: {
    id: string;
    reservationId: string;
    amount: number;
    currency: string;
    status: 'cancelled';  // Always 'cancelled'
    paymentDate: string | null;
    createdAt: string;
    updatedAt: string;
  };
  reservation: {
    id: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  } | null;
}
```

**Notes**:
- `status` is always 'cancelled' after void
- `reservation` is the affected reservation with updated paid_amount
- `reservation` can be null if fetch fails (rare)

---

## Error Handling

### Common Errors

#### 400 Bad Request
```json
{
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
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

#### 403 Forbidden
```json
{
  "message": "Organization context required",
  "code": "ORG_REQUIRED"
}
```

#### 404 Not Found
```json
{
  "message": "Payment not found",
  "code": "NOT_FOUND"
}
```

#### 404 Not Found (Target Reservation)
```json
{
  "message": "Target reservation not found",
  "code": "RESERVATION_NOT_FOUND"
}
```

#### 400 Already Cancelled
```json
{
  "message": "Payment is already cancelled",
  "code": "ALREADY_CANCELLED"
}
```

---

## Testing

### Manual Testing

```bash
# 1. Create a test payment
PAYMENT_ID=$(curl -X POST "http://localhost:3000/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "test-reservation-uuid",
    "amount": 100.00
  }' | jq -r '.payment.id')

# 2. Update the payment
curl -X PATCH "http://localhost:3000/api/payments/$PAYMENT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 150.00
  }'

# 3. Void the payment
curl -X POST "http://localhost:3000/api/payments/$PAYMENT_ID/void" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Try to void again (should fail with ALREADY_CANCELLED)
curl -X POST "http://localhost:3000/api/payments/$PAYMENT_ID/void" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Automated Tests

```typescript
describe('PATCH /api/payments/:id', () => {
  it('should update payment amount', async () => {
    const response = await request(app)
      .patch(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 300 });
    
    expect(response.status).toBe(200);
    expect(response.body.payment.amount).toBe(300);
  });

  it('should move payment to different reservation', async () => {
    const response = await request(app)
      .patch(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservation_id: newReservationId });
    
    expect(response.status).toBe(200);
    expect(response.body.affectedReservations).toHaveLength(2);
  });

  it('should reject invalid UUID', async () => {
    const response = await request(app)
      .patch('/api/payments/invalid-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 300 });
    
    expect(response.status).toBe(400);
  });
});

describe('POST /api/payments/:id/void', () => {
  it('should void payment', async () => {
    const response = await request(app)
      .post(`/api/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.payment.status).toBe('cancelled');
  });

  it('should prevent double void', async () => {
    await request(app)
      .post(`/api/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${token}`);
    
    const response = await request(app)
      .post(`/api/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ALREADY_CANCELLED');
  });
});
```

---

## Security Considerations

### 1. Multi-Tenant Isolation ✅
- All queries filtered by `org_id`
- Users cannot access payments from other organizations
- Cross-org payment moves prevented

### 2. Authorization ✅
- `authenticateToken` middleware required
- `requireOrgContext` middleware required
- Payment ownership verified before update

### 3. Validation ✅
- UUIDs validated
- Amount must be >= 0
- Date format validated (YYYY-MM-DD)
- Status enum validated

### 4. Audit Trail ✅
- `updated_at` timestamp recorded
- Original `created_at` preserved
- Payment history maintained

### 5. Data Integrity ✅
- Database trigger ensures consistency
- Atomic updates
- Foreign key constraints enforced

---

## Performance

### Database Queries

**PATCH Endpoint**:
1. SELECT payment (verify exists + org)
2. SELECT target reservation (if moving)
3. UPDATE payment
4. SELECT affected reservations
5. Trigger: UPDATE reservations (automatic)

**Total**: 4-5 queries

**Void Endpoint**:
1. SELECT payment (verify exists + org)
2. UPDATE payment
3. SELECT reservation
4. Trigger: UPDATE reservation (automatic)

**Total**: 3-4 queries

### Optimization
- Uses single() for direct lookups
- Minimal data selected
- Indexes on org_id, id, reservation_id

---

## Summary

✅ **Implementation Complete**

Added two endpoints for safe payment correction:

1. **PATCH /api/payments/:id**
   - Update any payment field
   - Move payments between reservations
   - Returns affected reservations
   - Multi-tenant safe

2. **POST /api/payments/:id/void**
   - Cancel/void payments
   - Prevents double-void
   - Returns updated reservation
   - Multi-tenant safe

**Key Features**:
- ✅ Comprehensive validation
- ✅ Multi-tenant isolation
- ✅ Automatic reservation updates (via trigger)
- ✅ Detailed error messages
- ✅ curl examples provided
- ✅ TypeScript type safety
- ✅ Audit trail (updated_at)

**Ready for production use!** 🚀
