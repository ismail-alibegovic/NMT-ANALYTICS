# Data Consistency Bug Fix - Payment Backfill

**Date**: 2026-01-15  
**Issue**: Reservations show paid_amount > 0 but PaymentsModal shows empty history  
**Root Cause**: Legacy data from CSV imports set paid_amount directly without creating payment records  

---

## 🐛 Problem Description

### Symptoms
- Reservations table shows: `paid_amount = 200`, `balance_due = 3000`, `payment_status = partially_paid`
- PaymentsModal shows: "Nema plaćanja za ovu rezervaciju" (0 payments)
- Example: Dino Alić reservation (#e62d416f)

### Root Cause
Legacy data sources (CSV imports, old transactions table) set `reservations.paid_amount` directly without creating corresponding rows in the `payments` table.

### Impact
- Users cannot see payment history
- Cannot edit/void payments that "don't exist"
- Data inconsistency between reservation totals and payment records

---

## ✅ Solution

### A) Debug ID Mismatch ✅

**Added Debug Logging**:

**Backend** (`src/routes/payments.ts`):
```typescript
if (reservation_id) {
    console.log(`[GET /api/payments] Filtering by reservation_id:`, {
        reservation_id,
        type: typeof reservation_id,
        length: reservation_id.length,
        isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservation_id)
    });
    query = query.eq('reservation_id', reservation_id);
}
```

**Frontend** (to be added to `PaymentsModal.tsx`):
```typescript
console.log('[PaymentsModal] Fetching payments for reservation:', {
    reservationId,
    type: typeof reservationId,
    length: reservationId?.length,
    isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId || '')
});
```

**Verification**:
- Check browser console when opening PaymentsModal
- Check backend logs for reservation_id filtering
- Ensure full UUID is passed, not short hash (#e62d416f)

---

### B) Fix Data Consistency (Backfill) ✅

**Created**: `supabase/sql/017_payment_backfill.sql`

**What It Does**:
1. Finds all reservations where `paid_amount > 0`
2. Checks if there are zero `succeeded` payments for that reservation
3. Creates a single "adjustment" payment row:
   - `amount = reservations.paid_amount`
   - `currency = reservations.currency` (or 'BAM' default)
   - `status = 'succeeded'`
   - `payment_date = reservations.created_at::date`
   - Marks as migration adjustment
4. Database trigger automatically recalculates totals

**How to Run**:

**Option 1: Supabase Dashboard** (Recommended)
```
1. Open: https://app.supabase.com/project/YOUR_PROJECT/sql
2. Copy: supabase/sql/017_payment_backfill.sql
3. Paste and click "Run"
4. Review output messages
```

**Option 2: psql**
```bash
psql <connection_string> -f supabase/sql/017_payment_backfill.sql
```

**Expected Output**:
```
=== Payment Backfill Migration ===
Finding reservations with paid_amount > 0 but no payment records...

Created adjustment payment for reservation: e62d416f-... (Customer: Dino Alić, Amount: 200)
Created adjustment payment for reservation: ... (Customer: ..., Amount: ...)

=== Migration Complete ===
Adjustment payments created: 5
Reservations skipped (already have payments): 12

✅ All reservations with paid_amount > 0 now have corresponding payment records
```

---

### C) UX Safety (Warning Banner) ⏳

**To Be Added** to `PaymentsModal.tsx`:

```tsx
// After fetching payments, check for inconsistency
const hasInconsistency = reservationPaid > 0 && payments.length === 0;

// In render, before payment list:
{hasInconsistency && (
    <div className="mb-4 p-4 rounded-lg bg-warning-50 dark:bg-warning-950/20 border border-warning-200 dark:border-warning-800">
        <div className="flex items-start gap-3">
            <span className="text-warning-600 dark:text-warning-400 text-xl">⚠️</span>
            <div>
                <h4 className="font-semibold text-warning-800 dark:text-warning-300 mb-1">
                    Nedostaju zapisi plaćanja
                </h4>
                <p className="text-sm text-warning-700 dark:text-warning-400">
                    Ova rezervacija ima plaćeni iznos ({formatCurrency(reservationPaid)}), 
                    ali nema odgovarajućih zapisa plaćanja. 
                    Ovo je vjerovatno rezultat uvoza starih podataka.
                </p>
                <p className="text-xs text-warning-600 dark:text-warning-500 mt-2">
                    Kontaktirajte administratora da pokrene migraciju podataka.
                </p>
            </div>
        </div>
    </div>
)}
```

**After Migration**: This warning should disappear automatically.

---

## 🧪 Testing

### Test Case: Dino Alić Reservation

**Before Migration**:
```
Reservation ID: e62d416f-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Customer: Dino Alić
Total: 3200 BAM
Paid: 200 BAM
Balance: 3000 BAM
Status: partially_paid

PaymentsModal: "Nema plaćanja" (0 payments)
```

**After Migration**:
```
Reservation ID: e62d416f-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Customer: Dino Alić
Total: 3200 BAM
Paid: 200 BAM
Balance: 3000 BAM
Status: partially_paid

PaymentsModal: Shows 1 payment
┌─────────────────────────────────────────┐
│ 200.00 BAM [Uspješno]                   │
│ Datum: (reservation creation date)      │
│ [Uredi] [Otkaži]                         │
└─────────────────────────────────────────┘
```

### Verification Queries

**1. Check specific reservation**:
```sql
SELECT 
    r.id,
    r.customer_name,
    r.total_amount,
    r.paid_amount,
    r.balance_due,
    r.payment_status,
    (SELECT COUNT(*) FROM payments WHERE reservation_id = r.id AND status = 'succeeded') as payment_count,
    (SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded') as payment_sum
FROM reservations r
WHERE r.customer_name LIKE '%Dino Alić%'
   OR r.id::text LIKE '%e62d416f%';
```

**Expected Result**:
- `payment_count` = 1
- `payment_sum` = 200.00
- `paid_amount` = 200.00 (should match payment_sum)

**2. List adjustment payments created**:
```sql
SELECT 
    p.id,
    p.reservation_id,
    r.customer_name,
    p.amount,
    p.currency,
    p.status,
    p.payment_date,
    p.created_at
FROM payments p
JOIN reservations r ON r.id = p.reservation_id
WHERE p.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY p.created_at DESC;
```

**3. Check for remaining inconsistencies**:
```sql
SELECT 
    r.id,
    r.customer_name,
    r.paid_amount,
    COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0) as calculated_paid,
    r.paid_amount - COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0) as difference
FROM reservations r
WHERE r.paid_amount > 0
  AND ABS(r.paid_amount - COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0)) > 0.01
ORDER BY difference DESC;
```

**Expected**: No rows (all should be consistent)

---

## 📊 Migration Statistics

**Example Output**:
```
Reservations scanned: 150
Adjustment payments created: 8
Reservations skipped (already have payments): 142
Inconsistencies remaining: 0
```

**Affected Reservations** (example):
- Dino Alić: 200 BAM
- Customer 2: 500 BAM
- Customer 3: 1000 BAM
- ... (total 8 reservations)

---

## 🔄 Rollback

If migration needs to be rolled back:

```sql
-- Delete adjustment payments created in last hour
DELETE FROM payments
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND updated_at = created_at  -- Only newly created records
  AND EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = payments.reservation_id
        AND payments.amount = r.paid_amount
  );
```

**Note**: This will restore the inconsistent state. Only use if migration caused issues.

---

## 🎯 Success Criteria

- [ ] Migration runs without errors
- [ ] All reservations with `paid_amount > 0` have corresponding payment records
- [ ] PaymentsModal shows payment history for Dino Alić reservation
- [ ] Payment amount matches `paid_amount` in reservation
- [ ] Trigger recalculation maintains consistency
- [ ] No warning banner appears (after migration)
- [ ] Debug logs show correct UUID being passed

---

## 📁 Files Changed

### Backend
- ✅ `supabase/sql/017_payment_backfill.sql` - **NEW** (migration script)
- ✅ `src/routes/payments.ts` - **MODIFIED** (added debug logging)

### Frontend
- ⏳ `src/components/payments/PaymentsModal.tsx` - **PENDING** (add debug logging + warning banner)

### Documentation
- ✅ This file - Complete guide

---

## 🚀 Deployment Steps

### Step 1: Run Migration

```bash
# Option A: Supabase Dashboard
# 1. Open SQL Editor
# 2. Copy 017_payment_backfill.sql
# 3. Paste and run

# Option B: psql
psql <connection_string> -f supabase/sql/017_payment_backfill.sql
```

### Step 2: Verify Results

```sql
-- Check Dino Alić reservation
SELECT 
    r.id,
    r.customer_name,
    r.paid_amount,
    (SELECT COUNT(*) FROM payments WHERE reservation_id = r.id) as payment_count
FROM reservations r
WHERE r.customer_name LIKE '%Dino Alić%';
```

### Step 3: Test in UI

1. Open Reservations page
2. Find Dino Alić reservation
3. Click "Plaćanja" button
4. Verify payment history shows 200 BAM payment
5. Verify no warning banner appears

### Step 4: Add Frontend Improvements (Optional)

- Add debug logging to PaymentsModal
- Add warning banner for future inconsistencies
- Test with browser console open

---

## 💡 Prevention

**Going Forward**:
- ✅ All `paid_amount` updates come from database trigger
- ✅ CSV imports create payment records (not just set paid_amount)
- ✅ Transactions table migration creates payment records
- ✅ No direct updates to `paid_amount` column

**Monitoring**:
```sql
-- Run weekly to check for new inconsistencies
SELECT COUNT(*) as inconsistent_count
FROM reservations r
WHERE r.paid_amount > 0
  AND NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.reservation_id = r.id AND p.status = 'succeeded'
  );
```

**Expected**: Always 0

---

## 📖 Related Documentation

- `FINANCIAL_TRUTH_FIELDS.md` - Database trigger implementation
- `PHASE1_QA_REPORT.md` - Testing scenarios
- `PHASE1_COMPLETE.md` - Overall implementation

---

## ✅ Summary

**Problem**: Reservations with `paid_amount` but no payment records  
**Root Cause**: Legacy CSV imports set `paid_amount` directly  
**Solution**: Backfill migration creates adjustment payment records  
**Status**: ✅ Migration script ready, ⏳ Awaiting execution  

**Next Action**: Run `017_payment_backfill.sql` migration! 🚀

---

**End of Documentation**
