import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import PageToolbar from '../components/ui/PageToolbar';
import Button from '../components/ui/button/Button';
import Badge from '../components/ui/badge/Badge';
import EmptyState from '../components/ui/EmptyState';
import { Modal } from '../components/ui/modal';
import Input from '../components/form/input/InputField';
import Label from '../components/form/Label';
import { useToast } from '../context/ToastContext';
import { createInquiry, getInquiries, updateInquiry, type CreateInquiry, type Inquiry, type InquiryStage, type InquiryTripType } from '../api/inquiries';
import { useT } from '../lib/i18n/context';

const STAGE_KEYS: InquiryStage[] = ['new', 'qualified', 'proposal', 'follow_up', 'won', 'lost'];

const TRIP_TYPE_VALUES: InquiryTripType[] = ['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'];

const SOURCE_VALUES = ['phone', 'web', 'email', 'walk_in', 'partner', 'social', 'referral', 'other'] as const;

const CURRENCIES = ['BAM', 'EUR', 'USD'] as const;

const emptyForm: CreateInquiry = { contactName: '', phone: null, email: null, tripType: 'other', source: 'phone', destination: null, travelStart: null, travelEnd: null, travelers: 1, budget: null, currency: 'BAM', nextActionAt: null, notes: null };

export default function Inquiries() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error: showError } = useToast();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateInquiry>(emptyForm);

  const load = async (query = '') => {
    setLoading(true);
    try { setItems(await getInquiries(query)); }
    catch (err: any) { showError(err?.message || t.inquiries.error.load); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setIsOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);
  const grouped = useMemo(() => Object.fromEntries(STAGE_KEYS.map((stage) => [stage, items.filter((item) => item.stage === stage)])) as Record<InquiryStage, Inquiry[]>, [items]);

  const save = async () => {
    if (!form.contactName.trim()) return showError(t.inquiries.error.contactNameRequired);
    setSaving(true);
    try {
      await createInquiry({ ...form, budget: form.budget ? Number(form.budget) : null, travelers: Number(form.travelers) });
      success(t.inquiries.success.created); setIsOpen(false); setForm(emptyForm); await load(search);
    } catch (err: any) { showError(err?.message || t.inquiries.error.save); }
    finally { setSaving(false); }
  };

  const move = async (item: Inquiry, stage: InquiryStage) => {
    const previous = items;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, stage } : row));
    try { await updateInquiry(item.id, { stage }); }
    catch (err: any) { setItems(previous); showError(err?.message || t.inquiries.error.move); }
  };

  return (
    <>
      <PageMeta title={`${t.inquiries.title} | Travline`} description={t.inquiries.subtitle} />
      <PageToolbar title={t.inquiries.title} description={t.inquiries.subtitle} searchValue={search} onSearchChange={(value) => { setSearch(value); void load(value); }} searchPlaceholder={t.inquiries.search.placeholder} createButton={{ label: t.inquiries.createButton, onClick: () => setIsOpen(true) }} />
      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 2xl:grid-cols-6">{STAGE_KEYS.map((stage) => <div key={stage} className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title={t.inquiries.empty.title} description={t.inquiries.empty.description} action={{ label: t.inquiries.createButton, onClick: () => setIsOpen(true) }} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_KEYS.map((stage) => (
            <section key={stage} className="w-[290px] shrink-0 rounded-xl border border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]">
              <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t.inquiries.stage[stage]}</h2><Badge size="sm" color="light">{grouped[stage].length}</Badge></header>
              <div className="space-y-3 p-3">
                {grouped[stage].map((item) => {
                  const stageLabel = t.inquiries.stage[item.stage as InquiryStage] || item.stage;
                  return (
                  <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.contactName}</h3><p className="mt-0.5 truncate text-xs text-gray-500">{item.destination || t.inquiries.noDestination}</p></div><Badge size="sm" color="primary">{t.inquiries.tripType[item.tripType as InquiryTripType] || item.tripType}</Badge></div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500"><span>{item.travelers} {item.travelers === 1 ? t.inquiries.travelers_one : t.inquiries.travelers_other}</span><span>{item.budget ? `${item.budget.toLocaleString('bs-BA')} ${item.currency}` : t.inquiries.noBudget}</span></div>
                    {item.nextActionAt && <p className="mt-3 text-xs font-medium text-warning-600 dark:text-warning-400">{t.inquiries.nextAction} {new Date(item.nextActionAt).toLocaleString('bs-BA')}</p>}
                    <button type="button" onClick={() => navigate(`/itineraries?new=1&inquiryId=${item.id}`)} className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">{t.inquiries.createItinerary}</button>
                    <select value={item.stage} onChange={(event) => void move(item, event.target.value as InquiryStage)} className="mt-4 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200" aria-label={`${t.inquiries.stage[stage]} — ${item.contactName}`}>{STAGE_KEYS.map((option) => <option key={option} value={option}>{t.inquiries.stage[option]}</option>)}</select>
                  </article>
                  );
                })}
                {grouped[stage].length === 0 && <p className="px-2 py-8 text-center text-xs text-gray-400">{t.inquiries.column.empty}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} className="m-4 max-w-2xl" title={t.inquiries.modal.title}>
        <div className="grid max-h-[75vh] gap-6 overflow-y-auto p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.inquiries.section.contact}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.inquiries.field.contactName} required>
                <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder={t.inquiries.field.contactNamePlaceholder} />
              </Field>
              <Field label={t.inquiries.field.phone}>
                <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} placeholder="+387 61 ..." />
              </Field>
              <Field label={t.inquiries.field.email}>
                <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value || null })} placeholder="email@domain.ba" />
              </Field>
              <Field label={t.inquiries.field.source}>
                <Select value={form.source} onChange={(value) => setForm({ ...form, source: value })} options={SOURCE_VALUES.map((s) => ({ value: s, label: t.inquiries.source[s] }))} />
              </Field>
            </div>
          </div>

          <div className="sm:col-span-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.inquiries.section.trip}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.inquiries.field.tripType}>
                <Select value={form.tripType} onChange={(value) => setForm({ ...form, tripType: value as InquiryTripType })} options={TRIP_TYPE_VALUES.map((tt) => ({ value: tt, label: t.inquiries.tripType[tt] }))} />
              </Field>
              <Field label={t.inquiries.field.destination}>
                <Input value={form.destination || ''} onChange={(e) => setForm({ ...form, destination: e.target.value || null })} placeholder={t.inquiries.field.destinationPlaceholder} />
              </Field>
              <Field label={t.inquiries.field.travelers}>
                <Input type="number" min="1" value={form.travelers} onChange={(e) => setForm({ ...form, travelers: Number(e.target.value) })} />
              </Field>
              <Field label={t.inquiries.field.travelStart}>
                <Input type="date" value={form.travelStart || ''} onChange={(e) => setForm({ ...form, travelStart: e.target.value || null })} />
              </Field>
              <Field label={t.inquiries.field.travelEnd}>
                <Input type="date" value={form.travelEnd || ''} onChange={(e) => setForm({ ...form, travelEnd: e.target.value || null })} />
              </Field>
            </div>
          </div>

          <div className="sm:col-span-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.inquiries.section.budget}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.inquiries.field.budget}>
                <Input type="number" min="0" value={form.budget || ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} placeholder="0" />
              </Field>
              <Field label={t.inquiries.field.currency}>
                <Select value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label={t.inquiries.field.nextAction}>
                <Input type="datetime-local" value={form.nextActionAt || ''} onChange={(e) => setForm({ ...form, nextActionAt: e.target.value || null })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={t.inquiries.field.notes}>
                <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} placeholder={t.inquiries.field.notesPlaceholder} rows={3} className="h-auto min-h-[84px] w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:col-span-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? t('common.saving') : t.inquiries.saveButton}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) { return <div><Label>{label}{required ? <span className="ml-1 text-error-500">*</span> : null}</Label><div className="mt-1.5">{children}</div></div>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>; }
