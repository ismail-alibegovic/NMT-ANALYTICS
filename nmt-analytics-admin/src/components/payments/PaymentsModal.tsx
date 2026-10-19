import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import PaymentForm from './PaymentForm';
import {
    getPayments,
    createPayment,
    updatePayment,
    voidPayment,
    refundPayment,
    Payment
} from '../../api/payments';
import { useToast } from '../../context/ToastContext';
import { calculateRemainingFromSuccessfulPayments, formatCurrency, formatDate } from '../../utils/business';
import Badge from '../ui/badge/Badge';
import EditPaymentModal from './EditPaymentModal';
import { useT } from '../../lib/i18n/context';

interface PaymentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    reservationId: string;
    reservationTotal: number;
    reservationCurrency?: string; // Currency from reservation (source of truth)
    onPaymentCreated?: () => void;
}

export function calculatePaymentsRemaining(reservationTotal: number, payments: Payment[]): number {
    return calculateRemainingFromSuccessfulPayments(reservationTotal, payments);
}

export default function PaymentsModal({
    isOpen,
    onClose,
    reservationId,
    reservationTotal,
    reservationCurrency = 'BAM', // Default to BAM if not provided
    onPaymentCreated,
}: PaymentsModalProps) {
    const { t } = useT();
    const { error: showError, success: showSuccess } = useToast();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

    const createBusy = useRef(false);
    const actionBusy = useRef(false);
    const fetchVersion = useRef(0);
    const [isActing, setIsActing] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const fetchPayments = useCallback(async () => {
        const version = ++fetchVersion.current;
        setIsLoading(true); setLoadFailed(false);
        try {
            const response = await getPayments({ reservationId, limit: 100 });
            if (version === fetchVersion.current) setPayments(response.data);
        } catch {
            if (version === fetchVersion.current) { setLoadFailed(true); showError(t.paymentForm.loadError); }
        } finally {
            if (version === fetchVersion.current) setIsLoading(false);
        }
    }, [reservationId, showError, t.paymentForm.loadError]);

    useEffect(() => {
        const version = fetchVersion;
        if (isOpen && reservationId) { setPayments([]); void fetchPayments(); }
        return () => { version.current++; };
    }, [isOpen, reservationId, fetchPayments]);

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
        return t.paymentForm.statuses[status] || status;
    };

    const remainingAmount = calculatePaymentsRemaining(reservationTotal, payments);

    const totalSucceeded = payments
        .filter(p => p.status === 'succeeded')
        .reduce((sum, p) => sum + p.amount, 0);

    const totalRefunded = payments
        .filter(p => p.status === 'refunded')
        .reduce((sum, p) => sum + p.amount, 0);

    async function mutate(action: () => Promise<unknown>, success: string) {
        if (actionBusy.current || createBusy.current) return;
        actionBusy.current = true; setIsActing(true);
        try { await action(); showSuccess(success); await fetchPayments(); onPaymentCreated?.(); }
        catch { showError(t.paymentForm.saveError); }
        finally { actionBusy.current = false; setIsActing(false); }
    }
    const handleVoidPayment = (id: string) => {
        if (!actionBusy.current && confirm(t.paymentForm.voidConfirm)) void mutate(() => voidPayment(id), t.paymentForm.voided);
    };
    const handleRefundPayment = (id: string) => {
        if (actionBusy.current) return;
        const reason = window.prompt(t.paymentForm.refundReason);
        if (reason !== null) void mutate(() => refundPayment(id, reason || undefined), t.paymentForm.refunded);
    };
    const handleUpdateStatus = (id: string, newStatus: Payment['status']) => {
        void mutate(() => updatePayment(id, { status: newStatus }), t.paymentForm.updated);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!createBusy.current && !actionBusy.current && !editingPayment) { setShowCreateForm(false); onClose(); } }}
            title={t.paymentForm.title}
            className="mx-4 max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto"
        >
            <div className="p-6">
                {/* Summary */}
                <div className="mb-6 p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05]">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{t.paymentForm.total}</span>
                            <div className="text-lg font-bold text-gray-800 dark:text-white/90">
                                {formatCurrency(reservationTotal, reservationCurrency)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{t.paymentForm.paid}</span>
                            <div className="text-lg font-bold text-success-600 dark:text-success-500">
                                {formatCurrency(totalSucceeded, reservationCurrency)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{t.paymentForm.totalRefunded}</span>
                            <div className="text-lg font-bold text-info-600 dark:text-info-500">
                                {formatCurrency(totalRefunded, reservationCurrency)}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{t.paymentForm.remaining}</span>
                            <div className={`text-lg font-bold ${remainingAmount === 0
                                ? 'text-success-600 dark:text-success-500'
                                : 'text-error-600 dark:text-error-500'
                                }`}>
                                {formatCurrency(remainingAmount, reservationCurrency)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Create Payment Button */}
                {!showCreateForm && (
                    <div className="mb-6">
                        <Button
                            disabled={isLoading || loadFailed || isActing}
                            onClick={() => setShowCreateForm(true)}
                            className="bg-brand-500 hover:bg-brand-600 text-white w-full"
                        >
                            + {t.payments.addPayment}
                        </Button>
                    </div>
                )}

                {/* Create Payment Form */}
                {showCreateForm && (
                    <div className="mb-6 p-4 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/20">
                        <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white/90">
                            {t.payments.addPayment}
                        </h3>

                        <PaymentForm currency={reservationCurrency} onBusyChange={busy => { createBusy.current = busy; setIsCreating(busy); }} onCancel={() => setShowCreateForm(false)} onSubmit={async values => {
                            await createPayment({ ...values, reservation_id: reservationId, currency: reservationCurrency });
                            showSuccess(t.paymentForm.created); setShowCreateForm(false);
                            await fetchPayments(); onPaymentCreated?.();
                        }} />
                    </div>
                )}

                {/* Payments List */}
                <div>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white/90">
                        {t.paymentForm.history} ({payments.length})
                    </h3>

                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">
                            {t.common.loading}
                        </div>
                    ) : loadFailed ? <div role="alert"><p>{t.paymentForm.loadError}</p><Button onClick={() => void fetchPayments()}>{t.paymentForm.retryLoad}</Button></div> : payments.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            {t.payments.noPayments}
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
                                                    {formatCurrency(payment.amount, payment.currency || reservationCurrency)}
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
                                                    <div><span className="opacity-70">{t.payments.date}:</span> {formatDate(payment.paymentDate)}</div>
                                                )}
                                                <div><span className="opacity-70">{t.paymentForm.createdAt}:</span> {formatDate(payment.createdAt)}</div>
                                                <div className="text-xs font-mono"><span className="opacity-70">ID:</span> {payment.id.substring(0, 8)}</div>
                                                <div className="text-xs"><span className="opacity-70">{t.settings.currency}:</span> {payment.currency}</div>
                                                {payment.paymentMethod && (
                                                    <div className="text-xs"><span className="opacity-70">{t.payments.method}:</span> {
                                                        t.paymentForm.methods[payment.paymentMethod] || payment.paymentMethod
                                                    }</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {payment.status !== 'cancelled' && (
                                                <Button
                                                    disabled={isActing || isCreating}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleVoidPayment(payment.id)}
                                                    className="text-xs py-1 h-auto text-red-500 border-red-200 hover:bg-red-50"
                                                >
                                                    {t.paymentForm.void}
                                                </Button>
                                            )}
                                            {payment.status === 'succeeded' && (
                                                <Button
                                                    disabled={isActing || isCreating}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRefundPayment(payment.id)}
                                                    className="text-xs py-1 h-auto text-info-600 border-info-200 hover:bg-info-50"
                                                >
                                                    {t.paymentForm.refund}
                                                </Button>
                                            )}
                                    {(payment.status === 'pending' || payment.status === 'failed') && (
                                        <Button
                                            disabled={isActing || isCreating}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleUpdateStatus(payment.id, 'succeeded')}
                                            className="text-xs py-1 h-auto text-success-600 border-success-200 hover:bg-success-50"
                                        >
                                            {payment.status === 'failed' ? t.payments.retryFailed : t.common.confirm}
                                        </Button>
                                    )}
                                    <Button
                                        disabled={isActing || isCreating}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingPayment(payment)}
                                        className="text-xs py-1 h-auto text-brand-600 border-brand-200 hover:bg-brand-50"
                                    >
                                        {t.common.edit}
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
                        disabled={isCreating || isActing}
                        onClick={() => { if (!createBusy.current && !actionBusy.current) { setShowCreateForm(false); onClose(); } }}
                    >
                        {t.common.close}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
