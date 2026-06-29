import { useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { createPayment, CreatePaymentInput } from '../../api/payments';
import { useToast } from '../../context/ToastContext';

interface AddPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    reservationId: string;
    reservationCurrency?: string; // Currency from reservation (source of truth)
    onPaymentCreated?: (updatedReservation?: { paidAmount: number; totalAmount: number }) => void;
}

export default function AddPaymentModal({
    isOpen,
    onClose,
    reservationId,
    reservationCurrency = 'BAM', // Default to BAM if not provided
    onPaymentCreated,
}: AddPaymentModalProps) {
    const { error: showError, success: showSuccess } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [amount, setAmount] = useState<string>('');
    // Currency is set from reservation and is read-only
    const currency = reservationCurrency;
    const [status, setStatus] = useState<string>('succeeded');
    const [paymentMethod, setPaymentMethod] = useState<string>("");
    const paymentMethodOptions = [
        { value: "cash", label: "Gotovina" },
        { value: "card", label: "Kartica" },
        { value: "bank_transfer", label: "Bankovni transfer" },
        { value: "credit", label: "Kredit" },
    ];
    const [paymentDate, setPaymentDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

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
            const paymentData: CreatePaymentInput = {
                reservation_id: reservationId,
                amount: amountNum,
                currency,
                status: status as any,
                payment_date: paymentDate || undefined,
                paymentMethod: paymentMethod || undefined,
            };

            const result = await createPayment(paymentData);

            showSuccess('Plaćanje uspješno dodano');

            // Reset form
            setAmount('');
            setStatus('succeeded');
            setPaymentDate(new Date().toISOString().split('T')[0]);

            // Notify parent with updated reservation data
            if (onPaymentCreated) {
                if (result.reservation) {
                    onPaymentCreated({
                        paidAmount: result.reservation.paidAmount,
                        totalAmount: result.reservation.totalAmount,
                    });
                } else {
                    onPaymentCreated();
                }
            }

            onClose();
        } catch (err: any) {
            console.error('Failed to create payment:', err);
            showError(err.message || 'Failed to create payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setAmount('');
            setStatus('succeeded');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Dodaj plaćanje"
            className="max-w-md"
        >
            <div className="p-6">
                <div className="space-y-4">
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

                    {/* Currency (Read-only) and Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="currency">Valuta</Label>
                            <input
                                id="currency"
                                type="text"
                                value={currency}
                                disabled
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 cursor-not-allowed"
                                title="Valuta se preuzima iz rezervacije"
                            />
                        </div>

                        <div>
                            <Label htmlFor="status">Status</Label>
                            <Select
                                options={statusOptions}
                                defaultValue={status}
                                onChange={setStatus}
                            />
                        </div>
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
                            <option value="">Odaberite način</option>
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
                            {isSubmitting ? 'Dodavanje...' : 'Dodaj plaćanje'}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
