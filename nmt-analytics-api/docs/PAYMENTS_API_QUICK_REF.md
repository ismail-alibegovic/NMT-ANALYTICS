# Payments API - Quick Reference

## Setup

```bash
# Set your API URL and token
export API_URL="http://localhost:3000/api"
export TOKEN="your_jwt_token_here"
```

---

## GET Requests

### Get All Payments (Default: Last 50)

```bash
curl -X GET "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Payments with Pagination

```bash
# Page 2, 20 items per page
curl -X GET "${API_URL}/payments?page=2&limit=20" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Payments for Specific Reservation

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X GET "${API_URL}/payments?reservation_id=${RESERVATION_ID}" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Payments by Date Range

```bash
# January 2026
curl -X GET "${API_URL}/payments?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Get Payments with Multiple Filters

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X GET "${API_URL}/payments?reservation_id=${RESERVATION_ID}&from=2026-01-01&to=2026-01-31&page=1&limit=10" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## POST Requests

### Create Payment (Full)

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 500.00,
    "currency": "BAM",
    "status": "succeeded",
    "payment_date": "2026-01-12"
  }'
```

### Create Payment (Minimal - Uses Defaults)

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 250.00
  }'
```

**Defaults:**
- `currency`: "BAM"
- `status`: "succeeded"
- `payment_date`: today (UTC)

### Create Pending Payment

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 100.00,
    "status": "pending"
  }'
```

### Create Payment with Custom Date

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 750.00,
    "payment_date": "2026-01-10"
  }'
```

---

## Response Examples

### GET Success Response

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "reservationId": "123e4567-e89b-12d3-a456-426614174000",
      "amount": 500,
      "currency": "BAM",
      "status": "succeeded",
      "paymentDate": "2026-01-12",
      "createdAt": "2026-01-12T10:30:00.000Z",
      "reservation": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "customerName": "John Doe",
        "customerPhone": "+387123456789",
        "totalAmount": 1000,
        "paidAmount": 500,
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

### POST Success Response

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "reservationId": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 500,
  "currency": "BAM",
  "status": "succeeded",
  "paymentDate": "2026-01-12",
  "createdAt": "2026-01-12T10:30:00.000Z",
  "reservation": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "totalAmount": 1000,
    "paidAmount": 500,
    "remainingAmount": 500,
    "status": "confirmed"
  }
}
```

### Error Response

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

---

## Common Scenarios

### Scenario 1: Record a Full Payment

```bash
# Customer pays full amount for reservation
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 1000.00,
    "status": "succeeded"
  }'
```

### Scenario 2: Record a Partial Payment (Deposit)

```bash
# Customer pays 50% deposit
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 500.00,
    "status": "succeeded"
  }'
```

### Scenario 3: Record Multiple Payments

```bash
# First payment (deposit)
curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 300.00,
    "payment_date": "2026-01-10"
  }'

# Second payment (partial)
curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 200.00,
    "payment_date": "2026-01-15"
  }'

# Final payment
curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "'${RESERVATION_ID}'",
    "amount": 500.00,
    "payment_date": "2026-01-20"
  }'
```

### Scenario 4: View Payment History for Reservation

```bash
RESERVATION_ID="123e4567-e89b-12d3-a456-426614174000"

curl -X GET "${API_URL}/payments?reservation_id=${RESERVATION_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '.data[] | {amount, status, paymentDate, paidAmount: .reservation.paidAmount}'
```

### Scenario 5: Generate Monthly Payment Report

```bash
# Get all payments for January 2026
curl -X GET "${API_URL}/payments?from=2026-01-01&to=2026-01-31&limit=200" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq '{
      total_payments: .pagination.total,
      total_amount: [.data[].amount] | add,
      by_status: .data | group_by(.status) | map({status: .[0].status, count: length})
    }'
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (GET) |
| 201 | Created (POST) |
| 400 | Validation Error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

---

## Payment Statuses

| Status | Description |
|--------|-------------|
| `pending` | Payment is pending/processing |
| `succeeded` | Payment completed successfully |
| `failed` | Payment failed |
| `refunded` | Payment was refunded |
| `cancelled` | Payment was cancelled |

---

## Tips

1. **Use `jq` for JSON parsing**: `curl ... | jq '.'`
2. **Save token to env**: `export TOKEN="your_token"`
3. **Pretty print responses**: Add `-s` to curl and pipe to `jq`
4. **Check status code**: Add `-w "\n%{http_code}\n"` to curl
5. **Debug requests**: Add `-v` flag to curl

---

## Testing Script

Run the automated test script:

```bash
export API_URL="http://localhost:3000/api"
export AUTH_TOKEN="your_jwt_token"

node scripts/test-payments-api.js
```

---

**Quick Start:**

```bash
# 1. Set environment
export API_URL="http://localhost:3000/api"
export TOKEN="your_jwt_token"
export RESERVATION_ID="your_reservation_id"

# 2. Create a payment
curl -X POST "${API_URL}/payments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"reservation_id": "'${RESERVATION_ID}'", "amount": 500.00}'

# 3. View payments
curl -X GET "${API_URL}/payments?reservation_id=${RESERVATION_ID}" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.'
```
