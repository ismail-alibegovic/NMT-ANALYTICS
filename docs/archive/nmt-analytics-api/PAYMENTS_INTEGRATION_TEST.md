# End-to-End Payments → Reservations Integration Test

**Date**: 2026-01-14  
**Status**: Ready for Manual Validation

---

## Test Summary

This document provides step-by-step instructions to validate the complete Payments → Reservations integration.

---

## Prerequisites

1. ✅ API server running on `http://localhost:3001`
2. ✅ Admin UI running on `http://localhost:5173`
3. ✅ User logged in to get auth token

---

## Automated Test Results (Partial)

### Step 1: Reservation Found ✅

```
Reservation ID: 03cab5bd-a9a7-45b2-8d66-d87abfbed194
Customer: Tarik Kovačević
Total Amount: 9600 BAM
Paid Amount: 1500 BAM
Status: confirmed
```

### Step 2: Initial Values Recorded ✅

```
Initial Total: 9600 BAM
Initial Paid: 1500 BAM
Initial Due: 8100 BAM (max(9600 - 1500, 0))
```

### Step 3: Payment Creation (Requires Auth Token)

**Request**:
```bash
POST http://localhost:3001/api/payments
Content-Type: application/json
Authorization: Bearer YOUR_AUTH_TOKEN

{
  "reservation_id": "03cab5bd-a9a7-45b2-8d66-d87abfbed194",
  "amount": 200,
  "currency": "BAM",
  "status": "succeeded",
  "payment_date": "2026-01-14"
}
```

**Issue**: Automated test failed with 401 Unauthorized (needs user JWT token, not service role key)

---

## Manual Validation Steps

### Step 1: Get Auth Token

1. Open browser to `http://localhost:5173`
2. Sign in to the admin panel
3. Open browser DevTools (F12)
4. Go to Console tab
5. Run: `localStorage.getItem('nmt_auth_token')` or check for keys containing `auth-token`
6. Copy the token value

### Step 2: Test Payment Creation via curl

Replace `YOUR_TOKEN` with the token from Step 1:

```bash
curl -X POST "http://localhost:3001/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "03cab5bd-a9a7-45b2-8d66-d87abfbed194",
    "amount": 200,
    "currency": "BAM",
    "status": "succeeded",
    "payment_date": "2026-01-14"
  }'
```

**Expected Response (201 Created)**:
```json
{
  "payment": {
    "id": "uuid",
    "reservationId": "03cab5bd-a9a7-45b2-8d66-d87abfbed194",
    "amount": 200,
    "currency": "BAM",
    "status": "succeeded",
    "paymentDate": "2026-01-14",
    "createdAt": "2026-01-14T..."
  },
  "reservation": {
    "id": "03cab5bd-a9a7-45b2-8d66-d87abfbed194",
    "totalAmount": 9600,
    "paidAmount": 1700,
    "remainingAmount": 7900,
    "status": "confirmed"
  }
}
```

### Step 3: Verify Response

Check that the response includes:
- ✅ `payment` object with `id`, `amount`, `status`
- ✅ `reservation` object with updated `paidAmount`
- ✅ `paidAmount` = 1500 + 200 = **1700 BAM**
- ✅ `remainingAmount` = 9600 - 1700 = **7900 BAM**

### Step 4: Verify Database Update

Query the database directly via Supabase:

```bash
curl "https://hacutwknfgufrqlgdiia.supabase.co/rest/v1/reservations?select=id,total_amount,paid_amount&id=eq.03cab5bd-a9a7-45b2-8d66-d87abfbed194" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

**Expected**:
```json
[
  {
    "id": "03cab5bd-a9a7-45b2-8d66-d87abfbed194",
    "total_amount": 9600,
    "paid_amount": 1700
  }
]
```

### Step 5: Verify in UI

1. Open `http://localhost:5173/reservations`
2. Find reservation for "Tarik Kovačević" (ID: 03cab5bd...)
3. Verify the following columns:

| Column | Expected Value | Formula |
|--------|---------------|---------|
| **Ukupno** (Total) | 9600 BAM | `reservation.totalAmount` |
| **Plaćeno** (Paid) | **1700 BAM** | `reservation.paidAmount` (updated!) |
| **Dug** (Due) | **7900 BAM** | `max(9600 - 1700, 0)` |
| **Status plaćanja** | **Djelimično** (Partial) | Badge: Yellow/Warning |

### Step 6: Test Add Payment Button

1. Click **"Add Payment"** button on the same reservation row
2. Modal should open with form
3. Enter amount: **300**
4. Leave other fields as default (currency=BAM, status=succeeded, date=today)
5. Click **"Dodaj plaćanje"** (Add Payment)
6. Verify:
   - ✅ Success toast: "Plaćanje uspješno dodano"
   - ✅ Modal closes
   - ✅ **Paid amount** updates to **2000 BAM** (1700 + 300)
   - ✅ **Due** updates to **7600 BAM** (9600 - 2000)
   - ✅ Badge still shows **"Djelimično"** (Partial)

---

## Expected Results Summary

### After First Payment (200 BAM)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total Amount | 9600 BAM | 9600 BAM | - |
| Paid Amount | 1500 BAM | **1700 BAM** | +200 |
| Due | 8100 BAM | **7900 BAM** | -200 |
| Status Badge | Djelimično | **Djelimično** | - |

### After Second Payment (300 BAM via UI)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total Amount | 9600 BAM | 9600 BAM | - |
| Paid Amount | 1700 BAM | **2000 BAM** | +300 |
| Due | 7900 BAM | **7600 BAM** | -300 |
| Status Badge | Djelimično | **Djelimično** | - |

### Payment Status Badge Logic

- **Plaćeno** (Fully Paid) - Green: `paid === total && total > 0`
- **Djelimično** (Partial) - Yellow: `paid > 0 && paid < total` ✅ (Current)
- **Neplaćeno** (Unpaid) - Red: `paid === 0 && total > 0`

---

## Troubleshooting

### 401 Unauthorized Error

**Cause**: Missing or invalid auth token

**Solution**:
1. Sign in to admin panel
2. Get fresh token from localStorage
3. Use token in Authorization header

### 404 Reservation Not Found

**Cause**: Reservation doesn't exist or doesn't belong to your org

**Solution**:
1. Verify reservation ID exists
2. Check org_id matches your user's org
3. Try with a different reservation

### Paid Amount Not Updating

**Cause**: Database trigger not working

**Solution**:
1. Check server logs for errors
2. Verify trigger exists: `trg_update_reservation_paid_amount`
3. Check payment status is 'succeeded' (only succeeded payments count)

### UI Not Updating Immediately

**Cause**: Response missing reservation object

**Solution**:
1. Check API response includes `reservation` object
2. If missing, UI will refetch list (slower but still works)
3. Verify `handlePaymentAdded` function is called

---

## Validation Checklist

- [ ] Step 1: Reservation found in database
- [ ] Step 2: Initial values recorded (total, paid, due)
- [ ] Step 3: Payment created via API (200 BAM)
- [ ] Step 4: Response includes payment object
- [ ] Step 5: Response includes reservation object with updated paidAmount
- [ ] Step 6: Database query confirms paid_amount increased
- [ ] Step 7: UI shows updated paid amount (1700 BAM)
- [ ] Step 8: UI shows updated due (7900 BAM)
- [ ] Step 9: UI shows correct badge (Djelimično/Partial)
- [ ] Step 10: Add Payment button works in UI
- [ ] Step 11: Second payment updates UI immediately
- [ ] Step 12: No page reload required

---

## Next Steps

1. **Manual Testing**: Follow the steps above to validate the integration
2. **Capture Screenshots**: Take screenshots of the UI before and after adding payments
3. **Report Issues**: If any step fails, capture:
   - Request URL
   - Status code
   - Response JSON
   - Console errors
   - Server logs

---

## Conclusion

The integration test successfully validated:
- ✅ Database query to fetch reservation
- ✅ Initial values calculation
- ✅ API endpoint structure

**Requires manual validation**:
- ⏳ Payment creation with user auth token
- ⏳ Database trigger update
- ⏳ UI immediate updates
- ⏳ Badge calculation

**Recommendation**: Complete manual validation steps to confirm end-to-end flow.
