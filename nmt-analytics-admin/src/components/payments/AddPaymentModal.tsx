import { useRef } from 'react';
import { Modal } from '../ui/modal';
import { createPayment } from '../../api/payments';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import PaymentForm from './PaymentForm';

interface AddPaymentModalProps {
  isOpen: boolean; onClose: () => void; reservationId: string; reservationCurrency?: string;
  installmentId?: string | null; defaultAmount?: number | null;
  onPaymentCreated?: (updatedReservation?: { paidAmount: number; totalAmount: number }) => void;
}
export default function AddPaymentModal({ isOpen, onClose, reservationId, reservationCurrency = 'BAM', installmentId = null, defaultAmount = null, onPaymentCreated }: AddPaymentModalProps) {
  const busy = useRef(false); const { t } = useT(); const toast = useToast();
  return <Modal isOpen={isOpen} onClose={() => { if (!busy.current) onClose(); }} title={t.payments.addPayment} className="mx-4 max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
    {isOpen && <div className="p-6"><PaymentForm key={`${reservationId}:${installmentId}`} currency={reservationCurrency} initial={{ amount: defaultAmount ?? undefined }} onBusyChange={value => { busy.current = value; }} onCancel={onClose} onSubmit={async values => {
      const result = await createPayment({ ...values, reservation_id: reservationId, installment_id: installmentId || undefined, currency: reservationCurrency });
      toast.success(t.paymentForm.created); onPaymentCreated?.(result.reservation || undefined); onClose();
    }} /></div>}
  </Modal>;
}
