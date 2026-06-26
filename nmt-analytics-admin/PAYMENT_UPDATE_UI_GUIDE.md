# Payment Update UI Implementation Guide

**File:** `src/pages/Reservations.tsx`  
**Date:** 2026-01-11

---

## 📝 Implementation Steps

### **Step 1: Add Imports**

Add `FormModal` and `updateReservation` to existing imports:

```diff
 import { useState, useEffect } from "react";
 import {
   Table,
   TableBody,
   TableCell,
   TableHeader,
   TableRow,
 } from "../components/ui/table";
 import Badge from "../components/ui/badge/Badge";
 import Select from "../components/form/Select";
 import Button from "../components/ui/button/Button";
 import ImportModal from "../components/import/ImportModal";
+import { FormModal } from "../components/ui/FormModal";
 import { FileIcon } from "../icons";
 import { useToast } from "../context/ToastContext";
 import { formatCurrency, formatDate, calculateRemainingAmount } from "../utils/business";
 import {
   getReservations,
   downloadVoucher,
   generateDocument,
+  updateReservation,
   Reservation,
   ReservationListResponse,
   ReservationFilters
 } from "../api/reservations";
```

---

### **Step 2: Add State Variables**

Add these state variables after the existing state declarations (around line 35):

```typescript
// Add after line 35: const [isImportOpen, setIsImportOpen] = useState(false);

// Payment update modal state
const [paymentModalOpen, setPaymentModalOpen] = useState(false);
const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
```

---

### **Step 3: Add Payment Update Handler**

Add this handler after `handleGenerateOffer` (around line 99):

```typescript
// Add after handleGenerateOffer function

const handleUpdatePayment = (reservation: Reservation) => {
  setSelectedReservation(reservation);
  setPaymentModalOpen(true);
};

const handlePaymentSubmit = async (formData: any) => {
  if (!selectedReservation) return;

  try {
    const paidAmount = Number(formData.paidAmount);
    
    // Validate paid amount
    if (paidAmount < 0) {
      showError('Paid amount cannot be negative');
      return;
    }
    
    if (paidAmount > selectedReservation.totalAmount) {
      showError('Paid amount cannot exceed total amount');
      return;
    }

    await updateReservation(selectedReservation.id, { paidAmount });
    showSuccess('Payment updated successfully');
    setPaymentModalOpen(false);
    
    // Refresh the list
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  } catch (err: any) {
    // Use backend error message if available
    const errorMessage = err.response?.data?.message || err.message || 'Failed to update payment';
    showError(errorMessage);
    throw err; // Re-throw to let FormModal handle the error state
  }
};
```

**Note:** Add `success: showSuccess` to the `useToast()` destructuring on line 28:

```diff
-const { error: showError } = useToast();
+const { error: showError, success: showSuccess } = useToast();
```

---

### **Step 4: Add "Update Payment" Button**

Add the button in the Actions column (around line 284-299):

```diff
 <TableCell className="px-4 py-3">
   <div className="flex gap-2">
+    <Button
+      size="sm"
+      variant="outline"
+      onClick={() => handleUpdatePayment(reservation)}
+    >
+      Update Payment
+    </Button>
     <Button
       size="sm"
       variant="outline"
       onClick={() => handleGenerateOffer(reservation.id)}
     >
       Generate Offer
     </Button>
     <Button
       size="sm"
       variant="outline"
       onClick={() => handleDownloadVoucher(reservation.id)}
     >
       Voucher (PDF)
     </Button>
   </div>
 </TableCell>
```

---

### **Step 5: Add Payment Modal**

Add the modal component before the closing `</div>` of the main container (around line 355, before ImportModal):

```typescript
{/* Payment Update Modal */}
<FormModal
  isOpen={paymentModalOpen}
  onClose={() => setPaymentModalOpen(false)}
  title="Update Payment"
  fields={[
    {
      name: 'paidAmount',
      label: 'Paid Amount',
      type: 'number',
      placeholder: '0.00',
      required: true,
    }
  ]}
  initialData={{
    paidAmount: selectedReservation?.paidAmount || 0
  }}
  onSubmit={handlePaymentSubmit}
  submitButtonText="Save"
/>

{/* Import Modal */}
<ImportModal
  isOpen={isImportOpen}
  onClose={() => setIsImportOpen(false)}
  entityType="reservation"
  onSuccess={() => {
    setIsImportOpen(false);
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  }}
/>
```

---

## 📋 Complete Code Snippets

### **State Variables (Add after line 35):**

```typescript
const [isImportOpen, setIsImportOpen] = useState(false);

// Payment update modal state
const [paymentModalOpen, setPaymentModalOpen] = useState(false);
const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
```

---

### **Handler Functions (Add after line 99):**

```typescript
const handleUpdatePayment = (reservation: Reservation) => {
  setSelectedReservation(reservation);
  setPaymentModalOpen(true);
};

const handlePaymentSubmit = async (formData: any) => {
  if (!selectedReservation) return;

  try {
    const paidAmount = Number(formData.paidAmount);
    
    // Validate paid amount
    if (paidAmount < 0) {
      showError('Paid amount cannot be negative');
      return;
    }
    
    if (paidAmount > selectedReservation.totalAmount) {
      showError('Paid amount cannot exceed total amount');
      return;
    }

    await updateReservation(selectedReservation.id, { paidAmount });
    showSuccess('Payment updated successfully');
    setPaymentModalOpen(false);
    
    // Refresh the list
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  } catch (err: any) {
    // Use backend error message if available
    const errorMessage = err.response?.data?.message || err.message || 'Failed to update payment';
    showError(errorMessage);
    throw err; // Re-throw to let FormModal handle the error state
  }
};
```

---

### **Button in Actions Column (Insert at line 284):**

```typescript
<Button
  size="sm"
  variant="outline"
  onClick={() => handleUpdatePayment(reservation)}
>
  Update Payment
</Button>
```

---

### **Modal Component (Add before ImportModal, around line 355):**

```typescript
{/* Payment Update Modal */}
<FormModal
  isOpen={paymentModalOpen}
  onClose={() => setPaymentModalOpen(false)}
  title="Update Payment"
  fields={[
    {
      name: 'paidAmount',
      label: 'Paid Amount',
      type: 'number',
      placeholder: '0.00',
      required: true,
    }
  ]}
  initialData={{
    paidAmount: selectedReservation?.paidAmount || 0
  }}
  onSubmit={handlePaymentSubmit}
  submitButtonText="Save"
/>
```

---

## 🎨 Enhanced Version with Hint Text

If you want to add hint text below the input field, modify the modal to use a custom field renderer:

```typescript
{/* Payment Update Modal - Enhanced Version */}
<FormModal
  isOpen={paymentModalOpen}
  onClose={() => setPaymentModalOpen(false)}
  title="Update Payment"
  fields={[
    {
      name: 'paidAmount',
      label: `Paid Amount (Total: ${formatCurrency(selectedReservation?.totalAmount || 0)})`,
      type: 'number',
      placeholder: '0.00',
      required: true,
    }
  ]}
  initialData={{
    paidAmount: selectedReservation?.paidAmount || 0
  }}
  onSubmit={handlePaymentSubmit}
  submitButtonText="Save"
/>
```

**Add hint text in the modal body:**

Since `FormModal` doesn't support hint text directly, you can add it in the modal title or create a custom modal. For simplicity, we'll add it to the label as shown above.

---

## 📊 User Flow

1. **User clicks "Update Payment"** on a reservation row
2. **Modal opens** with:
   - Title: "Update Payment"
   - Input field: "Paid Amount" (pre-filled with current value)
   - Label shows total amount for reference
   - Save and Cancel buttons
3. **User enters new amount** (e.g., 500)
4. **User clicks "Save"**
5. **Validation:**
   - ✅ Check if amount >= 0
   - ✅ Check if amount <= total
6. **API call:** `updateReservation(id, { paidAmount: 500 })`
7. **On success:**
   - ✅ Show success toast
   - ✅ Close modal
   - ✅ Refresh reservation list
8. **On error:**
   - ❌ Show error toast with backend message
   - ❌ Keep modal open

---

## 🧪 Testing Scenarios

### **Test 1: Valid Update**
1. Click "Update Payment" on a reservation with total = 1000
2. Enter 500
3. Click "Save"
4. **Expected:** Success toast, modal closes, list refreshes, paid amount shows 500

### **Test 2: Overpayment**
1. Click "Update Payment" on a reservation with total = 1000
2. Enter 1500
3. Click "Save"
4. **Expected:** Error toast "Paid amount cannot exceed total amount", modal stays open

### **Test 3: Negative Amount**
1. Click "Update Payment"
2. Enter -100
3. Click "Save"
4. **Expected:** Error toast "Paid amount cannot be negative", modal stays open

### **Test 4: Backend Error**
1. Click "Update Payment"
2. Enter valid amount
3. Backend returns error (e.g., database constraint)
4. **Expected:** Error toast with backend message, modal stays open

### **Test 5: Full Payment**
1. Click "Update Payment" on a reservation with total = 1000
2. Enter 1000
3. Click "Save"
4. **Expected:** Success toast, remaining amount shows 0

---

## 📝 Notes

### **State Variables:**
- `paymentModalOpen`: Controls modal visibility
- `selectedReservation`: Stores the reservation being edited

### **Validation:**
- Frontend validates: `paidAmount >= 0` and `paidAmount <= totalAmount`
- Backend validates: Same constraints via Zod and database constraints
- Error messages use backend message if available

### **Error Handling:**
- Frontend validation errors: Show immediately
- Backend errors: Extract from `err.response.data.message`
- Fallback: Generic "Failed to update payment"

### **Refresh Strategy:**
- After successful update, call `fetchReservations()` with current filters
- This ensures the list shows updated values
- No need for manual state updates

---

## ✅ Checklist

- [ ] Add `FormModal` import
- [ ] Add `updateReservation` import
- [ ] Add `success: showSuccess` to `useToast()`
- [ ] Add `paymentModalOpen` state
- [ ] Add `selectedReservation` state
- [ ] Add `handleUpdatePayment` function
- [ ] Add `handlePaymentSubmit` function
- [ ] Add "Update Payment" button in Actions column
- [ ] Add `FormModal` component before `ImportModal`
- [ ] Test valid payment update
- [ ] Test overpayment (should fail)
- [ ] Test negative payment (should fail)
- [ ] Test backend error handling

---

**Status:** ✅ **READY TO IMPLEMENT** - All code snippets provided with exact insertion points!
