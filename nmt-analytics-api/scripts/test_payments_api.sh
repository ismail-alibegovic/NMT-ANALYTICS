#!/bin/bash

# Payments API Test Script
# This script tests the Payments API endpoints

set -e

echo "🧪 Testing Payments API Endpoints"
echo "=================================="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
TOKEN="${SUPABASE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "❌ Error: SUPABASE_TOKEN environment variable not set"
  echo "Usage: SUPABASE_TOKEN=your_token ./test_payments_api.sh"
  exit 1
fi

echo "📍 API URL: $API_URL"
echo ""

# Test 1: GET /api/payments (all payments)
echo "Test 1: GET /api/payments (fetch all payments)"
echo "-----------------------------------------------"
curl -s -X GET "$API_URL/api/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo ""
echo ""

# Test 2: GET /api/payments with pagination
echo "Test 2: GET /api/payments?page=1&limit=10"
echo "-----------------------------------------------"
curl -s -X GET "$API_URL/api/payments?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo ""
echo ""

# Test 3: GET /api/payments with date range
echo "Test 3: GET /api/payments?from=2026-01-01&to=2026-01-31"
echo "-----------------------------------------------"
curl -s -X GET "$API_URL/api/payments?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo ""
echo ""

# Test 4: POST /api/payments (create payment) - requires valid reservation_id
echo "Test 4: POST /api/payments (create payment)"
echo "-----------------------------------------------"
echo "⚠️  Skipping - requires valid reservation_id"
echo "Example command:"
echo 'curl -X POST "$API_URL/api/payments" \'
echo '  -H "Authorization: Bearer $TOKEN" \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{'
echo '    "reservation_id": "YOUR_RESERVATION_UUID",'
echo '    "amount": 250.00'
echo '  }'"'"
echo ""
echo ""

# Test 5: Validation error test
echo "Test 5: POST /api/payments (validation error - invalid UUID)"
echo "-----------------------------------------------"
curl -s -X POST "$API_URL/api/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "invalid-uuid",
    "amount": 100
  }' | jq '.'
echo ""
echo ""

# Test 6: Validation error test - negative amount
echo "Test 6: POST /api/payments (validation error - negative amount)"
echo "-----------------------------------------------"
curl -s -X POST "$API_URL/api/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": -50
  }' | jq '.'
echo ""
echo ""

echo "✅ Tests completed!"
echo ""
echo "Note: To test payment creation, you need a valid reservation_id from your database."
echo "You can get one by running: curl -X GET \"$API_URL/api/reservations\" -H \"Authorization: Bearer \$TOKEN\" | jq '.data[0].id'"
