import { useRef } from 'react';
import { Modal } from '../ui/modal';
import { updatePayment, type Payment } from '../../api/payments';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import PaymentForm from './PaymentForm';
interface EditPaymentModalProps { isOpen: boolean; onClose: () => void; payment: Payment; onPaymentUpdated?: () => void; }
export default function EditPaymentModal({ isOpen, onClose, payment, onPaymentUpdated }: EditPaymentModalProps) {
  const busy = useRef(false); const { t } = useT(); const toast = useToast();
  return <Modal isOpen={isOpen} onClose={() => { if (!busy.current) onClose(); }} title={t.payments.editPayment} className="mx-4 max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
    {isOpen && <div className="p-6"><PaymentForm key={payment.id} currency={payment.currency} editing initial={{ amount: payment.amount, status: payment.status, payment_date: payment.paymentDate || undefined, payment_method: payment.paymentMethod || undefined }} onBusyChange={value => { busy.current = value; }} onCancel={onClose} onSubmit={async values => {
      await updatePayment(payment.id, values); toast.success(t.paymentForm.updated); onPaymentUpdated?.(); onClose();
    }} /></div>}
  </Modal>;
}
