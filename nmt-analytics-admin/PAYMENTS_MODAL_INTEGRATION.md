# PaymentsModal Integration Guide

## Quick Integration Steps

### 1. Add State (after line 42)

```typescript
// Edit modal state
const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
const [isEditModalOpen, setIsEditModalOpen] = useState(false);
```

### 2. Add Handlers (after handleUpdateStatus)

```typescript
const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setIsEditModalOpen(true);
};

const handlePaymentUpdated = async () => {
    await fetchPayments();
    if (onPaymentCreated) onPaymentCreated();
    setIsEditModalOpen(false);
    setEditingPayment(null);
};
```

### 3. Update handleVoidPayment (replace existing)

```typescript
const handleVoidPayment = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite otkazati ovo plaćanje?')) return;

    try {
        await voidPayment(id);
        showSuccess('Plaćanje otkazano');
        await fetchPayments();
        if (onPaymentCreated) onPaymentCreated(); // Refetch reservation
    } catch (err: any) {
        showError(err.message || 'Greška pri otkazivanju');
    }
};
```

### 4. Update Payment List Actions (around line 357-388)

Replace the action buttons section with:

```typescript
<div className="flex flex-col gap-2">
    {/* Edit Button */}
    <Button
        variant="outline"
        size="sm"
        onClick={() => handleEditPayment(payment)}
        className="text-xs py-1 h-auto text-brand-600 border-brand-200 hover:bg-brand-50"
    >
        Uredi
    </Button>
    
    {/* Void Button - only if not cancelled */}
    {payment.status !== 'cancelled' && (
        <Button
            variant="outline"
            size="sm"
            onClick={() => handleVoidPayment(payment.id)}
            className="text-xs py-1 h-auto text-red-500 border-red-200 hover:bg-red-50"
        >
            Otkaži
        </Button>
    )}
    
    {/* Refund Button - only if succeeded */}
    {payment.status === 'succeeded' && (
        <Button
            variant="outline"
            size="sm"
            onClick={() => handleUpdateStatus(payment.id, 'refunded')}
            className="text-xs py-1 h-auto text-info-600 border-info-200 hover:bg-info-50"
        >
            Refundiraj
        </Button>
    )}
    
    {/* Confirm Button - only if pending */}
    {payment.status === 'pending' && (
        <Button
            variant="outline"
            size="sm"
            onClick={() => handleUpdateStatus(payment.id, 'succeeded')}
            className="text-xs py-1 h-auto text-success-600 border-success-200 hover:bg-success-50"
        >
            Potvrdi
        </Button>
    )}
</div>
```

### 5. Add EditPaymentModal at the end (before closing Modal tag)

```typescript
{/* Edit Payment Modal */}
{editingPayment && (
    <EditPaymentModal
        isOpen={isEditModalOpen}
        onClose={() => {
            setIsEditModalOpen(false);
            setEditingPayment(null);
        }}
        payment={editingPayment}
        onPaymentUpdated={handlePaymentUpdated}
    />
)}
```

---

## Complete Code Snippet

Here's the complete section to replace in PaymentsModal.tsx:

```typescript
// Around line 155-177, update handlers:

const handleVoidPayment = async (id: string) => {
    if (!confirm('Jeste li sigurni da želite otkazati ovo plaćanje?')) return;

    try {
        await voidPayment(id);
        showSuccess('Plaćanje otkazano');
        await fetchPayments();
        if (onPaymentCreated) onPaymentCreated();
    } catch (err: any) {
        showError(err.message || 'Greška pri otkazivanju');
    }
};

const handleUpdateStatus = async (id: string, newStatus: any) => {
    try {
        await updatePayment(id, { status: newStatus });
        showSuccess(`Status promjenjen u ${getStatusLabel(newStatus)}`);
        await fetchPayments();
        if (onPaymentCreated) onPaymentCreated();
    } catch (err: any) {
        showError(err.message || 'Greška pri promjeni statusa');
    }
};

const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setIsEditModalOpen(true);
};

const handlePaymentUpdated = async () => {
    await fetchPayments();
    if (onPaymentCreated) onPaymentCreated();
    setIsEditModalOpen(false);
    setEditingPayment(null);
};
```

---

## Testing

After integration:

1. Open PaymentsModal for a reservation
2. Click "Uredi" on a payment → EditPaymentModal should open
3. Change amount/status/date → Click "Ažuriraj"
4. Verify payment list refreshes
5. Verify reservation balance updates
6. Click "Otkaži" on a payment → Confirmation dialog
7. Confirm → Verify payment status changes to "Otkazano"
8. Verify voided payment doesn't show "Otkaži" button

---

## Audit Log Verification

Check audit logs in database:

```sql
SELECT 
    action,
    entity,
    entity_id,
    details,
    created_at,
    user_id
FROM audit_logs
WHERE action IN ('payment.updated', 'payment.voided')
ORDER BY created_at DESC
LIMIT 10;
```

Should show entries for each edit/void action.

---

**Status**: Ready for integration ✅
