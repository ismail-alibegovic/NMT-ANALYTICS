import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import PageToolbar from '../components/ui/PageToolbar';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import Input from '../components/form/input/InputField';
import Label from '../components/form/Label';
import { Modal } from '../components/ui/modal';
import { useToast } from '../context/ToastContext';
import { useT } from '../lib/i18n/context';
import { createQuotation, getQuotations, type CreateQuotation, type Quotation } from '../api/quotations';
import { getItineraries, type Itinerary } from '../api/itineraries';


export default function Quotations() {
  const { t } = useT(); const c = t.quotations; const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const { success, error: showError } = useToast();
  const [rows, setRows] = useState<Quotation[]>([]); const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateQuotation & { _mode: 'standalone' | 'itinerary' }>({
    _mode: 'standalone', title: '', clientNotes: null, internalNotes: null, validUntil: null,
    markupStrategy: 'per_item', globalMarkupPercent: 0, currency: 'BAM',
  });

  const load = async (q = '') => { setLoading(true); try { setRows(await getQuotations(q ? { search: q } : undefined)); } catch (e: any) { showError(e?.message || c.loadError); } finally { setLoading(false); } };
  useEffect(() => { void load(); void getItineraries().then(setItineraries); }, []);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    const itineraryId = params.get('itineraryId');
    const versionId = params.get('versionId');
    const itinerary = itineraries.find((x) => x.id === itineraryId);
    if (itinerary) {
      const current = itinerary.versions.find((v) => v.versionNumber === itinerary.currentVersion);
      setForm({
        _mode: 'itinerary',
        itineraryId: itinerary.id,
        itineraryVersionId: versionId || current?.id || '',
        title: `${c.offerFor}: ${itinerary.title}`,
        currency: itinerary.currency,
        clientNotes: null, internalNotes: null, validUntil: null,
        markupStrategy: 'per_item', globalMarkupPercent: 0,
      });
    }
    setOpen(true); const next = new URLSearchParams(params); next.delete('new'); next.delete('itineraryId'); next.delete('versionId'); setParams(next, { replace: true });
  }, [params, itineraries, setParams]);

  const save = async () => {
    if (!form.title.trim()) return showError(c.titleRequired);
    if (form._mode === 'itinerary' && !form.itineraryId) return showError(c.itineraryRequired || 'Select an itinerary');
    setSaving(true);
    try {
      const payload: CreateQuotation = {
        title: form.title.trim(),
        clientNotes: form.clientNotes,
        internalNotes: form.internalNotes,
        validUntil: form.validUntil,
        markupStrategy: form.markupStrategy,
        globalMarkupPercent: form.globalMarkupPercent,
        currency: form.currency,
      };
      if (form._mode === 'itinerary') {
        payload.itineraryId = form.itineraryId;
        payload.itineraryVersionId = form.itineraryVersionId;
      }
      const created = await createQuotation(payload);
      success(c.saved);
      navigate(`/quotations/${created.id}`);
    } catch (e: any) {
      showError(e?.message || c.saveError);
    } finally { setSaving(false); }
  };

  const statusColor = (s: string) => s === 'accepted' ? 'success' : s === 'sent' ? 'primary' : s === 'rejected' ? 'error' : 'light';

  return <>
    <PageMeta title={`${c.title} | Travline`} description={c.description} />
    <PageToolbar
      title={c.title} description={c.description}
      searchValue={search} searchPlaceholder={c.search}
      onSearchChange={(v) => { setSearch(v); void load(v); }}
      createButton={{
        label: c.add,
        onClick: () => {
          setForm({ _mode: 'standalone', title: '', clientNotes: null, internalNotes: null, validUntil: null, markupStrategy: 'per_item', globalMarkupPercent: 0, currency: 'BAM' });
          setOpen(true);
        },
      }}
    />
    {loading ? (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1,2,3].map((n) => <div key={n} className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />)}
      </div>
    ) : rows.length === 0 ? (
      <EmptyState title={c.emptyTitle} description={c.emptyDescription} action={{ label: c.add, onClick: () => setOpen(true) }} />
    ) : (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() => navigate(`/quotations/${row.id}`)}
            className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{row.title}</h2>
                <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{row.reference}</p>
              </div>
              <Badge size="sm" color={statusColor(row.status)}>{c.statuses[row.status]}</Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{c.net}: {row.netTotal.toLocaleString()} {row.currency}</span>
              <span className="text-right">{c.sell}: {row.sellTotal.toLocaleString()} {row.currency}</span>
              <span>{c.margin}: {row.marginTotal.toLocaleString()} {row.currency}</span>
            </div>
            {row.validUntil && (
              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {c.validUntil}: {new Date(row.validUntil).toLocaleDateString()}
              </p>
            )}
          </button>
        ))}
      </div>
    )}

    <Modal isOpen={open} onClose={() => setOpen(false)} className="m-4 max-w-2xl" title={c.add}>
      <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        {/* Mode selector */}
        <div className="sm:col-span-2">
          <Label>Mode</Label>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, _mode: 'standalone', itineraryId: undefined, itineraryVersionId: undefined })}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                form._mode === 'standalone'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <div className="font-semibold">{c.standaloneMode}</div>
              <div className="mt-0.5 text-xs opacity-70">{c.standaloneModeDesc}</div>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, _mode: 'itinerary', items: undefined })}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                form._mode === 'itinerary'
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <div className="font-semibold">{c.fromItineraryMode}</div>
              <div className="mt-0.5 text-xs opacity-70">{c.fromItineraryModeDesc}</div>
            </button>
          </div>
        </div>

        {form._mode === 'itinerary' && (
          <Field label={c.itinerary}>
            <Select
              value={form.itineraryId || ''}
              onChange={(v) => {
                const itinerary = itineraries.find((x) => x.id === v);
                if (itinerary) {
                  const current = itinerary.versions.find((ver) => ver.versionNumber === itinerary.currentVersion);
                  setForm({
                    ...form,
                    itineraryId: itinerary.id,
                    itineraryVersionId: current?.id || '',
                    title: `${c.offerFor}: ${itinerary.title}`,
                    currency: itinerary.currency,
                  });
                } else {
                  setForm({ ...form, itineraryId: undefined, itineraryVersionId: undefined });
                }
              }}
              options={[
                { value: '', label: c.selectItinerary },
                ...itineraries.map((x) => ({ value: x.id, label: `${x.title} (v${x.currentVersion})` })),
              ]}
            />
          </Field>
        )}
        <Field label={`${c.titleLabel} *`}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={c.markupStrategy}>
          <Select
            value={form.markupStrategy || 'per_item'}
            onChange={(v) => setForm({ ...form, markupStrategy: v as 'uniform' | 'per_item' })}
            options={[{ value: 'per_item', label: c.perItem }, { value: 'uniform', label: c.uniform }]}
          />
        </Field>
        {form.markupStrategy === 'uniform' && (
          <Field label={c.globalMarkup}>
            <Input type="number" min="0" max="1000" value={form.globalMarkupPercent} onChange={(e) => setForm({ ...form, globalMarkupPercent: Number(e.target.value) })} />
          </Field>
        )}
        <Field label={c.validUntil}>
          <Input type="date" value={form.validUntil || ''} onChange={(e) => setForm({ ...form, validUntil: e.target.value || null })} />
        </Field>
        <Field label={c.currency}>
          <Input value={form.currency || 'BAM'} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} />
        </Field>
        <div className="sm:col-span-2">
          <Label>{c.clientNotes}</Label>
          <textarea
            rows={3}
            value={form.clientNotes || ''}
            onChange={(e) => setForm({ ...form, clientNotes: e.target.value || null })}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800">
          <Button variant="outline" onClick={() => setOpen(false)}>{c.cancel}</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? c.saving : c.create}</Button>
        </div>
      </div>
    </Modal>
  </>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
    >
      {options.map((o) => <option key={o.value || 'empty'} value={o.value}>{o.label}</option>)}
    </select>
  );
}
