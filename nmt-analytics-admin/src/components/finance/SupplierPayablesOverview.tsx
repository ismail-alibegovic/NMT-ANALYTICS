import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../../lib/i18n/context';
import { getSupplierPayablesOverview, type PayableOverviewStatus, type SupplierPayablesOverview as Overview } from '../../api/supplierPayables';

const selectClass = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white';
const buttonClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-700';

export default function SupplierPayablesOverview() {
  const { t, lang } = useT();
  const c = t.supplierPayablesOverview;
  const [filters, setFilters] = useState<{ supplierId: string; status: PayableOverviewStatus; page: number }>({ supplierId: '', status: 'open', page: 1 });
  const [result, setResult] = useState<Overview | null>(null);
  const [suppliers, setSuppliers] = useState<Overview['suppliers']>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setResult(null);
    getSupplierPayablesOverview(filters).then(data => {
      if (active) { setResult(data); setSuppliers(data.suppliers); }
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, refresh]);
  const money = (amount: number, currency: string) => `${amount.toLocaleString(lang === 'bs' ? 'bs-BA' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const date = (value: string) => new Intl.DateTimeFormat(lang === 'bs' ? 'bs-BA' : 'en-GB', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  return <section aria-label={c.title} className="mt-6 min-w-0 rounded-xl border border-gray-200 bg-white p-4 text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{c.title}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.description}</p></div>
      <button className={buttonClass} onClick={() => setRefresh(value => value+1)} disabled={loading}>{c.refresh}</button>
    </div>
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{t.supplierPayables.supplier}<select className={`${selectClass} mt-1`} value={filters.supplierId} onChange={e => setFilters({ ...filters, supplierId: e.target.value, page: 1 })}>
        <option value="">{c.allSuppliers}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <label className="text-sm">{c.filter}<select className={`${selectClass} mt-1`} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value as PayableOverviewStatus, page: 1 })}>
        {(['open','overdue','all','paid','cancelled'] as const).map(status => <option key={status} value={status}>{c.filters[status]}</option>)}
      </select></label>
    </div>
    {loading ? <p role="status">{c.loading}</p> : failed ? <div role="alert"><p>{c.error}</p><button className={`${buttonClass} mt-2`} onClick={() => setRefresh(value => value+1)}>{c.retry}</button></div> : result ? <>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{c.asOf}: {date(result.asOfDate)} ({result.timezone}). {c.scope}</p>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {result.currencies.map(total => <div key={total.currency} data-currency={total.currency} className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
          <h3 className="font-semibold">{total.currency}</h3><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt>{c.outstanding}</dt><dd className="font-semibold">{money(total.outstanding,total.currency)}</dd></div>
            <div><dt>{c.overdue}</dt><dd className="font-semibold text-error-600 dark:text-error-400">{money(total.overdue,total.currency)}</dd></div>
            <div><dt>{c.dueToday}</dt><dd className="font-semibold">{money(total.dueToday,total.currency)}</dd></div>
          </dl>
        </div>)}
      </div>
      {result.payables.length === 0 ? <p>{c.empty}</p> : <ul className="space-y-3">{result.payables.map(row => <li key={row.id} data-payable-id={row.id} className="min-w-0 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{row.supplierName}</h3><p className="break-words text-sm text-gray-500 dark:text-gray-400">{row.label}</p></div>
          <span className={`text-sm ${row.overdue ? 'font-semibold text-error-600 dark:text-error-400' : ''}`}>{row.overdue ? c.overdue : t.supplierPayables.status[row.status]}</span>
        </div>
        <dl className="my-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt>{t.supplierPayables.dueDate}</dt><dd>{date(row.dueDate)}</dd></div>
          <div><dt>{t.supplierPayables.amount}</dt><dd>{money(row.amount,row.currency)}</dd></div>
          <div><dt>{t.supplierPayables.paid}</dt><dd>{money(row.paid,row.currency)}</dd></div>
          <div><dt>{t.supplierPayables.remaining}</dt><dd className="font-semibold">{money(row.remaining,row.currency)}</dd></div>
        </dl>
        <Link className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400" to={`/departures/${row.departureId}?tab=finance`}>{c.openDeparture}</Link>
      </li>)}</ul>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{c.page} {result.page} / {Math.max(1,Math.ceil(result.totalCount/result.pageSize))} · {c.count}: {result.totalCount}</span>
        <div className="flex gap-2"><button className={buttonClass} disabled={filters.page<=1} onClick={() => setFilters({ ...filters, page: filters.page-1 })}>{c.previous}</button>
          <button className={buttonClass} disabled={filters.page*result.pageSize>=result.totalCount} onClick={() => setFilters({ ...filters, page: filters.page+1 })}>{c.next}</button></div>
      </div>
    </> : null}
  </section>;
}
