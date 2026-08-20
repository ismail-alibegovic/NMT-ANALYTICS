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

const stages: { key: InquiryStage; label: string }[] = [
  { key: 'new', label: 'Novo' }, { key: 'qualified', label: 'Kvalifikovano' },
  { key: 'proposal', label: 'Ponuda' }, { key: 'follow_up', label: 'Praćenje' },
  { key: 'won', label: 'Dobijeno' }, { key: 'lost', label: 'Izgubljeno' },
];

const tripTypes: { value: InquiryTripType; label: string }[] = [
  { value: 'scheduled_group', label: 'Grupni polazak' }, { value: 'tailor_made', label: 'Putovanje po mjeri / DMC' },
  { value: 'accommodation_only', label: 'Samo smještaj' }, { value: 'flight_only', label: 'Avio karta' },
  { value: 'corporate', label: 'Poslovno putovanje' }, { value: 'pilgrimage', label: 'Vjersko putovanje' },
  { value: 'excursion', label: 'Izlet / ekskurzija' }, { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Ostalo' },
];

const emptyForm: CreateInquiry = { contactName: '', phone: null, email: null, tripType: 'other', source: 'phone', destination: null, travelStart: null, travelEnd: null, travelers: 1, budget: null, currency: 'BAM', nextActionAt: null, notes: null };

export default function Inquiries() {
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
    catch (err: any) { showError(err?.message || 'Upiti se ne mogu učitati'); }
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
  const grouped = useMemo(() => Object.fromEntries(stages.map((stage) => [stage.key, items.filter((item) => item.stage === stage.key)])) as Record<InquiryStage, Inquiry[]>, [items]);

  const save = async () => {
    if (!form.contactName.trim()) return showError('Ime kontakta je obavezno');
    setSaving(true);
    try {
      await createInquiry({ ...form, budget: form.budget ? Number(form.budget) : null, travelers: Number(form.travelers) });
      success('Upit je evidentiran'); setIsOpen(false); setForm(emptyForm); await load(search);
    } catch (err: any) { showError(err?.message || 'Upit nije sačuvan'); }
    finally { setSaving(false); }
  };

  const move = async (item: Inquiry, stage: InquiryStage) => {
    const previous = items;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, stage } : row));
    try { await updateInquiry(item.id, { stage }); }
    catch (err: any) { setItems(previous); showError(err?.message || 'Faza nije ažurirana'); }
  };

  return (
    <>
      <PageMeta title="Upiti | Travline" description="Prodajni upiti svih tipova putovanja" />
      <PageToolbar title="Upiti" description="Jedinstven prodajni tok za sve vrste agencija i putovanja" searchValue={search} onSearchChange={(value) => { setSearch(value); void load(value); }} searchPlaceholder="Kontakt, destinacija ili telefon…" createButton={{ label: '+ Novi upit', onClick: () => setIsOpen(true) }} />
      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 2xl:grid-cols-6">{stages.map((stage) => <div key={stage.key} className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title="Nema prodajnih upita" description="Evidentirajte prvi poziv, web zahtjev, partnerski lead ili direktni dolazak." action={{ label: 'Novi upit', onClick: () => setIsOpen(true) }} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <section key={stage.key} className="w-[290px] shrink-0 rounded-xl border border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]">
              <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">{stage.label}</h2><Badge size="sm" color="light">{grouped[stage.key].length}</Badge></header>
              <div className="space-y-3 p-3">
                {grouped[stage.key].map((item) => (
                  <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.contactName}</h3><p className="mt-0.5 truncate text-xs text-gray-500">{item.destination || 'Destinacija nije unesena'}</p></div><Badge size="sm" color="primary">{tripTypes.find((type) => type.value === item.tripType)?.label || item.tripType}</Badge></div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500"><span>{item.travelers} putnik{item.travelers === 1 ? '' : 'a'}</span><span>{item.budget ? `${item.budget.toLocaleString('bs-BA')} ${item.currency}` : 'Budžet nije unesen'}</span></div>
                    {item.nextActionAt && <p className="mt-3 text-xs font-medium text-warning-600 dark:text-warning-400">Sljedeća akcija: {new Date(item.nextActionAt).toLocaleString('bs-BA')}</p>}
                    <button type="button" onClick={() => navigate(`/itineraries?new=1&inquiryId=${item.id}`)} className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">Kreiraj itinerer →</button>
                    <select value={item.stage} onChange={(event) => void move(item, event.target.value as InquiryStage)} className="mt-4 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200" aria-label={`Faza upita ${item.contactName}`}>{stages.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
                  </article>
                ))}
                {grouped[stage.key].length === 0 && <p className="px-2 py-8 text-center text-xs text-gray-400">Nema upita u ovoj fazi</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} className="m-4 max-w-2xl" title="Novi prodajni upit">
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <Field label="Kontakt *"><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} /></Field>
          <Field label="Email"><Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value || null })} /></Field>
          <Field label="Vrsta zahtjeva"><Select value={form.tripType} onChange={(value) => setForm({ ...form, tripType: value as InquiryTripType })} options={tripTypes} /></Field>
          <Field label="Destinacija"><Input value={form.destination || ''} onChange={(e) => setForm({ ...form, destination: e.target.value || null })} /></Field>
          <Field label="Broj putnika"><Input type="number" min="1" value={form.travelers} onChange={(e) => setForm({ ...form, travelers: Number(e.target.value) })} /></Field>
          <Field label="Početak putovanja"><Input type="date" value={form.travelStart || ''} onChange={(e) => setForm({ ...form, travelStart: e.target.value || null })} /></Field>
          <Field label="Kraj putovanja"><Input type="date" value={form.travelEnd || ''} onChange={(e) => setForm({ ...form, travelEnd: e.target.value || null })} /></Field>
          <Field label="Okvirni budžet"><Input type="number" min="0" value={form.budget || ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Izvor"><Select value={form.source} onChange={(value) => setForm({ ...form, source: value })} options={[{ value: 'phone', label: 'Telefon' }, { value: 'web', label: 'Web' }, { value: 'email', label: 'Email' }, { value: 'walk_in', label: 'Direktan dolazak' }, { value: 'partner', label: 'Partner' }, { value: 'social', label: 'Društvene mreže' }, { value: 'referral', label: 'Preporuka' }, { value: 'other', label: 'Ostalo' }]} /></Field>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:col-span-2"><Button variant="outline" onClick={() => setIsOpen(false)}>Odustani</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Čuvanje…' : 'Sačuvaj upit'}</Button></div>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>; }
