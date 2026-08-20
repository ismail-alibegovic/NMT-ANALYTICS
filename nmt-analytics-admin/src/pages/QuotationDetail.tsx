import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { useT } from '../lib/i18n/context';
import { getQuotation, updateQuotation, quotationPdfUrl, type Quotation } from '../api/quotations';

export default function QuotationDetail() {
  const { id = '' } = useParams(); const { t } = useT(); const c = t.quotations; const { success, error: showError } = useToast();
  const [data, setData] = useState<Quotation | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const load = async () => { setLoading(true); try { setData(await getQuotation(id)); } catch (e: any) { showError(e?.message || c.loadError); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [id]);
  const changeStatus = async (status: Quotation['status']) => { if (!data) return; setSaving(true); try { const updated = await updateQuotation(id, { status }); setData(updated); success(c.statusUpdated); } catch (e: any) { showError(e?.message || c.saveError); } finally { setSaving(false); } };
  const statusColor = (s: string) => s === 'accepted' ? 'success' : s === 'sent' ? 'primary' : s === 'rejected' ? 'error' : s === 'expired' ? 'warning' : 'light';
  const days = [...new Set(data?.items.map((item) => item.dayNumber) || [])].sort((a, b) => a - b);
  const categoryLabel = (cat: string) => c.categories?.[cat as keyof typeof c.categories] || cat;
  if (loading) return <div className="h-[600px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />;
  if (!data) return <EmptyState title={c.notFound} description={c.notFoundDescription} />;
  return <>
    <PageMeta title={`${data.reference} | Travline`} description={c.workspaceDescription} />
    <div className="mb-5"><Link to="/quotations" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">← {c.back}</Link></div>
    <header className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.title}</h1><Badge size="sm" color={statusColor(data.status)}>{c.statuses[data.status]}</Badge><span className="text-sm font-mono text-gray-500 dark:text-gray-400">{data.reference}</span></div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{data.validUntil ? `${c.validUntil}: ${new Date(data.validUntil).toLocaleDateString()}` : c.noExpiry}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.status === 'draft' && <><Button variant="outline" onClick={() => void changeStatus('sent')} disabled={saving}>{c.markSent}</Button></>}
        {data.status === 'sent' && <><Button variant="outline" color="success" onClick={() => void changeStatus('accepted')} disabled={saving}>{c.markAccepted}</Button><Button variant="outline" color="error" onClick={() => void changeStatus('rejected')} disabled={saving}>{c.markRejected}</Button></>}
        <Button variant="outline" onClick={() => window.open(quotationPdfUrl(id), '_blank')}>{c.downloadPdf}</Button>
      </div>
    </header>
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Pill label={c.netTotal} value={`${data.netTotal.toLocaleString()} ${data.currency}`} />
      <Pill label={c.markup} value={`${data.markupStrategy === 'uniform' ? `${data.globalMarkupPercent}% ${c.uniform}` : c.perItem}`} />
      <Pill label={c.sellTotal} value={`${data.sellTotal.toLocaleString()} ${data.currency}`} />
      <Pill label={c.marginTotal} value={`${data.marginTotal.toLocaleString()} ${data.currency}`} />
    </div>
    {data.clientNotes && <section className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.clientNotesLabel}</h3><p className="mt-1 text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400">{data.clientNotes}</p></section>}
    {data.items.length === 0 ? <EmptyState title={c.noItems} description={c.noItemsDescription} /> : <div className="space-y-5">{days.map((day) => <section key={day} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><header className="border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]"><h2 className="text-sm font-semibold text-gray-900 dark:text-white">{c.day} {day}</h2></header><div>{data.items.filter((item) => item.dayNumber === day).map((item) => <article key={item.id} className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 last:border-0 sm:flex-row sm:items-center dark:border-gray-800"><div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">{item.startTime || '—'}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3><Badge size="sm" color="light">{categoryLabel(item.category)}</Badge></div>{item.location && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.location}</p>}<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.quantity} × {item.netUnitPrice.toLocaleString()} {item.currency} · {item.unit}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{item.sellLineTotal.toLocaleString()} {item.currency}</p><p className="text-xs text-gray-500 dark:text-gray-400">{c.net}: {item.netLineTotal.toLocaleString()} {item.currency} · {item.markupPercent}%</p></div></article>)}</div></section>)}</div>}
  </>;
}
function Pill({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p></div>; }
