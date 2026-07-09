# NMT Analytics API - cURL Examples

## Authentication
All requests require a Bearer token in the Authorization header:

```bash
TOKEN="your_supabase_jwt_token_here"
BASE_URL="http://localhost:3001"
```

## Health Check
```bash
curl "$BASE_URL/api/health"
```

## User Profile
```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/me"
```

## Metrics
```bash
# Overview (last 7 days)
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/metrics/overview?from=2024-01-01&to=2024-01-07"

# Revenue series
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/metrics/revenue-series?from=2024-01-01&to=2024-01-07"

# Transaction breakdown
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/metrics/transactions-breakdown?from=2024-01-01&to=2024-01-07"

# Reservation breakdown
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/metrics/reservations-breakdown?from=2024-01-01&to=2024-01-07"
```

## Customers (CRUD)
```bash
# List customers (paginated)
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/customers?page=1&pageSize=20&search=john"

# Get single customer
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/customers/123"

# Create customer
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "fullName": "John Smith",
       "phone": "+387-61-123-456",
       "email": "john@example.com",
       "notes": "VIP customer"
     }' \
     "$BASE_URL/api/customers"

# Update customer
curl -X PUT -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "fullName": "John Smith Jr",
       "phone": "+387-61-123-456"
     }' \
     "$BASE_URL/api/customers/123"

# Delete customer
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/customers/123"
```

## Packages (CRUD)
```bash
# List packages
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/packages"

# Create package
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Dubai Adventure",
       "destination": "Dubai, UAE",
       "basePrice": 1200.00,
       "currency": "BAM",
       "isActive": true
     }' \
     "$BASE_URL/api/packages"
```

## Departures (CRUD)
```bash
# List departures
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/departures?from=2024-01-01&to=2024-12-31"

# Create departure
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "packageId": "123",
       "departAt": "2024-06-15T08:00:00Z",
       "returnAt": "2024-06-22T20:00:00Z",
       "capacity": 20,
       "status": "active"
     }' \
     "$BASE_URL/api/departures"
```

## Reservations (CRUD)
```bash
# List reservations (last 30 days)
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/reservations"

# Create reservation
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "customerName": "John Smith",
       "customerPhone": "+387-61-123-456",
       "partySize": 4,
       "reservationAt": "2024-01-15T19:00:00Z",
       "status": "confirmed",
       "customerId": "123",
       "departureId": "456",
       "totalAmount": 150.00,
       "currency": "BAM",
       "source": "web"
     }' \
     "$BASE_URL/api/reservations"
```

## Transactions (CRUD)
```bash
# List transactions (last 30 days)
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/transactions"

# Create transaction
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "amount": 150.00,
       "currency": "BAM",
       "type": "payment",
       "note": "Reservation payment",
       "occurredAt": "2024-01-15T14:30:00Z"
     }' \
     "$BASE_URL/api/transactions"
```

## Reports (CSV Export)
```bash
# Export transactions CSV
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/reports/transactions.csv?from=2024-01-01&to=2024-01-31" \
     --output transactions.csv

# Export reservations CSV
curl -H "Authorization: Bearer $TOKEN" \
     "$BASE_URL/api/reports/reservations.csv?from=2024-01-01&to=2024-01-31" \
     --output reservations.csv
```

## Error Response Format
All endpoints return errors in this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": "Additional details or validation errors"
  }
}
```

## Environment Setup
```bash
# Required environment variables
export SUPABASE_URL="your_supabase_url"
export SUPABASE_ANON_KEY="your_anon_key"
export ACCESS_TOKEN="your_jwt_token"  # For testing

# Optional
export BASE_URL="http://localhost:3001"
```

## Running Tests
```bash
# Build the project
npm run build

# Run smoke tests
npm run test:smoke

# Seed demo data (requires SUPABASE_SERVICE_ROLE_KEY)
npm run seed:demo
