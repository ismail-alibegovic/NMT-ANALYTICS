import { useCallback, useEffect, useState } from 'react';
import Button from '../ui/button/Button';
import { Modal } from '../ui/modal';
import { useT } from '../../lib/i18n/context';
import type { DepartureCostItem } from '../../api/departures';
import { cancelSupplierPayable, getSupplierPayables, issueSupplierPayable, recordSupplierPayableEntry,
  type IssuePayable, type RecordPayableEntry, type SupplierPayable, type SupplierPayableEntry } from '../../api/supplierPayables';

type Pending = { action: 'issue'; body: IssuePayable } | { action: 'entry'; payableId: string; body: RecordPayableEntry } | { action: 'cancel'; payableId: string };
type Form = { kind: 'issue' } | { kind: 'payment'; payable: SupplierPayable } | { kind: 'cancel'; payable: SupplierPayable } | { kind: 'reversal'; payable: SupplierPayable; entry: SupplierPayableEntry };
const storageKey = (id: string) => `travline.supplier-ledger.pending.v1.${id}`;
function readPending(id: string): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(id)) || 'null');
    if (!value || typeof value !== 'object') return null;
    if (value.action === 'cancel' && typeof value.payableId === 'string') return value;
    const body = value.body;
    if (!body || typeof body.requestId !== 'string') return null;
    if (value.action === 'issue' && typeof body.costItemId === 'string' && typeof body.dueDate === 'string') return value;
    if (value.action === 'entry' && typeof value.payableId === 'string' && typeof body.paymentDate === 'string'
      && typeof body.reference === 'string' && typeof body.note === 'string' && typeof body.currency === 'string'
      && ((body.kind === 'payment' && typeof body.amount === 'number') || (body.kind === 'reversal' && typeof body.reversesId === 'string'))) return value;
    return null;
  } catch { return null; }
}

export default function SupplierPayablesPanel({ departureId, costs, onChanged }: {
  departureId: string; costs: DepartureCostItem[]; onChanged: () => void;
}) {
  const { t } = useT(); const c = t.supplierPayables;
  const [rows, setRows] = useState<SupplierPayable[] | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(() => readPending(departureId));
  const [form, setForm] = useState<Form | null>(null);
  const [costId, setCostId] = useState(''), [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState(''), [paymentDate, setPaymentDate] = useState('');
  const [reference, setReference] = useState(''), [note, setNote] = useState('');
  const clearPending = useCallback(() => {
    try { sessionStorage.removeItem(storageKey(departureId)); } catch { /* Repeating a retained key is safe. */ }
    setPending(null);
  }, [departureId]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await getSupplierPayables(departureId); setRows(fresh);
      setForm(current => current && 'payable' in current ? { ...current, payable: fresh.find(p => p.id === current.payable.id) || current.payable } : current);
      const retry = readPending(departureId);
      if (retry && fresh.some(p => retry.action === 'issue' ? p.requestId === retry.body.requestId
        : retry.action === 'cancel' ? p.id === retry.payableId && !!p.cancelledAt
        : p.id === retry.payableId && p.entries.some(e => e.requestId === retry.body.requestId))) {
        clearPending(); setForm(null); setError('');
      }
    } catch { setRows(null); setError(c.loadError); }
    finally { setLoading(false); }
  }, [departureId, c.loadError, clearPending]);
  useEffect(() => { void reload(); }, [reload]);

  function message(e: any) {
    const code = e?.response?.data?.code || e?.code;
    if (code === 'PAYABLE_BALANCE_CONFLICT') return c.balanceConflict;
    if (code === 'PAYABLE_HAS_PAYMENTS') return c.hasPayments;
    if (code === 'PAYABLE_ALREADY_REVERSED') return c.alreadyReversed;
    if (code === 'PAYABLE_REQUEST_CONFLICT' || code === 'PAYABLE_ALREADY_ISSUED') return c.conflict;
    if (code === 'PAYABLE_CANCELLED') return c.cancelledError;
    if (code === 'PAYABLE_INVALID' || code === 'VALIDATION_ERROR' || code === 'PAYABLE_CURRENCY_MISMATCH') return c.invalid;
    return c.saveError;
  }
  async function commit(request: Pending) {
    setSaving(true); setError('');
    try {
      // Persist BEFORE sending: a lost response/reload must reuse the same request and payload.
      sessionStorage.setItem(storageKey(departureId), JSON.stringify(request));
    } catch { setError(c.storageError); setSaving(false); return; }
    setPending(request);
    try {
      if (request.action === 'issue') await issueSupplierPayable(departureId, request.body);
      else if (request.action === 'entry') await recordSupplierPayableEntry(request.payableId, request.body);
      else await cancelSupplierPayable(request.payableId);
      clearPending(); setForm(null); await reload(); onChanged();
    } catch (e: any) {
      setError(message(e));
      // Definitive validation/conflict denial committed no new write; network/5xx is ambiguous.
      const status = e?.status ?? e?.response?.status;
      if (status >= 400 && status < 500) clearPending();
      await reload();
    } finally { setSaving(false); }
  }
  function open(next: Form) {
    setError(''); setForm(next); setCostId(''); setDueDate(''); setAmount(''); setPaymentDate(''); setReference(''); setNote('');
  }
  function submit() {
    if (pending) { void commit(pending); return; }
    if (!form) return;
    if (form.kind === 'issue') void commit({ action: 'issue', body: { requestId: crypto.randomUUID(), costItemId: costId, dueDate } });
    else if (form.kind === 'cancel') void commit({ action: 'cancel', payableId: form.payable.id });
    else {
      const common = { requestId: crypto.randomUUID(), currency: form.payable.currency, paymentDate, reference: reference.trim(), note: note.trim() };
      void commit({ action: 'entry', payableId: form.payable.id, body: form.kind === 'payment'
        ? { ...common, kind: 'payment', amount: Number(amount) }
        : { ...common, kind: 'reversal', reversesId: form.entry.id } });
    }
  }
  const eligible = costs.filter(cost => cost.supplierId && cost.totalCost > 0 && !rows?.some(p => p.costItemId === cost.id && !p.cancelledAt));
  const money = (value: number, currency: string) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const classes = 'min-w-0 w-full rounded-lg border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900';
  const title = form?.kind === 'issue' ? c.issue : form?.kind === 'payment' ? c.record : form?.kind === 'reversal' ? c.reverse : c.cancel;
  return <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]" aria-label={c.title}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold dark:text-white">{c.title}</h2>
      <Button onClick={() => open({ kind: 'issue' })} disabled={loading || saving || !!pending || !rows || !eligible.length}>{c.issue}</Button></div>
    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{c.description}</p>
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.sourceLocked}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {pending && <div className="mt-3 rounded-lg border border-warning-300 p-3 text-sm"><p>{c.pending}</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">{pending.action === 'entry'
        ? `${pending.body.kind === 'payment' ? pending.body.amount : c.reversal} ${pending.body.currency} · ${pending.body.paymentDate} · ${pending.body.reference}`
        : pending.action === 'issue' ? `${c.issue} · ${costs.find(cost => cost.id === pending.body.costItemId)?.label || pending.body.costItemId} · ${pending.body.dueDate}` : c.cancel}</pre>
      <Button size="sm" disabled={saving} onClick={() => void commit(pending)}>{c.retryPending}</Button></div>}
    {loading ? <p role="status" className="mt-4">{c.loading}</p> : !rows ? <Button variant="outline" onClick={() => { setError(''); void reload(); }}>{c.retry}</Button>
      : rows.length === 0 ? <p className="mt-4 text-sm text-gray-500">{c.empty}</p> : <div className="mt-4 grid min-w-0 gap-4">
        {rows.map(p => <article key={p.id} data-payable-id={p.id} className="min-w-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <h3 className="break-words font-medium dark:text-white">{p.label} · {p.supplierName}</h3>
          <p className="mt-1 text-sm">{c.dueDate}: {p.dueDate} · <span>{c.status[p.status]}</span></p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt>{c.amount}</dt><dd>{money(p.amount, p.currency)}</dd></div>
            <div><dt>{c.paid}</dt><dd>{money(p.paid, p.currency)}</dd></div>
            <div><dt>{c.remaining}</dt><dd>{money(p.remaining, p.currency)}</dd></div>
          </dl>
          {!p.cancelledAt && <div className="mt-3 flex flex-wrap gap-2">
            {p.remaining > 0 && <Button size="sm" disabled={saving || !!pending} onClick={() => open({ kind: 'payment', payable: p })}>{c.record}</Button>}
            {p.paid === 0 && <Button size="sm" variant="outline" disabled={saving || !!pending} onClick={() => open({ kind: 'cancel', payable: p })}>{c.cancel}</Button>}
          </div>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer">{c.history} ({p.entries.length})</summary>
            {p.entries.length === 0 ? <p className="mt-2">{c.noEntries}</p> : <ol className="mt-2 grid gap-3">{p.entries.map(e => <li key={e.id} className="min-w-0 break-words rounded border border-gray-200 p-3 dark:border-gray-700">
              <p>{e.kind === 'payment' ? c.payment : c.reversal} · {e.paymentDate} · {money(e.amount, p.currency)}</p>
              <p>{e.reference} {e.note}</p>
              {e.kind === 'payment' && !p.cancelledAt && !p.entries.some(v => v.reversesId === e.id) && <Button size="sm" variant="outline" disabled={saving || !!pending} onClick={() => open({ kind: 'reversal', payable: p, entry: e })}>{c.reverse}</Button>}
            </li>)}</ol>}
          </details>
        </article>)}
      </div>}
    <Modal isOpen={!!form} onClose={() => { if (!saving) setForm(null); }} className="m-4 max-w-lg" title={title}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="grid max-h-[80vh] min-w-0 gap-4 overflow-y-auto p-6">
        <h3 className="font-semibold">{title}</h3>
        {form?.kind === 'issue' ? <>
          <label className="grid min-w-0 gap-1">{c.costItem}<select className={classes} required disabled={!!pending} value={costId} onChange={e => setCostId(e.target.value)}>
            <option value="">{c.selectCost}</option>{eligible.map(cost => <option key={cost.id} value={cost.id}>{cost.label} · {cost.supplierName} · {money(cost.totalCost, cost.currency)}</option>)}
          </select></label>
          <label className="grid min-w-0 gap-1">{c.dueDate}<input className={classes} type="date" required disabled={!!pending} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
        </> : form?.kind === 'cancel' ? <p>{c.cancelExplanation}</p> : <>
          {form && <p className="break-words">{form.payable.label} · {form.payable.supplierName} · {form.kind === 'payment' ? c.remaining : c.reversal}: {money(form.kind === 'payment' ? form.payable.remaining : form.entry.amount, form.payable.currency)}</p>}
          {form?.kind === 'payment' && <label className="grid min-w-0 gap-1">{c.amount}<input className={classes} type="number" min="0.01" step="0.01" max={form.payable.remaining} required disabled={!!pending} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
          <label className="grid min-w-0 gap-1">{c.paymentDate}<input className={classes} type="date" required disabled={!!pending} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></label>
          <label className="grid min-w-0 gap-1">{c.reference}<input className={classes} maxLength={200} disabled={!!pending} value={reference} onChange={e => setReference(e.target.value)} /></label>
          <label className="grid min-w-0 gap-1">{c.note}<textarea className={classes} maxLength={1000} required={form?.kind === 'reversal'} disabled={!!pending} value={note} onChange={e => setNote(e.target.value)} /></label>
        </>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {pending && <p className="text-sm">{c.pending}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" disabled={saving} onClick={() => setForm(null)}>{c.close}</Button>
          <Button type="submit" disabled={saving}>{saving ? c.saving : pending ? c.retryPending : c.confirm}</Button></div>
      </form>
    </Modal>
  </section>;
}
