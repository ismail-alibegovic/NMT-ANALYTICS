import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/form/input/InputField';
import Label from '../components/form/Label';
import { Modal } from '../components/ui/modal';
import { useToast } from '../context/ToastContext';
import { useT } from '../lib/i18n/context';
import {
  getQuotation, updateQuotation, quotationPdfUrl,
  addQuotationItem, editQuotationItem, deleteQuotationItem,
  type Quotation, type QuotationItem, type CreateQuotationItem,
} from '../api/quotations';

const CATEGORIES = ['accommodation', 'transport', 'flight', 'guide', 'activity', 'meal', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'] as const;
const UNITS = ['fixed', 'per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group', 'per_booking', 'per_day', 'per_hour'] as const;

const emptyItem: CreateQuotationItem = {
  title: '', description: null, category: 'other', quantity: 1, unit: 'fixed',
  netUnitPrice: 0, markupPercent: 0, currency: 'BAM', included: true,
  dayNumber: 1, sortOrder: 0, startTime: null, location: null,
  supplierId: null, supplierServiceId: null,
};

export default function QuotationDetail() {
  const { id = '' } = useParams(); const { t } = useT(); const c = t.quotations;
  const { success, error: showError } = useToast();
  const [data, setData] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuotationItem | null>(null);
  const [itemForm, setItemForm] = useState<CreateQuotationItem>({ ...emptyItem });

  const load = async () => {
    setLoading(true);
    try { setData(await getQuotation(id)); } catch (e: any) { showError(e?.message || c.loadError); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  const changeStatus = async (status: Quotation['status']) => {
    if (!data) return; setSaving(true);
    try { const updated = await updateQuotation(id, { status }); setData(updated); success(c.statusUpdated); }
    catch (e: any) { showError(e?.message || c.saveError); }
    finally { setSaving(false); }
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({
      ...emptyItem,
      currency: data?.currency || 'BAM',
      dayNumber: data?.items?.length ? Math.max(...data.items.map(i => i.dayNumber)) : 1,
    });
    setItemOpen(true);
  };

  const openEditItem = (item: QuotationItem) => {
    setEditingItem(item);
    setItemForm({
      title: item.title, description: item.description, category: item.category,
      quantity: item.quantity, unit: item.unit, netUnitPrice: item.netUnitPrice,
      markupPercent: item.markupPercent, currency: item.currency, included: item.included,
      dayNumber: item.dayNumber, sortOrder: item.sortOrder, startTime: item.startTime,
      location: item.location, supplierId: item.supplierId, supplierServiceId: item.supplierServiceId,
    });
    setItemOpen(true);
  };

  const saveItem = async () => {
    if (!itemForm.title.trim()) return showError(c.titleRequired);
    setSaving(true);
    try {
      if (editingItem) {
        await editQuotationItem(id, editingItem.id, itemForm);
      } else {
        await addQuotationItem(id, itemForm);
      }
      await load();
      setItemOpen(false);
      success(editingItem ? c.itemUpdated : c.itemAdded);
    } catch (e: any) { showError(e?.message || c.saveError); }
    finally { setSaving(false); }
  };

  const removeItem = async (itemId: string) => {
    if (!confirm(c.confirmDeleteItem)) return;
    setSaving(true);
    try { await deleteQuotationItem(id, itemId); await load(); success(c.itemDeleted); }
    catch (e: any) { showError(e?.message || c.saveError); }
    finally { setSaving(false); }
  };

  const statusColor = (s: string) =>
    s === 'accepted' ? 'success' : s === 'sent' ? 'primary' : s === 'rejected' ? 'error' : s === 'expired' ? 'warning' : 'light';

  const days = [...new Set(data?.items.map((item) => item.dayNumber) || [])].sort((a, b) => a - b);
  const categoryLabel = (cat: string) => c.categories?.[cat as keyof typeof c.categories] || cat;
  const isStandalone = !data?.itineraryId;

  if (loading) return <div className="h-[600px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />;
  if (!data) return <EmptyState title={c.notFound} description={c.notFoundDescription} />;

  return <>
    <PageMeta title={`${data.reference} | Travline`} description={c.workspaceDescription} />
    <div className="mb-5"><Link to="/quotations" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">← {c.back}</Link></div>

    <header className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.title}</h1>
          <Badge size="sm" color={statusColor(data.status)}>{c.statuses[data.status]}</Badge>
          <span className="text-sm font-mono text-gray-500 dark:text-gray-400">{data.reference}</span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {data.validUntil ? `${c.validUntil}: ${new Date(data.validUntil).toLocaleDateString()}` : c.noExpiry}
        </p>
        {isStandalone ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.standaloneLabel}</p>
        ) : (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {c.sourceItinerary}:{' '}
            <Link to={`/itineraries/${data.itineraryId}`} className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              {data.itinerary?.title || data.itineraryId}
            </Link>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {data.status === 'draft' && <><Button variant="outline" onClick={() => void changeStatus('sent')} disabled={saving}>{c.markSent}</Button></>}
        {data.status === 'sent' && <>
          <Button variant="outline" color="success" onClick={() => void changeStatus('accepted')} disabled={saving}>{c.markAccepted}</Button>
          <Button variant="outline" color="error" onClick={() => void changeStatus('rejected')} disabled={saving}>{c.markRejected}</Button>
        </>}
        <Button variant="outline" onClick={() => window.open(quotationPdfUrl(id), '_blank')}>{c.downloadPdf}</Button>
      </div>
    </header>

    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Pill label={c.netTotal} value={`${data.netTotal.toLocaleString()} ${data.currency}`} />
      <Pill label={c.markup} value={`${data.markupStrategy === 'uniform' ? `${data.globalMarkupPercent}% ${c.uniform}` : c.perItem}`} />
      <Pill label={c.sellTotal} value={`${data.sellTotal.toLocaleString()} ${data.currency}`} />
      <Pill label={c.marginTotal} value={`${data.marginTotal.toLocaleString()} ${data.currency}`} />
    </div>

    {data.clientNotes && (
      <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.clientNotesLabel}</h3>
        <p className="mt-1 text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400">{data.clientNotes}</p>
      </section>
    )}

    {!isStandalone && (
      <div className="mb-4 rounded-lg border border-gray-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-gray-700 dark:bg-blue-500/10 dark:text-blue-300">
        {c.itemsReadOnly}
      </div>
    )}

    {data.items.length === 0 ? (
      <EmptyState
        title={c.noItems}
        description={isStandalone ? c.noItemsDescriptionStandalone : c.noItemsDescription}
        action={isStandalone ? { label: c.addItem, onClick: openAddItem } : undefined}
      />
    ) : (
      <div className="space-y-5">
        {days.map((day) => (
          <section key={day} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <header className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{c.day} {day}</h2>
              {isStandalone && (
                <button
                  onClick={() => { setItemForm({ ...emptyItem, currency: data.currency, dayNumber: day }); setEditingItem(null); setItemOpen(true); }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  + {c.addItemToDay}
                </button>
              )}
            </header>
            <div>
              {data.items.filter((item) => item.dayNumber === day).map((item) => (
                <article key={item.id} className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 last:border-0 sm:flex-row sm:items-center dark:border-gray-800">
                  <div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                    {item.startTime || '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                      <Badge size="sm" color="light">{categoryLabel(item.category)}</Badge>
                      {item.included === false && <Badge size="sm" color="warning">{c.optional}</Badge>}
                    </div>
                    {item.location && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.location}</p>}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.quantity} × {item.netUnitPrice.toLocaleString()} {item.currency} · {item.unit}
                    </p>
                    {item.description && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{item.description}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {item.sellLineTotal.toLocaleString()} {item.currency}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {c.net}: {item.netLineTotal.toLocaleString()} {item.currency} · {item.markupPercent}%
                    </p>
                  </div>
                  {isStandalone && (
                    <div className="flex gap-1">
                      <button onClick={() => openEditItem(item)} className="rounded p-1 text-xs text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-800">{c.editItem}</button>
                      <button onClick={() => void removeItem(item.id)} className="rounded p-1 text-xs text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800">{c.deleteItem}</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}

        {isStandalone && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={openAddItem}>{c.addItem}</Button>
          </div>
        )}
      </div>
    )}

    {/* Item add/edit modal */}
    <Modal isOpen={itemOpen} onClose={() => setItemOpen(false)} className="m-4 max-w-xl" title={editingItem ? c.editItem : c.addItem}>
      <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>{`${c.titleLabel} *`}</Label>
          <Input value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>{c.description}</Label>
          <textarea rows={2} value={itemForm.description || ''} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value || null })}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        </div>
        <Field label={c.category}><Select value={itemForm.category || 'other'} onChange={(v) => setItemForm({ ...itemForm, category: v })}
          options={CATEGORIES.map((v) => ({ value: v, label: categoryLabel(v) }))} /></Field>
        <Field label={c.dayNumber}><Input type="number" min="1" value={itemForm.dayNumber} onChange={(e) => setItemForm({ ...itemForm, dayNumber: Number(e.target.value) })} /></Field>
        <Field label={c.quantity}><Input type="number" min="1" step="1" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} /></Field>
        <Field label={c.unit}><Select value={itemForm.unit || 'fixed'} onChange={(v) => setItemForm({ ...itemForm, unit: v })}
          options={UNITS.map((v) => ({ value: v, label: v }))} /></Field>
        <Field label={c.netUnitPrice}><Input type="number" min="0" step="0.01" value={itemForm.netUnitPrice} onChange={(e) => setItemForm({ ...itemForm, netUnitPrice: Number(e.target.value) })} /></Field>
        <Field label={c.markupPercent}><Input type="number" min="0" max="1000" step="0.1" value={itemForm.markupPercent} onChange={(e) => setItemForm({ ...itemForm, markupPercent: Number(e.target.value) })} /></Field>
        <Field label={c.currency}><Input value={itemForm.currency || 'BAM'} onChange={(e) => setItemForm({ ...itemForm, currency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
        <Field label={c.location}><Input value={itemForm.location || ''} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value || null })} /></Field>
        <Field label={c.included}>
          <Select value={itemForm.included ? 'true' : 'false'} onChange={(v) => setItemForm({ ...itemForm, included: v === 'true' })}
            options={[{ value: 'true', label: c.includedLabel }, { value: 'false', label: c.optionalLabel }]} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800">
          <Button variant="outline" onClick={() => setItemOpen(false)}>{c.cancel}</Button>
          <Button onClick={() => void saveItem()} disabled={saving}>{saving ? c.saving : (editingItem ? c.saveItem : c.addItem)}</Button>
        </div>
      </div>
    </Modal>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}

function Pill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
  </div>;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
