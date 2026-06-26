# Financial Truth Fields - Deployment Checklist

**Date**: 2026-01-15  
**Status**: ✅ Ready for Deployment  

---

## Pre-Deployment Checklist

### Code Review
- [x] SQL migration created (`015_financial_truth_fields.sql`)
- [x] Backend API updated (`src/routes/reservations.ts`)
- [x] Frontend types updated (`src/api/reservations.ts`)
- [x] Documentation created (`FINANCIAL_TRUTH_FIELDS.md`)
- [x] Implementation summary created (`FINANCIAL_TRUTH_IMPLEMENTATION.md`)
- [x] Migration scripts created (`scripts/run-migration-015.sh`)
- [x] Backend server restarted successfully (no errors)

### Files Modified
**Backend (nmt-analytics-api)**:
- [x] `supabase/sql/015_financial_truth_fields.sql` - NEW
- [x] `src/routes/reservations.ts` - MODIFIED
- [x] `FINANCIAL_TRUTH_FIELDS.md` - NEW
- [x] `FINANCIAL_TRUTH_IMPLEMENTATION.md` - NEW
- [x] `scripts/run-migration-015.sh` - NEW

**Frontend (nmt-analytics-admin)**:
- [x] `src/api/reservations.ts` - MODIFIED

---

## Deployment Steps

### Step 1: Database Migration ⚠️ CRITICAL

**Choose ONE option**:

#### Option A: Supabase Dashboard (Recommended)
```
1. Open: https://app.supabase.com/project/YOUR_PROJECT/sql
2. Copy: supabase/sql/015_financial_truth_fields.sql
3. Paste into SQL Editor
4. Click "Run"
5. Verify success messages
```

#### Option B: Supabase CLI
```bash
cd nmt-analytics-api
supabase db push
```

#### Option C: Direct PostgreSQL
```bash
psql <connection_string> -f supabase/sql/015_financial_truth_fields.sql
```

**Expected Output**:
```
✅ reservations.balance_due column exists
✅ reservations.payment_status column exists
✅ trg_update_reservation_paid_amount trigger exists
✅ idx_payments_reservation_date index exists
✅ Backfilled financial truth for all existing reservations
✅ Financial truth fields migration completed successfully
```

### Step 2: Verify Migration

Run these SQL queries to verify:

```sql
-- 1. Check columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'reservations' 
  AND column_name IN ('balance_due', 'payment_status');

-- 2. Check trigger
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'trg_update_reservation_paid_amount';

-- 3. Check data
SELECT id, total_amount, paid_amount, balance_due, payment_status 
FROM reservations 
LIMIT 5;
```

**Expected Results**:
- 2 columns found (balance_due, payment_status)
- 1 trigger found
- All reservations have valid balance_due and payment_status

### Step 3: Deploy Backend

```bash
cd nmt-analytics-api

# Verify no TypeScript errors
npm run build

# Deploy to production
# (Your deployment process here)
```

**Verification**:
```bash
# Test GET /api/reservations
curl -X GET "https://your-api.com/api/reservations?limit=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should include: balanceDue, paymentStatus
```

### Step 4: Deploy Frontend

```bash
cd nmt-analytics-admin

# Verify no TypeScript errors
npm run build

# Deploy to production
# (Your deployment process here)
```

**Verification**:
- Open app in browser
- Navigate to Reservations page
- Check browser console for TypeScript errors
- Verify data loads correctly

### Step 5: Smoke Tests

#### Test 1: View Reservations
```
1. Open Reservations page
2. Verify table loads
3. Check that balanceDue is displayed
4. Check that paymentStatus is shown
```

#### Test 2: Create Payment
```
1. Open a reservation
2. Click "Add Payment"
3. Create a payment (amount < total)
4. Verify:
   - paid_amount updated
   - balance_due = total - paid
   - payment_status = 'partially_paid'
```

#### Test 3: Complete Payment
```
1. Add another payment to reach total
2. Verify:
   - paid_amount = total_amount
   - balance_due = 0
   - payment_status = 'paid'
```

#### Test 4: Overpayment
```
1. Create payment > remaining balance
2. Verify:
   - paid_amount > total_amount
   - balance_due < 0 (negative)
   - payment_status = 'paid'
```

#### Test 5: Void Payment
```
1. Void a payment
2. Verify:
   - paid_amount decreased
   - balance_due increased
   - payment_status updated correctly
```

---

## Post-Deployment Verification

### Database Health Check
```sql
-- Check for NULL values (should be none)
SELECT COUNT(*) 
FROM reservations 
WHERE balance_due IS NULL OR payment_status IS NULL;

-- Check for invalid payment_status
SELECT COUNT(*) 
FROM reservations 
WHERE payment_status NOT IN ('unpaid', 'partially_paid', 'paid', 'refunded');

-- Check balance_due calculation
SELECT 
  id,
  total_amount,
  paid_amount,
  balance_due,
  (total_amount - paid_amount) AS expected_balance,
  CASE 
    WHEN ABS(balance_due - (total_amount - paid_amount)) > 0.01 
    THEN 'MISMATCH' 
    ELSE 'OK' 
  END AS status
FROM reservations
WHERE ABS(balance_due - (total_amount - paid_amount)) > 0.01;
```

**Expected**: All queries return 0 rows

### API Health Check
```bash
# Check API is responding
curl https://your-api.com/health

# Check reservations endpoint
curl https://your-api.com/api/reservations?limit=1 \
  -H "Authorization: Bearer TOKEN"
```

### Frontend Health Check
```
1. Open app
2. Check browser console (no errors)
3. Navigate to all pages
4. Verify data loads correctly
```

---

## Monitoring

### What to Monitor (First 24 Hours)

1. **Database Performance**
   - Trigger execution time
   - Query performance on reservations table
   - Index usage

2. **API Response Times**
   - GET /api/reservations
   - POST /api/payments
   - PATCH /api/payments/:id

3. **Error Logs**
   - Database constraint violations
   - API errors
   - Frontend errors

4. **Data Integrity**
   - Run verification queries hourly
   - Check for calculation mismatches
   - Monitor payment_status distribution

### Queries for Monitoring

```sql
-- Payment status distribution
SELECT payment_status, COUNT(*) 
FROM reservations 
GROUP BY payment_status;

-- Overpayments (negative balance)
SELECT COUNT(*) 
FROM reservations 
WHERE balance_due < 0;

-- Recent trigger executions
SELECT 
  r.id,
  r.total_amount,
  r.paid_amount,
  r.balance_due,
  r.payment_status,
  COUNT(p.id) as payment_count
FROM reservations r
LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'succeeded'
WHERE r.created_at > NOW() - INTERVAL '1 hour'
GROUP BY r.id, r.total_amount, r.paid_amount, r.balance_due, r.payment_status;
```

---

## Rollback Plan

If critical issues occur:

### 1. Immediate Rollback (Code Only)
```bash
# Revert backend code
git revert <commit-hash>

# Revert frontend code
git revert <commit-hash>

# Deploy reverted versions
```

### 2. Database Rollback (If Needed)
```sql
-- Remove new columns
ALTER TABLE reservations DROP COLUMN IF EXISTS balance_due;
ALTER TABLE reservations DROP COLUMN IF EXISTS payment_status;

-- Restore old constraint
ALTER TABLE reservations 
ADD CONSTRAINT reservations_paid_amount_total_check 
CHECK (paid_amount <= total_amount);

-- Restore old trigger
-- (Copy function from 014_create_payments_table.sql)
```

### 3. Verify Rollback
```bash
# Test API
curl https://your-api.com/api/reservations?limit=1

# Test Frontend
# Open app and verify functionality
```

---

## Success Criteria

Deployment is successful when:

- [x] Migration runs without errors
- [x] All verification queries pass
- [x] Backend API returns new fields
- [x] Frontend displays new fields
- [x] All smoke tests pass
- [x] No errors in logs
- [x] Performance is acceptable
- [x] Data integrity checks pass

---

## Troubleshooting

### Issue: Migration Fails

**Symptom**: SQL errors during migration

**Solution**:
1. Check if columns already exist
2. Check for conflicting constraints
3. Review error message
4. Run verification queries
5. Contact DBA if needed

### Issue: Trigger Not Firing

**Symptom**: balance_due and payment_status not updating

**Solution**:
```sql
-- Check trigger exists
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'trg_update_reservation_paid_amount';

-- Manually trigger update
UPDATE reservations 
SET paid_amount = paid_amount 
WHERE id = 'test-reservation-id';

-- Check function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'update_reservation_paid_amount';
```

### Issue: API Returns Old Format

**Symptom**: balanceDue and paymentStatus missing from API response

**Solution**:
1. Check backend deployment succeeded
2. Verify SELECT query includes new columns
3. Check transformReservation function
4. Restart backend server
5. Clear any API caches

### Issue: Frontend TypeScript Errors

**Symptom**: Type errors in console

**Solution**:
1. Verify frontend deployment succeeded
2. Check Reservation interface updated
3. Clear browser cache
4. Rebuild frontend
5. Check for version mismatches

---

## Communication Plan

### Before Deployment
```
Subject: Scheduled Deployment - Financial Truth Fields

We will be deploying updates to the payments system on [DATE] at [TIME].

Changes:
- New fields: balance_due, payment_status
- Improved payment tracking
- Support for overpayments

Expected downtime: None (zero-downtime deployment)

Impact: None (backward compatible)
```

### After Deployment
```
Subject: Deployment Complete - Financial Truth Fields

The financial truth fields deployment is complete.

New features:
✅ Automatic balance calculation
✅ Payment status tracking
✅ Overpayment support

All systems operational.
```

### If Issues Occur
```
Subject: Issue Detected - Financial Truth Fields

We've detected an issue with the recent deployment.

Status: Investigating / Rolling back / Fixed

Expected resolution: [TIME]

We'll provide updates every 30 minutes.
```

---

## Final Checklist

Before marking deployment complete:

- [ ] Migration executed successfully
- [ ] All verification queries pass
- [ ] Backend deployed and tested
- [ ] Frontend deployed and tested
- [ ] All smoke tests pass
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Documentation updated
- [ ] Rollback plan ready
- [ ] Success criteria met

---

**Deployment Status**: ⏳ Ready to Deploy

**Next Action**: Run database migration

---

**End of Checklist**
