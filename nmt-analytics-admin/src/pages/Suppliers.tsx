import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { createSupplier, createSupplierService, getSuppliers, updateSupplier, type CreateSupplier, type CreateSupplierService, type ServiceCategory, type ServiceUnit, type Supplier, type SupplierCategory } from '../api/suppliers';

const supplierCategories: SupplierCategory[] = ['accommodation', 'transport', 'airline', 'guide', 'activity', 'restaurant', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'];
const serviceCategories: ServiceCategory[] = ['accommodation', 'transport', 'flight', 'guide', 'activity', 'meal', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'];
const serviceUnits: ServiceUnit[] = ['per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group', 'per_booking', 'per_day', 'per_hour', 'fixed'];

const emptySupplier: CreateSupplier = { name: '', category: 'other', status: 'active', defaultCurrency: 'BAM', country: null, city: null, address: null, taxId: null, contactName: null, email: null, phone: null, website: null, paymentTerms: null, notes: null };
const emptyService: CreateSupplierService = { name: '', category: 'other', unit: 'fixed', netPrice: 0, currency: 'BAM', taxRate: 0, defaultMarkup: 0, active: true, validFrom: null, validTo: null, minQuantity: null, maxQuantity: null, notes: null };

export default function Suppliers() {
  const { t } = useT();
  const c = t.suppliers;
  const { success, error: showError } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState<CreateSupplier>(emptySupplier);
  const [serviceForm, setServiceForm] = useState<CreateSupplierService>(emptyService);

  const load = async (nextSearch = search, nextCategory = category) => {
    setLoading(true);
    try {
      const rows = await getSuppliers({ search: nextSearch, category: nextCategory });
      setSuppliers(rows);
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || null);
    } catch (err: any) { showError(err?.message || c.loadError); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load('', ''); }, []);
  const selected = useMemo(() => suppliers.find((supplier) => supplier.id === selectedId) || null, [suppliers, selectedId]);
  const categoryLabel = (value: string) => c.categories[value as keyof typeof c.categories] || value;
  const unitLabel = (value: string) => c.units[value as keyof typeof c.units] || value;

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) return showError(c.nameRequired);
    setSaving(true);
    try {
      const created = await createSupplier(supplierForm);
      success(c.supplierSaved); setSupplierOpen(false); setSupplierForm(emptySupplier);
      await load(); setSelectedId(created.id);
    } catch (err: any) { showError(err?.message || c.saveError); }
    finally { setSaving(false); }
  };

  const saveService = async () => {
    if (!selected || !serviceForm.name.trim()) return showError(c.serviceNameRequired);
    setSaving(true);
    try {
      await createSupplierService(selected.id, { ...serviceForm, netPrice: Number(serviceForm.netPrice), taxRate: Number(serviceForm.taxRate), defaultMarkup: Number(serviceForm.defaultMarkup) });
      success(c.serviceSaved); setServiceOpen(false); setServiceForm({ ...emptyService, currency: selected.defaultCurrency }); await load();
    } catch (err: any) { showError(err?.message || c.saveError); }
    finally { setSaving(false); }
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const status = selected.status === 'active' ? 'inactive' : 'active';
    try { await updateSupplier(selected.id, { status }); success(c.statusUpdated); await load(); }
    catch (err: any) { showError(err?.message || c.saveError); }
  };

  const openService = () => {
    if (!selected) return;
    setServiceForm({ ...emptyService, currency: selected.defaultCurrency });
    setServiceOpen(true);
  };

  return (
    <>
      <PageMeta title={`${c.title} | Travline`} description={c.description} />
      <PageToolbar
        title={c.title} description={c.description} searchValue={search} searchPlaceholder={c.search}
        onSearchChange={(value) => { setSearch(value); void load(value, category); }}
        filters={[{ key: 'category', label: c.allCategories, value: category, onChange: (value) => { setCategory(value); void load(search, value); }, options: supplierCategories.map((value) => ({ value, label: categoryLabel(value) })) }]}
        createButton={{ label: c.addSupplier, onClick: () => setSupplierOpen(true) }}
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]"><div className="h-[520px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" /><div className="h-[520px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" /></div>
      ) : suppliers.length === 0 ? (
        <EmptyState title={c.emptyTitle} description={c.emptyDescription} action={{ label: c.addSupplier, onClick: () => setSupplierOpen(true) }} />
      ) : (
        <div className="grid min-h-[520px] overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[340px_minmax(0,1fr)] dark:border-gray-800 dark:bg-gray-900">
          <aside className="border-b border-gray-200 lg:border-b-0 lg:border-r dark:border-gray-800">
            <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:text-gray-400">{suppliers.length} {c.suppliersCount}</div>
            <div className="max-h-[620px] overflow-y-auto p-2">
              {suppliers.map((supplier) => (
                <button key={supplier.id} onClick={() => { setSelectedId(supplier.id); setServiceOpen(false); }} className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${selectedId === supplier.id ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{supplier.name}</span><span className={`mt-1 size-2 shrink-0 rounded-full ${supplier.status === 'active' ? 'bg-success-500' : 'bg-gray-300 dark:bg-gray-600'}`} aria-label={supplier.status === 'active' ? c.active : c.inactive} /></div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400"><span className="truncate">{categoryLabel(supplier.category)}</span><span>{supplier.services.length} {c.servicesCount}</span></div>
                  {(supplier.city || supplier.country) && <p className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">{[supplier.city, supplier.country].filter(Boolean).join(', ')}</p>}
                </button>
              ))}
            </div>
          </aside>

          {selected && (
            <section className="min-w-0">
              <header className="flex flex-col gap-4 border-b border-gray-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-semibold text-gray-900 dark:text-white">{selected.name}</h2><Badge size="sm" color={selected.status === 'active' ? 'success' : 'light'}>{selected.status === 'active' ? c.active : c.inactive}</Badge></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{categoryLabel(selected.category)}{selected.city ? ` · ${selected.city}` : ''}{selected.country ? `, ${selected.country}` : ''}</p></div>
                <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => void toggleStatus()}>{selected.status === 'active' ? c.deactivate : c.activate}</Button><Button size="sm" onClick={openService}>{c.addService}</Button></div>
              </header>

              <div className="grid gap-x-8 gap-y-3 border-b border-gray-100 px-5 py-4 text-sm sm:grid-cols-2 xl:grid-cols-3 dark:border-gray-800">
                <Detail label={c.contact} value={selected.contactName} /><Detail label={c.phone} value={selected.phone} /><Detail label={c.email} value={selected.email} />
                <Detail label={c.paymentTerms} value={selected.paymentTerms} /><Detail label={c.taxId} value={selected.taxId} /><Detail label={c.defaultCurrency} value={selected.defaultCurrency} />
              </div>

              {serviceOpen && (
                <div className="border-b border-brand-100 bg-brand-50/50 px-5 py-5 dark:border-brand-500/20 dark:bg-brand-500/[0.05]">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.newService}</h3><p className="mt-0.5 max-w-3xl text-xs leading-5 text-gray-500 dark:text-gray-400">{c.newServiceDescription}</p></div><button type="button" onClick={() => setServiceOpen(false)} className="self-end text-sm font-medium text-gray-500 hover:text-gray-800 sm:self-start dark:hover:text-white">{c.close}</button></div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label={c.serviceName}><Input value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} /></Field>
                    <Field label={c.category}><Select value={serviceForm.category} onChange={(value) => setServiceForm({ ...serviceForm, category: value as ServiceCategory })} options={serviceCategories.map((value) => ({ value, label: categoryLabel(value) }))} /></Field>
                    <Field label={c.unit}><Select value={serviceForm.unit} onChange={(value) => setServiceForm({ ...serviceForm, unit: value as ServiceUnit })} options={serviceUnits.map((value) => ({ value, label: unitLabel(value) }))} /></Field>
                    <Field label={c.netPrice}><Input type="number" min="0" value={serviceForm.netPrice} onChange={(e) => setServiceForm({ ...serviceForm, netPrice: Number(e.target.value) })} /></Field>
                    <Field label={c.currency}><Input value={serviceForm.currency} onChange={(e) => setServiceForm({ ...serviceForm, currency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
                    <Field label={c.taxRate}><Input type="number" min="0" max="100" value={serviceForm.taxRate} onChange={(e) => setServiceForm({ ...serviceForm, taxRate: Number(e.target.value) })} /></Field>
                    <Field label={c.defaultMarkup}><Input type="number" min="0" value={serviceForm.defaultMarkup} onChange={(e) => setServiceForm({ ...serviceForm, defaultMarkup: Number(e.target.value) })} /></Field>
                    <div className="flex items-end justify-end gap-2 sm:col-span-2 xl:col-span-4"><Button variant="outline" onClick={() => setServiceOpen(false)}>{c.cancel}</Button><Button onClick={() => void saveService()} disabled={saving}>{saving ? c.saving : c.saveService}</Button></div>
                  </div>
                </div>
              )}

              <div className="px-5 py-5">
                <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.serviceCatalogue}</h3><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{c.serviceCatalogueDescription}</p></div></div>
                {selected.services.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700"><p className="text-sm font-medium text-gray-700 dark:text-gray-200">{c.noServices}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-gray-500 dark:text-gray-400">{c.noServicesDescription}</p><Button size="sm" className="mt-4" onClick={openService}>{c.addService}</Button></div>
                ) : (
                  <><div className="space-y-3 sm:hidden">{selected.services.map((service) => <article key={service.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-gray-900 dark:text-white">{service.name}</h4><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{categoryLabel(service.category)} · {unitLabel(service.unit)}</p></div><Badge size="sm" color={service.active ? 'success' : 'light'}>{service.active ? c.active : c.inactive}</Badge></div><div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs dark:border-gray-800"><span className="text-gray-500 dark:text-gray-400">{c.netPrice}: <strong className="text-gray-900 dark:text-white">{service.netPrice.toLocaleString()} {service.currency}</strong></span><span className="text-gray-500 dark:text-gray-400">{c.defaultMarkup}: <strong className="text-gray-900 dark:text-white">{service.defaultMarkup}%</strong></span></div></article>)}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"><th className="px-3 py-3 font-medium">{c.serviceName}</th><th className="px-3 py-3 font-medium">{c.category}</th><th className="px-3 py-3 font-medium">{c.unit}</th><th className="px-3 py-3 text-right font-medium">{c.netPrice}</th><th className="px-3 py-3 text-right font-medium">{c.defaultMarkup}</th><th className="px-3 py-3 font-medium">{c.status}</th></tr></thead><tbody>{selected.services.map((service) => <tr key={service.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800"><td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{service.name}</td><td className="px-3 py-3 text-gray-600 dark:text-gray-300">{categoryLabel(service.category)}</td><td className="px-3 py-3 text-gray-600 dark:text-gray-300">{unitLabel(service.unit)}</td><td className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-white">{service.netPrice.toLocaleString()} {service.currency}</td><td className="px-3 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{service.defaultMarkup}%</td><td className="px-3 py-3"><Badge size="sm" color={service.active ? 'success' : 'light'}>{service.active ? c.active : c.inactive}</Badge></td></tr>)}</tbody></table></div></>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal isOpen={supplierOpen} onClose={() => setSupplierOpen(false)} className="m-4 max-w-2xl" title={c.addSupplier}>
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <Field label={`${c.name} *`}><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></Field>
          <Field label={c.category}><Select value={supplierForm.category} onChange={(value) => setSupplierForm({ ...supplierForm, category: value as SupplierCategory })} options={supplierCategories.map((value) => ({ value, label: categoryLabel(value) }))} /></Field>
          <Field label={c.contact}><Input value={supplierForm.contactName || ''} onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value || null })} /></Field>
          <Field label={c.phone}><Input value={supplierForm.phone || ''} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value || null })} /></Field>
          <Field label={c.email}><Input type="email" value={supplierForm.email || ''} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value || null })} /></Field>
          <Field label={c.website}><Input type="url" value={supplierForm.website || ''} onChange={(e) => setSupplierForm({ ...supplierForm, website: e.target.value || null })} /></Field>
          <Field label={c.city}><Input value={supplierForm.city || ''} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value || null })} /></Field>
          <Field label={c.country}><Input value={supplierForm.country || ''} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value || null })} /></Field>
          <Field label={c.taxId}><Input value={supplierForm.taxId || ''} onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value || null })} /></Field>
          <Field label={c.defaultCurrency}><Input value={supplierForm.defaultCurrency} onChange={(e) => setSupplierForm({ ...supplierForm, defaultCurrency: e.target.value.toUpperCase().slice(0, 3) })} /></Field>
          <Field label={c.paymentTerms}><Input value={supplierForm.paymentTerms || ''} onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value || null })} /></Field>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800"><Button variant="outline" onClick={() => setSupplierOpen(false)}>{c.cancel}</Button><Button onClick={() => void saveSupplier()} disabled={saving}>{saving ? c.saving : c.saveSupplier}</Button></div>
        </div>
      </Modal>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) { return <div><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{value || '—'}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>; }
