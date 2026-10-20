import { useId, useRef, useState, type FormEvent } from 'react';
import { localPaymentDate } from '../../utils/paymentDate';
import Button from '../ui/button/Button';
import { useT } from '../../lib/i18n/context';
import type { CreatePaymentInput } from '../../api/payments';

export type PaymentValues = Pick<CreatePaymentInput, 'amount' | 'status' | 'payment_method' | 'payment_date'>;
/** One mounted form represents one intent. Failed saves retain every field and the API request key. */
export default function PaymentForm({ initial, currency, editing = false, onSubmit, onCancel, onBusyChange }: {
  initial?: Partial<PaymentValues>; currency: string; editing?: boolean;
  onSubmit: (values: PaymentValues) => Promise<void>; onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useT(); const c = t.paymentForm; const id = useId();
  const lock = useRef(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [amount, setAmount] = useState(initial?.amount == null ? '' : String(initial.amount));
  const [status, setStatus] = useState<CreatePaymentInput['status']>(initial?.status || 'succeeded');
  const [method, setMethod] = useState(initial?.payment_method || '');
  const [date, setDate] = useState(initial?.payment_date ?? (editing ? '' : localPaymentDate()));
  const control = 'h-11 min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) { setError(c.invalidAmount); return; }
    lock.current = true; onBusyChange(true); setSaving(true); setError('');
    try { await onSubmit({ amount: value, status, payment_method: method || undefined, payment_date: date || undefined }); }
    catch { setError(c.saveError); }
    finally { lock.current = false; onBusyChange(false); setSaving(false); }
  }
  return <form onSubmit={submit} aria-label={editing ? t.payments.editPayment : t.payments.addPayment}>
    <fieldset disabled={saving} className="min-w-0 space-y-4">
      <div><label className="mb-1.5 block text-sm font-medium" htmlFor={`${id}-amount`}>{t.payments.amount} *</label>
        <input className={control} id={`${id}-amount`} type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor={`${id}-currency`}>{t.settings.currency}</label><input className={control} id={`${id}-currency`} value={currency} readOnly /></div>
        <div><label className="mb-1.5 block text-sm font-medium" htmlFor={`${id}-status`}>{t.payments.status}</label>
          <select className={control} id={`${id}-status`} value={status} onChange={e => setStatus(e.target.value as CreatePaymentInput['status'])}>
            {(['succeeded','pending','failed','refunded','cancelled'] as const).map(value => <option value={value} key={value}>{c.statuses[value]}</option>)}
          </select></div>
      </div>
      <div><label className="mb-1.5 block text-sm font-medium" htmlFor={`${id}-method`}>{t.payments.method}</label>
        <select className={control} id={`${id}-method`} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">{editing ? c.unchangedMethod : c.selectMethod}</option>
          {['cash','card','bank_transfer','credit','other'].map(value => <option key={value} value={value}>{c.methods[value]}</option>)}
        </select></div>
      <div><label className="mb-1.5 block text-sm font-medium" htmlFor={`${id}-date`}>{t.payments.date}{editing ? '' : ' *'}</label><input className={control} id={`${id}-date`} type="date" required={!editing} value={date} onChange={e => setDate(e.target.value)} /></div>
      {editing && <p className="text-sm text-gray-600 dark:text-gray-300">{c.balanceWarning}</p>}
      {error && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3 pt-2"><Button variant="outline" onClick={() => { if (!lock.current) onCancel(); }}>{t.common.cancel}</Button><Button type="submit">{saving ? c.saving : editing ? t.common.save : t.payments.addPayment}</Button></div>
    </fieldset>
  </form>;
}
