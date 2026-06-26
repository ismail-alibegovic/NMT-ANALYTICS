# Phase 1 End-to-End Testing Report

**Date**: 2026-01-15  
**Tester**: Automated QA  
**Environment**: Development (localhost)  
**Status**: ⚠️ **MIGRATIONS REQUIRED BEFORE TESTING**

---

## ⚠️ Pre-Test Requirements

**CRITICAL**: The following migrations must be run before testing:

### 1. Financial Truth Fields Migration
```bash
# File: supabase/sql/015_financial_truth_fields.sql
# Run in Supabase Dashboard SQL Editor
```

### 2. Currency Consistency Migration
```bash
# File: supabase/sql/016_currency_consistency.sql
# Run in Supabase Dashboard SQL Editor
```

**Verification**:
```sql
-- Check columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'reservations'
  AND column_name IN ('balance_due', 'payment_status', 'currency');

-- Expected output:
-- balance_due    | numeric | 0
-- currency       | text    | 'BAM'::text
-- payment_status | text    | 'unpaid'::text

-- Check triggers exist
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name IN ('trg_update_reservation_paid_amount', 'trg_validate_payment_currency');

-- Expected output:
-- trg_update_reservation_paid_amount
-- trg_validate_payment_currency
```

---

## 🧪 Test Scenarios

### Scenario 1: New Reservation (No Payments)

**Setup**:
```bash
POST /api/reservations
{
  "customerName": "Test Customer",
  "customerPhone": "+387123456789",
  "partySize": 2,
  "reservationAt": "2026-02-01T10:00:00Z",
  "totalAmount": 1000,
  "currency": "BAM"
}
```

**Expected Result**:
```json
{
  "id": "uuid",
  "totalAmount": 1000,
  "paidAmount": 0,
  "balanceDue": 1000,
  "remainingAmount": 1000,
  "paymentStatus": "unpaid",
  "currency": "BAM"
}
```

**Assertions**:
- ✅ `paidAmount` = 0
- ✅ `balanceDue` = 1000
- ✅ `paymentStatus` = "unpaid"
- ✅ `currency` = "BAM"

**Status**: ⏳ Pending Migration

---

### Scenario 2: Partial Payment

**Setup**:
```bash
POST /api/payments
{
  "reservation_id": "{reservation_id}",
  "amount": 300,
  "status": "succeeded"
}
```

**Expected Result**:
```json
{
  "payment": {
    "id": "uuid",
    "amount": 300,
    "currency": "BAM",  // Inherited from reservation
    "status": "succeeded"
  },
  "reservation": {
    "totalAmount": 1000,
    "paidAmount": 300,
    "balanceDue": 700,
    "paymentStatus": "partially_paid"
  }
}
```

**Assertions**:
- ✅ `paidAmount` = 300
- ✅ `balanceDue` = 700 (1000 - 300)
- ✅ `paymentStatus` = "partially_paid"
- ✅ Payment currency inherited from reservation

**Status**: ⏳ Pending Migration

---

### Scenario 3: Full Payment

**Setup**:
```bash
POST /api/payments
{
  "reservation_id": "{reservation_id}",
  "amount": 700,
  "status": "succeeded"
}
```

**Expected Result**:
```json
{
  "reservation": {
    "totalAmount": 1000,
    "paidAmount": 1000,  // 300 + 700
    "balanceDue": 0,
    "paymentStatus": "paid"
  }
}
```

**Assertions**:
- ✅ `paidAmount` = 1000 (sum of all succeeded payments)
- ✅ `balanceDue` = 0
- ✅ `paymentStatus` = "paid"

**Status**: ⏳ Pending Migration

---

### Scenario 4: Overpayment (Critical Test)

**Setup**:
```bash
POST /api/payments
{
  "reservation_id": "{reservation_id}",
  "amount": 1100,
  "status": "succeeded"
}
```

**Expected Result** (Based on Implementation):
```json
{
  "reservation": {
    "totalAmount": 1000,
    "paidAmount": 1100,
    "balanceDue": -100,  // NEGATIVE = CREDIT
    "paymentStatus": "paid"
  }
}
```

**Our Chosen Rule**: ✅ **Negative balance indicates credit**

**Assertions**:
- ✅ `paidAmount` = 1100 (overpayment allowed)
- ✅ `balanceDue` = -100 (negative indicates credit)
- ✅ `paymentStatus` = "paid" (paid_amount >= total_amount)
- ✅ **NO constraint errors** (removed `paid_amount <= total_amount` check)
- ✅ Frontend displays "(kredit)" indicator

**Database Verification**:
```sql
SELECT 
  id,
  total_amount,
  paid_amount,
  balance_due,
  payment_status
FROM reservations
WHERE id = '{reservation_id}';

-- Expected:
-- total_amount: 1000.00
-- paid_amount: 1100.00
-- balance_due: -100.00
-- payment_status: paid
```

**Status**: ⏳ Pending Migration

---

### Scenario 5: Void Payment

**Setup**:
```bash
# Void the 1100 payment
POST /api/payments/{payment_id}/void
```

**Expected Result**:
```json
{
  "payment": {
    "id": "{payment_id}",
    "status": "cancelled",  // Changed from "succeeded"
    "amount": 1100
  },
  "reservation": {
    "totalAmount": 1000,
    "paidAmount": 0,  // Reverted (cancelled payments excluded)
    "balanceDue": 1000,  // Back to original
    "paymentStatus": "unpaid"
  }
}
```

**Assertions**:
- ✅ Payment status = "cancelled"
- ✅ `paidAmount` reverts to 0 (cancelled payments not counted)
- ✅ `balanceDue` = 1000 (back to original)
- ✅ `paymentStatus` = "unpaid"
- ✅ **No hard delete** (payment still exists in DB)
- ✅ Audit log created: `payment.voided`

**Audit Log Verification**:
```sql
SELECT action, entity, details
FROM audit_logs
WHERE action = 'payment.voided'
  AND entity_id = '{payment_id}'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- action: payment.voided
-- entity: payment
-- details: { oldValues: { status: "succeeded" }, newValues: { status: "cancelled" } }
```

**Status**: ⏳ Pending Migration

---

### Scenario 6: Edit Payment

**Setup**:
```bash
# Create a payment first
POST /api/payments
{
  "reservation_id": "{reservation_id}",
  "amount": 500,
  "status": "succeeded",
  "payment_date": "2026-01-15"
}

# Then edit it
PATCH /api/payments/{payment_id}
{
  "amount": 600,
  "payment_date": "2026-01-16"
}
```

**Expected Result**:
```json
{
  "payment": {
    "id": "{payment_id}",
    "amount": 600,  // Updated
    "paymentDate": "2026-01-16",  // Updated
    "status": "succeeded"
  },
  "affectedReservations": [{
    "id": "{reservation_id}",
    "totalAmount": 1000,
    "paidAmount": 600,  // Updated
    "balanceDue": 400
  }]
}
```

**Assertions**:
- ✅ Payment amount updated
- ✅ Payment date updated
- ✅ `paidAmount` recalculated (600)
- ✅ `balanceDue` recalculated (400)
- ✅ `paymentStatus` = "partially_paid"
- ✅ Audit log created: `payment.updated`

**Audit Log Verification**:
```sql
SELECT action, details
FROM audit_logs
WHERE action = 'payment.updated'
  AND entity_id = '{payment_id}'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- details: {
--   oldValues: { amount: 500, payment_date: "2026-01-15" },
--   newValues: { amount: 600, payment_date: "2026-01-16" }
-- }
```

**Status**: ⏳ Pending Migration

---

### Scenario 7: Currency Inheritance

**Setup**:
```bash
# Create reservation with EUR
POST /api/reservations
{
  "customerName": "Euro Customer",
  "customerPhone": "+387123456789",
  "partySize": 2,
  "reservationAt": "2026-02-01T10:00:00Z",
  "totalAmount": 500,
  "currency": "EUR"
}

# Create payment WITHOUT specifying currency
POST /api/payments
{
  "reservation_id": "{reservation_id}",
  "amount": 200,
  "status": "succeeded"
  // Note: NO currency field
}
```

**Expected Result**:
```json
{
  "payment": {
    "id": "uuid",
    "amount": 200,
    "currency": "EUR",  // INHERITED from reservation
    "status": "succeeded"
  }
}
```

**Assertions**:
- ✅ Payment currency = "EUR" (inherited from reservation)
- ✅ No currency mismatch
- ✅ Database trigger validates currency match

**Database Verification**:
```sql
SELECT 
  r.id as reservation_id,
  r.currency as reservation_currency,
  p.id as payment_id,
  p.currency as payment_currency
FROM reservations r
JOIN payments p ON p.reservation_id = r.id
WHERE r.id = '{reservation_id}';

-- Expected:
-- reservation_currency: EUR
-- payment_currency: EUR
```

**Status**: ⏳ Pending Migration

---

## 📊 Test Summary

### Overall Status: ⚠️ **MIGRATIONS REQUIRED**

| Scenario | Expected Behavior | Status |
|----------|------------------|--------|
| 1. No Payments | paid=0, balance=1000, status=unpaid | ⏳ Pending |
| 2. Partial Payment | paid=300, balance=700, status=partially_paid | ⏳ Pending |
| 3. Full Payment | paid=1000, balance=0, status=paid | ⏳ Pending |
| 4. Overpayment | paid=1100, balance=-100, status=paid, NO errors | ⏳ Pending |
| 5. Void Payment | Totals revert, audit log created | ⏳ Pending |
| 6. Edit Payment | Totals update, audit log created | ⏳ Pending |
| 7. Currency Inheritance | Payment inherits reservation currency | ⏳ Pending |

---

## 🎯 Implementation Rules Confirmed

### Rule 1: Overpayment Handling
**Chosen Rule**: ✅ **Negative balance indicates credit**

```
IF paid_amount > total_amount THEN
  balance_due = total_amount - paid_amount  // NEGATIVE
  payment_status = 'paid'
  UI displays: "Saldo: 100.00 BAM (kredit)"
END IF
```

**Benefits**:
- ✅ Tracks customer credit accurately
- ✅ No data loss
- ✅ Clear UI indicator
- ✅ Supports refund workflows

### Rule 2: Currency Source of Truth
**Chosen Rule**: ✅ **reservation.currency is the source of truth**

```
IF payment.currency IS NULL THEN
  payment.currency = reservation.currency
END IF
```

**Benefits**:
- ✅ Prevents currency mismatches
- ✅ Simplifies payment creation
- ✅ Consistent financial reporting

### Rule 3: Audit Logging
**Chosen Rule**: ✅ **Log all payment changes**

```
Actions logged:
- payment.updated (PATCH)
- payment.voided (void)
- Includes: user_id, old/new values, reservation context
```

**Benefits**:
- ✅ Full audit trail
- ✅ User accountability
- ✅ Regulatory compliance

---

## 🔧 Manual Testing Steps

Once migrations are run, follow these steps:

### 1. Create Test Reservation
```bash
curl -X POST http://localhost:3001/api/reservations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "QA Test Customer",
    "customerPhone": "+387123456789",
    "partySize": 2,
    "reservationAt": "2026-02-01T10:00:00Z",
    "totalAmount": 1000,
    "currency": "BAM"
  }'
```

### 2. Verify Initial State
```bash
curl http://localhost:3001/api/reservations/{id} \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check response:
# - paidAmount: 0
# - balanceDue: 1000
# - paymentStatus: "unpaid"
```

### 3. Add Partial Payment
```bash
curl -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "{reservation_id}",
    "amount": 300,
    "status": "succeeded"
  }'

# Check response:
# - reservation.paidAmount: 300
# - reservation.balanceDue: 700
# - reservation.paymentStatus: "partially_paid"
```

### 4. Test Overpayment
```bash
curl -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "{reservation_id}",
    "amount": 1100,
    "status": "succeeded"
  }'

# Check response:
# - reservation.paidAmount: 1400 (300 + 1100)
# - reservation.balanceDue: -400 (NEGATIVE = CREDIT)
# - reservation.paymentStatus: "paid"
# - NO 400 or 500 errors
```

### 5. Test Void
```bash
curl -X POST http://localhost:3001/api/payments/{payment_id}/void \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check response:
# - payment.status: "cancelled"
# - reservation.paidAmount: recalculated (excluding voided)
# - reservation.balanceDue: recalculated
```

### 6. Check Audit Logs
```sql
SELECT * FROM audit_logs
WHERE action IN ('payment.updated', 'payment.voided')
ORDER BY created_at DESC
LIMIT 10;
```

---

## 📸 Expected UI Screenshots

### 1. Reservations List
**Expected Display**:
```
| Klijent | Paket | Ukupno | Plaćeno | Saldo | Status plaćanja | Status rezervacije |
|---------|-------|---------|---------|-------|-----------------|-------------------|
| QA Test | -     | 1000 BAM| 0 BAM   | 1000 BAM | Neplaćeno (red) | Na čekanju (yellow) |
```

### 2. After Partial Payment
```
| Klijent | Paket | Ukupno | Plaćeno | Saldo | Status plaćanja | Status rezervacije |
|---------|-------|---------|---------|-------|-----------------|-------------------|
| QA Test | -     | 1000 BAM| 300 BAM | 700 BAM | Djelimično (yellow) | Na čekanju (yellow) |
```

### 3. After Overpayment
```
| Klijent | Paket | Ukupno | Plaćeno | Saldo | Status plaćanja | Status rezervacije |
|---------|-------|---------|---------|-------|-----------------|-------------------|
| QA Test | -     | 1000 BAM| 1400 BAM| 400 BAM (kredit) | Plaćeno (green) | Na čekanju (yellow) |
```
*Note: Saldo shows "(kredit)" indicator for negative balance*

### 4. PaymentsModal
**Expected Display**:
```
Plaćanja za rezervaciju

Ukupno rezervacija: 1000.00 BAM
Ukupno plaćeno: 1400.00 BAM
Ukupno refundirano: 0.00 BAM
Preostalo: 0.00 BAM (or shows credit)

Povijest plaćanja (2):
┌─────────────────────────────────────────┐
│ 300.00 BAM [Uspješno]                   │
│ Datum: 15.01.2026                        │
│ [Uredi] [Otkaži]                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 1100.00 BAM [Uspješno]                  │
│ Datum: 15.01.2026                        │
│ [Uredi] [Otkaži]                         │
└─────────────────────────────────────────┘
```

---

## ✅ Success Criteria

All scenarios must pass:
- [ ] No 400/500 errors on overpayment
- [ ] Negative balance displayed correctly
- [ ] Currency inherited correctly
- [ ] Void updates totals correctly
- [ ] Edit updates totals correctly
- [ ] Audit logs created for all changes
- [ ] UI displays all fields correctly
- [ ] No horizontal scroll on desktop
- [ ] Responsive on mobile

---

## 🚀 Next Steps

1. **Run Migrations**:
   - Execute `015_financial_truth_fields.sql`
   - Execute `016_currency_consistency.sql`

2. **Verify Migrations**:
   - Check columns exist
   - Check triggers exist
   - Check defaults are correct

3. **Run Manual Tests**:
   - Follow manual testing steps above
   - Capture screenshots
   - Verify audit logs

4. **Update This Report**:
   - Change status from "⏳ Pending" to "✅ Pass" or "❌ Fail"
   - Add actual screenshots
   - Document any issues found

---

**Report Status**: ⚠️ **DRAFT - Migrations Required**

**Next Action**: Run database migrations to enable testing! 🚀

---

**End of QA Report**
