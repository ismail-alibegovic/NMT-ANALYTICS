import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { getItinerary, getItineraries, type Itinerary } from '../api/itineraries';


export default function Quotations() {
  const { t } = useT(); const c = t.quotations; const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const { success, error: showError } = useToast();
  const [rows, setRows] = useState<Quotation[]>([]); const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const sourceRequest = useRef(0);
  const [sourceVersion, setSourceVersion] = useState<number | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateQuotation & { _mode: 'standalone' | 'itinerary' }>({
    _mode: 'standalone', title: '', clientNotes: null, internalNotes: null, validUntil: null,
    markupStrategy: 'per_item', globalMarkupPercent: 0, currency: 'BAM',
  });

  const load = async (q = '') => { setLoading(true); try { setRows(await getQuotations(q ? { search: q } : undefined)); } catch (e: any) { showError(e?.message || c.loadError); } finally { setLoading(false); } };
  useEffect(() => { void load(); void getItineraries().then(rows => setItineraries(previous => [...rows, ...previous.filter(existing => !rows.some(row => row.id === existing.id))])).catch(() => showError(c.loadError)); }, []);

  const chooseItinerary = useCallback(async (itineraryId: string, versionId?: string | null) => {
    const requestId = ++sourceRequest.current;
    setSourceError(false);
    setSourceVersion(null);
    setSourceLoading(Boolean(itineraryId));
    setForm(previous => ({ ...previous, _mode: 'itinerary', itineraryId: itineraryId || undefined, itineraryVersionId: undefined }));
    if (!itineraryId) return;
    try {
      const detail = await getItinerary(itineraryId);
      const version = versionId ? detail.versions.find(row => row.id === versionId) : detail.versions.find(row => row.versionNumber === detail.currentVersion);
      if (!version) throw new Error('Itinerary version unavailable');
      if (requestId !== sourceRequest.current) return;
      setSourceVersion(version.versionNumber);
      setItineraries(previous => previous.some(row => row.id === detail.id) ? previous : [detail, ...previous]);
      setForm(previous => ({ ...previous, _mode: 'itinerary', itineraryId: detail.id, itineraryVersionId: version.id, title: `${c.offerFor}: ${detail.title}`, currency: detail.currency }));
      if (params.get('new') === '1') {
        const next = new URLSearchParams(params);
        next.delete('new'); next.delete('itineraryId'); next.delete('versionId');
        setParams(next, { replace: true });
      }
    } catch {
      if (requestId === sourceRequest.current) setSourceError(true);
    } finally {
      if (requestId === sourceRequest.current) setSourceLoading(false);
    }
  }, [c.offerFor, params, setParams]);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setOpen(true);
    const itineraryId = params.get('itineraryId');
    if (itineraryId) void chooseItinerary(itineraryId, params.get('versionId'));
    else {
      const next = new URLSearchParams(params); next.delete('new');
      setParams(next, { replace: true });
    }
    return () => { sourceRequest.current += 1; };
  }, [params, setParams, chooseItinerary]);

  function closeForm() {
    sourceRequest.current += 1;
    setSourceLoading(false); setSourceError(false); setOpen(false);
  }

  const save = async () => {
    if (!form.title.trim()) return showError(c.titleRequired);
    if (sourceLoading || sourceError) return;
    if (form._mode === 'itinerary' && (!form.itineraryId || !form.itineraryVersionId)) return showError(c.itineraryRequired || 'Select an itinerary');
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

    <Modal isOpen={open} onClose={closeForm} className="m-4 max-w-2xl" title={c.add}>
      <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        {/* Mode selector */}
        <div className="sm:col-span-2">
          <Label>{c.modeLabel}</Label>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => { sourceRequest.current += 1; setSourceLoading(false); setSourceError(false); setForm({ ...form, _mode: 'standalone', itineraryId: undefined, itineraryVersionId: undefined }); }}
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
              onChange={(v) => { void chooseItinerary(v); }}
              options={[
                { value: '', label: c.selectItinerary },
                ...itineraries.map((x) => ({ value: x.id, label: `${x.title} (v${x.currentVersion})` })),
              ]}
            />
          </Field>
        )}
        {form._mode === 'itinerary' && sourceVersion !== null && <p className="text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">{c.sourceVersion}: v{sourceVersion}</p>}
        {sourceLoading && <p role="status" className="text-sm text-gray-500 sm:col-span-2">{c.sourceLoading}</p>}
        {sourceError && <div role="alert" className="text-sm text-red-700 dark:text-red-300 sm:col-span-2">{c.sourceError} <Button variant="outline" onClick={() => void chooseItinerary(form.itineraryId || '', params.get('versionId'))}>{c.retrySource}</Button></div>}
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
          <Input disabled={form._mode === 'itinerary'} value={form.currency || 'BAM'} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} />
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
          <Button variant="outline" onClick={closeForm}>{c.cancel}</Button>
          <Button onClick={() => void save()} disabled={saving || sourceLoading || sourceError || (form._mode === 'itinerary' && !form.itineraryVersionId)}>{saving ? c.saving : c.create}</Button>
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
