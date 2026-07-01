import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { updatePayment, Payment } from '../../api/payments';
import { useToast } from '../../context/ToastContext';

interface EditPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    payment: Payment;
    onPaymentUpdated?: () => void;
}

export default function EditPaymentModal({
    isOpen,
    onClose,
    payment,
    onPaymentUpdated,
}: EditPaymentModalProps) {
    const { error: showError, success: showSuccess } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [amount, setAmount] = useState<string>(payment.amount.toString());
    const [status, setStatus] = useState<string>(payment.status);
    const [paymentDate, setPaymentDate] = useState<string>(payment.paymentDate || '');
    const [paymentMethod, setPaymentMethod] = useState<string>(payment.paymentMethod || '');

    // Update form when payment changes
    useEffect(() => {
        setAmount(payment.amount.toString());
        setStatus(payment.status);
        setPaymentDate(payment.paymentDate || '');
        setPaymentMethod(payment.paymentMethod || '');
    }, [payment]);

    const paymentMethodOptions = [
        { value: '', label: 'Bez promjene' },
        { value: 'cash', label: 'Gotovina' },
        { value: 'card', label: 'Kartica' },
        { value: 'bank_transfer', label: 'Bankovni transfer' },
        { value: 'credit', label: 'Kredit' },
        { value: 'other', label: 'Ostalo' },
    ];

    const statusOptions = [
        { value: 'succeeded', label: 'Uspješno' },
        { value: 'pending', label: 'Na čekanju' },
        { value: 'failed', label: 'Neuspješno' },
        { value: 'refunded', label: 'Refundirano' },
        { value: 'cancelled', label: 'Otkazano' },
    ];

    const handleSubmit = async () => {
        const amountNum = parseFloat(amount);

        if (isNaN(amountNum) || amountNum <= 0) {
            showError('Unesite važeći iznos');
            return;
        }

        setIsSubmitting(true);
        try {
            await updatePayment(payment.id, {
                amount: amountNum,
                status: status as any,
                payment_method: paymentMethod || undefined,
                payment_date: paymentDate || undefined,
            });

            showSuccess('Plaćanje uspješno ažurirano');

            // Notify parent
            if (onPaymentUpdated) {
                onPaymentUpdated();
            }

            onClose();
        } catch (err: any) {
            console.error('Failed to update payment:', err);
            showError(err.message || 'Greška pri ažuriranju plaćanja');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            // Reset to original values
            setAmount(payment.amount.toString());
            setStatus(payment.status);
            setPaymentDate(payment.paymentDate || '');
            setPaymentMethod(payment.paymentMethod || '');
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Uredi plaćanje"
            className="max-w-md"
        >
            <div className="p-6">
                <div className="space-y-4">
                    {/* Payment ID (read-only) */}
                    <div>
                        <Label>ID plaćanja</Label>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                            {payment.id}
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <Label htmlFor="amount">Iznos *</Label>
                        <Input
                            id="amount"
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            step={0.01}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                            options={statusOptions}
                            defaultValue={status}
                            onChange={setStatus}
                        />
                    </div>

                    {/* Payment Method */}
                    <div>
                        <Label htmlFor="paymentMethod">Način plaćanja</Label>
                        <select
                            id="paymentMethod"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
                        >
                            {paymentMethodOptions.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Payment Date */}
                    <div>
                        <Label htmlFor="paymentDate">Datum plaćanja</Label>
                        <input
                            id="paymentDate"
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
                        />
                    </div>

                    {/* Warning */}
                    <div className="p-3 rounded-lg bg-warning-50 dark:bg-warning-950/20 border border-warning-200 dark:border-warning-800">
                        <p className="text-xs text-warning-700 dark:text-warning-400">
                            ⚠️ Promjene će automatski ažurirati saldo rezervacije.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="flex-1"
                        >
                            Odustani
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
                            className="bg-brand-500 hover:bg-brand-600 text-white flex-1"
                        >
                            {isSubmitting ? 'Ažuriranje...' : 'Ažuriraj'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
