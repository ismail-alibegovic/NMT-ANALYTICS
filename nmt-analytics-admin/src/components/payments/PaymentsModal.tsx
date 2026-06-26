import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import {
    getPayments,
    createPayment,
    updatePayment,
    voidPayment,
    Payment,
    CreatePaymentInput
} from '../../api/payments';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate } from '../../utils/business';
import Badge from '../ui/badge/Badge';
import EditPaymentModal from './EditPaymentModal';

interface PaymentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    reservationId: string;
    reservationTotal: number;
    reservationPaid: number;
    reservationCurrency?: string; // Currency from reservation (source of truth)
    onPaymentCreated?: () => void;
}

export default function PaymentsModal({
    isOpen,
    onClose,
    reservationId,
    reservationTotal,
    reservationPaid,
    reservationCurrency = 'BAM', // Default to BAM if not provided
    onPaymentCreated,
}: PaymentsModalProps) {
    const { error: showError, success: showSuccess } = useToast();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

    // Form state
    const [amount, setAmount] = useState<string>('');
    // Currency is set from reservation and is read-only
    const currency = reservationCurrency;
    const [status, setStatus] = useState<string>('succeeded');
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

    // Fetch payments when modal opens
    useEffect(() => {
        if (isOpen && reservationId) {
            fetchPayments();
        }
    }, [isOpen, reservationId]);

    const fetchPayments = async () => {
        setIsLoading(true);
        try {
            const response = await getPayments({ reservationId, limit: 100 });
            setPayments(response.data);
        } catch (err: any) {
            console.error('Failed to fetch payments:', err);
            showError(err.message || 'Failed to load payments');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreatePayment = async () => {
        const amountNum = parseFloat(amount);

        if (isNaN(amountNum) || amountNum <= 0) {
            showError('Unesite važeći iznos');
            return;
        }

        setIsCreating(true);
        try {
            const paymentData: CreatePaymentInput = {
                reservation_id: reservationId,
                amount: amountNum,
                currency,
                status: status as any,
                payment_date: paymentDate || undefined,
            };

            await createPayment(paymentData);

            showSuccess('Plaćanje uspješno dodano');

            // Reset form
            setAmount('');
            setStatus('succeeded');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setShowCreateForm(false);

            // Refresh payments list
            await fetchPayments();

            // Notify parent to refresh reservation
            if (onPaymentCreated) {
                onPaymentCreated();
            }
        } catch (err: any) {
            console.error('Failed to create payment:', err);
            showError(err.message || 'Failed to create payment');
        } finally {
            setIsCreating(false);
        }
    };

    const getStatusBadgeColor = (status: string) => {
        switch (status) {
            case 'succeeded':
                return 'success';
            case 'pending':
                return 'warning';
            case 'failed':
            case 'cancelled':
                return 'error';
            case 'refunded':
                return 'info';
            default:
                return 'light';
        }
    };

    const getStatusLabel = (status: string) => {
        const option = statusOptions.find(o => o.value === status);
        return option?.label || status;
    };

    const remainingAmount = Math.max(reservationTotal - reservationPaid, 0);

    const totalSucceeded = payments
        .filter(p => p.status === 'succeeded')
        .reduce((sum, p) => sum + p.amount, 0);

    const totalRefunded = payments
        .filter(p => p.status === 'refunded')
        .reduce((sum, p) => sum + p.amount, 0);

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

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Plaćanja za rezervaciju"
            className="max-w-4xl"
        >
            <div className="p-6">
                {/* Summary */}
                <div className="mb-6 p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05]">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Ukupno rezervacija</span>
                            <div className="text-lg font-bold text-gray-800 dark:text-white/90">
                                {formatCurrency(reservationTotal)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Ukupno plaćeno</span>
                            <div className="text-lg font-bold text-success-600 dark:text-success-500">
                                {formatCurrency(totalSucceeded)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Ukupno refundirano</span>
                            <div className="text-lg font-bold text-info-600 dark:text-info-500">
                                {formatCurrency(totalRefunded)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Preostalo</span>
                            <div className={`text-lg font-bold ${remainingAmount === 0
                                ? 'text-success-600 dark:text-success-500'
                                : 'text-error-600 dark:text-error-500'
                                }`}>
                                {formatCurrency(remainingAmount)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Create Payment Button */}
                {!showCreateForm && (
                    <div className="mb-6">
                        <Button
                            onClick={() => setShowCreateForm(true)}
                            className="bg-brand-500 hover:bg-brand-600 text-white w-full"
                        >
                            + Dodaj novo plaćanje
                        </Button>
                    </div>
                )}

                {/* Create Payment Form */}
                {showCreateForm && (
                    <div className="mb-6 p-4 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/20">
                        <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white/90">
                            Novo plaćanje
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="amount">Iznos *</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    step={0.01}
                                    disabled={isCreating}
                                />
                            </div>

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

                            <div>
                                <Label htmlFor="paymentDate">Datum plaćanja</Label>
                                <input
                                    id="paymentDate"
                                    type="date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    disabled={isCreating}
                                    className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowCreateForm(false);
                                        setAmount('');
                                    }}
                                    disabled={isCreating}
                                    className="flex-1"
                                >
                                    Odustani
                                </Button>
                                <Button
                                    onClick={handleCreatePayment}
                                    disabled={isCreating || !amount || parseFloat(amount) <= 0}
                                    className="bg-brand-500 hover:bg-brand-600 text-white flex-1"
                                >
                                    {isCreating ? 'Dodavanje...' : 'Dodaj plaćanje'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Payments List */}
                <div>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white/90">
                        Povijest plaćanja ({payments.length})
                    </h3>

                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">
                            Učitavanje...
                        </div>
                    ) : payments.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Nema plaćanja za ovu rezervaciju
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {payments.map((payment) => (
                                <div
                                    key={payment.id}
                                    className="p-4 rounded-lg border border-gray-200 dark:border-white/[0.05] bg-white dark:bg-white/[0.02]"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xl font-bold text-gray-800 dark:text-white/90">
                                                    {formatCurrency(payment.amount)}
                                                </span>
                                                <Badge
                                                    size="sm"
                                                    color={getStatusBadgeColor(payment.status)}
                                                    variant="light"
                                                >
                                                    {getStatusLabel(payment.status)}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                                {payment.paymentDate && (
                                                    <div><span className="opacity-70">Datum:</span> {formatDate(payment.paymentDate)}</div>
                                                )}
                                                <div><span className="opacity-70">Kreirano:</span> {formatDate(payment.createdAt)}</div>
                                                <div className="text-xs font-mono"><span className="opacity-70">ID:</span> {payment.id.substring(0, 8)}</div>
                                                <div className="text-xs"><span className="opacity-70">Valuta:</span> {payment.currency}</div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
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
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingPayment(payment)}
                                        className="text-xs py-1 h-auto text-brand-600 border-brand-200 hover:bg-brand-50"
                                    >
                                        Uredi
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                        </div>
                    )}
                </div>


                {/* Edit Payment Modal */}
                {editingPayment && (
                    <EditPaymentModal
                        isOpen={true}
                        onClose={() => setEditingPayment(null)}
                        payment={editingPayment}
                        onPaymentUpdated={() => {
                            fetchPayments();
                            if (onPaymentCreated) onPaymentCreated();
                        }}
                    />
                )}

                {/* Close Button */}
                <div className="mt-6 flex justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                    >
                        Zatvori
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
