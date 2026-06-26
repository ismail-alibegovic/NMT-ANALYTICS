# Reservation Payment Tracking Validation Report

**Date:** 2026-01-11  
**Focus:** Updating `paid_amount` and displaying remaining/total amounts  
**Status:** ⚠️ **PARTIALLY BROKEN** - Missing backend support

---

## 📊 Validation Summary

| Aspect | Status | Details |
|--------|:------:|---------|
| **Frontend API Client** | ✅ **OK** | Accepts `paidAmount` in update |
| **Backend Schema Validation** | ❌ **MISSING** | `paidAmount` NOT in Zod schema |
| **Database Column** | ⚠️ **CONDITIONAL** | Exists after migration |
| **Database Constraints** | ✅ **OK** | Enforces `paid_amount <= total_amount` |
| **UI Display** | ✅ **OK** | Shows paid, total, remaining |
| **UI Update Form** | ❌ **MISSING** | No form to update `paid_amount` |

---

## 🔍 Detailed Analysis

### **1. Frontend API Client**

**File:** `src/api/reservations.ts`

**Interface (Lines 30-34):**
```typescript
export interface UpdateReservationData {
  status?: Reservation['status'];
  paidAmount?: number;  // ✅ Accepts paidAmount
  notes?: string;
}
```

**Update Function (Lines 92-94):**
```typescript
export async function updateReservation(
  id: string, 
  reservationData: UpdateReservationData
): Promise<Reservation> {
  const { data } = await patch<Reservation>(`/reservations/${id}`, reservationData);
  return data;
}
```

**Status:** ✅ **OK** - Frontend can send `paidAmount`

---

### **2. Backend Validation Schema**

**File:** `src/routes/reservations.ts`

**Update Schema (Lines 44-55):**
```typescript
const updateReservationSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  departureId: z.string().uuid('Invalid departure ID').optional(),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  totalAmount: z.number().min(0, 'Total amount must be non-negative').optional(),
  reservationAt: z.string().datetime('Invalid datetime format').optional(),
  partySize: z.number().int().min(1, 'Party size must be at least 1').optional(),
  customerName: z.string().min(1, 'Customer name is required').optional(),
  customerPhone: z.string().optional(),
  currency: z.string().optional(),
  source: z.enum(['web', 'phone', 'agent', 'walk-in', 'other']).optional(),
  // ❌ MISSING: paidAmount field
});
```

**Problem:**
- Frontend sends `paidAmount`
- Backend schema does NOT accept `paidAmount`
- Request will be validated, but `paidAmount` will be **ignored**

**Status:** ❌ **BROKEN** - `paidAmount` not in schema

---

### **3. Database Column**

**Base Schema (001_init.sql:67-81):**
```sql
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    party_size INT NOT NULL DEFAULT 1,
    reservation_at TIMESTAMPTZ NOT NULL,
    status TEXT CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- ❌ MISSING: paid_amount column
);
```

**Migration (002_crud_fixes.sql:47-82):**
```sql
-- Add missing paid_amount column
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0;

-- Add CHECK constraint for paid_amount >= 0
ALTER TABLE reservations ADD CONSTRAINT reservations_paid_amount_check 
  CHECK (paid_amount >= 0);

-- Add CHECK constraint for paid_amount <= total_amount
ALTER TABLE reservations ADD CONSTRAINT reservations_paid_lte_total_check 
  CHECK (paid_amount <= total_amount);

-- Add index for paid_amount queries
CREATE INDEX IF NOT EXISTS idx_reservations_paid_amount ON reservations(org_id, paid_amount);
```

**Status:** ⚠️ **CONDITIONAL** - Column exists after running migration

---

### **4. Database Constraints**

**Constraint 1: Non-negative (Line 57-59):**
```sql
CHECK (paid_amount >= 0)
```
✅ Prevents negative payments

**Constraint 2: Cannot exceed total (Lines 69-70):**
```sql
CHECK (paid_amount <= total_amount)
```
✅ Prevents overpayment

**Status:** ✅ **OK** - Constraints are correct

---

### **5. UI Display**

**File:** `src/pages/Reservations.tsx`

**Display Logic (Lines 271-279):**
```typescript
<TableCell className="px-4 py-3 text-gray-800 text-theme-sm dark:text-white/90 font-medium">
  {formatCurrency(reservation.totalAmount)}
</TableCell>
<TableCell className="px-4 py-3 text-success-600 text-theme-sm dark:text-success-500">
  {formatCurrency(reservation.paidAmount)}  // ✅ Shows paid amount
</TableCell>
<TableCell className="px-4 py-3 text-error-600 text-theme-sm dark:text-error-500">
  {formatCurrency(calculateRemainingAmount(reservation.totalAmount, reservation.paidAmount))}
  // ✅ Calculates and shows remaining amount
</TableCell>
```

**Calculation (utils/business.ts):**
```typescript
export function calculateRemainingAmount(total: number, paid: number): number {
  const remaining = total - paid;
  // Handle floating point precision
  return Math.abs(remaining) < 0.01 ? 0 : Math.max(0, remaining);
}
```

**Status:** ✅ **OK** - Display logic is correct

---

### **6. UI Update Form**

**Problem:**
- No form/modal to update `paid_amount`
- Only actions available: "Generate Offer" and "Voucher (PDF)"
- No "Edit" or "Update Payment" button

**Status:** ❌ **MISSING** - No UI to update payments

---

## 🐛 Issues Found

### **Issue 1: Missing `paidAmount` in Backend Schema** 🔴 **CRITICAL**

**Severity:** 🔴 **CRITICAL**

**Location:** `src/routes/reservations.ts:44-55`

**Problem:**
```typescript
const updateReservationSchema = z.object({
  status: z.enum([...]).optional(),
  totalAmount: z.number().min(0, ...).optional(),
  // ❌ MISSING: paidAmount
});
```

**Impact:**
- Frontend can send `paidAmount`
- Backend validation **ignores** it
- Database is never updated
- Payment tracking **does not work**

**Fix:**
```diff
@@ -44,6 +44,7 @@
 const updateReservationSchema = z.object({
   status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
   departureId: z.string().uuid('Invalid departure ID').optional(),
   customerId: z.string().uuid('Invalid customer ID').optional(),
   totalAmount: z.number().min(0, 'Total amount must be non-negative').optional(),
+  paidAmount: z.number().min(0, 'Paid amount must be non-negative').optional(),
   reservationAt: z.string().datetime('Invalid datetime format').optional(),
   partySize: z.number().int().min(1, 'Party size must be at least 1').optional(),
```

---

### **Issue 2: Missing Update Logic in PATCH Handler** 🔴 **CRITICAL**

**Severity:** 🔴 **CRITICAL**

**Location:** `src/routes/reservations.ts:230-400` (PATCH handler)

**Problem:**
Even if we add `paidAmount` to the schema, the PATCH handler doesn't map it to `paid_amount` for the database update.

**Current Handler (Lines 230-400):**
```typescript
router.patch('/reservations/:id', authenticateToken, requireOrgContext, async (req, res) => {
  // ... validation ...
  const updates = validationResult.data;
  
  // ... capacity management logic ...
  
  // Update reservation
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('reservations')
    .update({
      status: updates.status,
      departure_id: updates.departureId,
      customer_id: updates.customerId,
      total_amount: updates.totalAmount,
      reservation_at: updates.reservationAt,
      party_size: updates.partySize,
      customer_name: updates.customerName,
      customer_phone: updates.customerPhone,
      currency: updates.currency,
      source: updates.source,
      // ❌ MISSING: paid_amount: updates.paidAmount
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();
});
```

**Fix:**
```diff
@@ -350,6 +350,7 @@
       customer_phone: updates.customerPhone,
       currency: updates.currency,
       source: updates.source,
+      paid_amount: updates.paidAmount,
     })
     .eq('id', id)
     .eq('org_id', orgId)
```

---

### **Issue 3: No UI Form to Update Payment** ⚠️ **MEDIUM**

**Severity:** ⚠️ **MEDIUM**

**Location:** `src/pages/Reservations.tsx`

**Problem:**
- UI displays `paidAmount` and `remainingAmount`
- But there's no form/modal to update the payment
- Only actions: "Generate Offer" and "Voucher (PDF)"

**Impact:**
- Users cannot update payment amounts through UI
- Must use API directly or database

**Fix:**
Add an "Edit Payment" button and modal:

```typescript
// Add to Reservations.tsx
const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
const [paymentModalOpen, setPaymentModalOpen] = useState(false);

const handleUpdatePayment = async (reservationId: string, paidAmount: number) => {
  try {
    await updateReservation(reservationId, { paidAmount });
    showSuccess('Payment updated successfully');
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  } catch (err: any) {
    showError('Failed to update payment');
  }
};

// Add button in table actions
<Button
  size="sm"
  variant="outline"
  onClick={() => {
    setEditingReservation(reservation);
    setPaymentModalOpen(true);
  }}
>
  Update Payment
</Button>
```

---

## ✅ What's Working

### **1. Database Constraints** ✅

```sql
-- Prevents negative payments
CHECK (paid_amount >= 0)

-- Prevents overpayment
CHECK (paid_amount <= total_amount)
```

**Edge Cases Handled:**
- ✅ `paid_amount = 0` → Allowed
- ✅ `paid_amount = total_amount` → Allowed
- ✅ `paid_amount > total_amount` → **REJECTED** by constraint

---

### **2. UI Display Logic** ✅

```typescript
// Shows total amount
{formatCurrency(reservation.totalAmount)}

// Shows paid amount
{formatCurrency(reservation.paidAmount)}

// Calculates and shows remaining
{formatCurrency(calculateRemainingAmount(reservation.totalAmount, reservation.paidAmount))}
```

**Calculation:**
```typescript
export function calculateRemainingAmount(total: number, paid: number): number {
  const remaining = total - paid;
  return Math.abs(remaining) < 0.01 ? 0 : Math.max(0, remaining);
}
```

**Edge Cases Handled:**
- ✅ Floating point precision (< 0.01 → 0)
- ✅ Negative remaining → 0

---

### **3. Frontend API Client** ✅

```typescript
export interface UpdateReservationData {
  paidAmount?: number;  // ✅ Accepts paidAmount
}

export async function updateReservation(
  id: string, 
  reservationData: UpdateReservationData
): Promise<Reservation> {
  const { data } = await patch<Reservation>(`/reservations/${id}`, reservationData);
  return data;
}
```

---

## 🧪 Edge Case Testing

### **Test 1: paid_amount = 0**

**Request:**
```json
PATCH /api/reservations/:id
{
  "paidAmount": 0
}
```

**Expected:**
- ✅ Allowed by constraint (`>= 0`)
- ✅ Remaining = total_amount
- ✅ UI shows full amount remaining

**Status:** ✅ **WILL WORK** (after fixes)

---

### **Test 2: paid_amount = total_amount**

**Request:**
```json
PATCH /api/reservations/:id
{
  "paidAmount": 1000  // total_amount = 1000
}
```

**Expected:**
- ✅ Allowed by constraint (`<= total_amount`)
- ✅ Remaining = 0
- ✅ UI shows "Fully Paid"

**Status:** ✅ **WILL WORK** (after fixes)

---

### **Test 3: paid_amount > total_amount**

**Request:**
```json
PATCH /api/reservations/:id
{
  "paidAmount": 1500  // total_amount = 1000
}
```

**Expected:**
- ❌ **REJECTED** by database constraint
- Error: `new row for relation "reservations" violates check constraint "reservations_paid_lte_total_check"`
- Frontend should show clear error message

**Database Response:**
```json
{
  "message": "Failed to update reservation",
  "code": "DATABASE_ERROR",
  "details": "paid_amount must be <= total_amount"
}
```

**Status:** ✅ **WILL FAIL GRACEFULLY** (after fixes)

---

## 🔧 Required Fixes

### **Fix 1: Add `paidAmount` to Backend Schema** 🔴 **CRITICAL**

**File:** `src/routes/reservations.ts`

**Line 44-55:**
```diff
 const updateReservationSchema = z.object({
   status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
   departureId: z.string().uuid('Invalid departure ID').optional(),
   customerId: z.string().uuid('Invalid customer ID').optional(),
   totalAmount: z.number().min(0, 'Total amount must be non-negative').optional(),
+  paidAmount: z.number().min(0, 'Paid amount must be non-negative').optional(),
   reservationAt: z.string().datetime('Invalid datetime format').optional(),
   partySize: z.number().int().min(1, 'Party size must be at least 1').optional(),
   customerName: z.string().min(1, 'Customer name is required').optional(),
   customerPhone: z.string().optional(),
   currency: z.string().optional(),
   source: z.enum(['web', 'phone', 'agent', 'walk-in', 'other']).optional(),
 });
```

---

### **Fix 2: Add `paid_amount` to Update Logic** 🔴 **CRITICAL**

**File:** `src/routes/reservations.ts`

**Find the PATCH handler update logic (around line 350) and add:**
```diff
 const { data: updated, error: updateErr } = await supabaseAdmin
   .from('reservations')
   .update({
     status: updates.status,
     departure_id: updates.departureId,
     customer_id: updates.customerId,
     total_amount: updates.totalAmount,
+    paid_amount: updates.paidAmount,
     reservation_at: updates.reservationAt,
     party_size: updates.partySize,
     customer_name: updates.customerName,
     customer_phone: updates.customerPhone,
     currency: updates.currency,
     source: updates.source,
   })
   .eq('id', id)
   .eq('org_id', orgId)
   .select()
   .single();
```

---

### **Fix 3: Run Database Migration** ⚠️ **REQUIRED**

```bash
cd /Users/ismailalibegovic/Documents/NMT\ Projects/nmt-analytics-api
psql -h <host> -U <user> -d <database> -f supabase/sql/002_crud_fixes.sql
```

**This adds:**
- `paid_amount` column (NUMERIC(12, 2) DEFAULT 0)
- Constraint: `paid_amount >= 0`
- Constraint: `paid_amount <= total_amount`
- Index for queries

---

### **Fix 4: Add UI Form (Optional but Recommended)** ⚠️ **MEDIUM**

**File:** `src/pages/Reservations.tsx`

Add a modal/form to update payment:

```typescript
const handleUpdatePayment = async (reservationId: string, paidAmount: number) => {
  try {
    await updateReservation(reservationId, { paidAmount });
    showSuccess('Payment updated successfully');
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  } catch (err: any) {
    showError(err.message || 'Failed to update payment');
  }
};
```

---

## 📊 Final Status

### **Overall:** ⚠️ **PARTIALLY BROKEN**

**Summary:**
- ✅ Frontend API client ready
- ❌ Backend schema missing `paidAmount`
- ❌ Backend update logic missing `paid_amount`
- ⚠️ Database column missing (needs migration)
- ✅ Database constraints correct
- ✅ UI display logic correct
- ❌ UI update form missing

**Blockers:**
1. Backend schema doesn't accept `paidAmount`
2. Backend update logic doesn't map to `paid_amount`
3. Database column missing (needs migration)
4. No UI form to update payments

**After Fixes:**
- ✅ Payment tracking will work
- ✅ Edge cases handled correctly
- ✅ Constraints enforced
- ✅ UI updates correctly

---

## ✅ Verification Checklist

After applying fixes:

- [ ] Run migration: `002_crud_fixes.sql`
- [ ] Verify column: `\d reservations` (should show `paid_amount`)
- [ ] Test update: `PATCH /api/reservations/:id { "paidAmount": 500 }`
- [ ] Verify constraint: Try `paidAmount > totalAmount` (should fail)
- [ ] Check UI: Verify remaining amount recalculates
- [ ] Test edge case: `paidAmount = 0`
- [ ] Test edge case: `paidAmount = totalAmount`
- [ ] Verify no context refetch after update

---

**Status:** ⚠️ **REQUIRES FIXES** - Payment tracking is broken until backend schema and logic are updated.
