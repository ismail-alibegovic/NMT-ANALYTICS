import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import { useT } from "../lib/i18n/context";
import { formatCurrency as formatMoney } from "../utils/business";
import { getCustomer, getCustomerTimeline, Customer, TimelineEvent } from "../api/customers";
import { getReservations, Reservation } from "../api/reservations";

type Tab = "info" | "reservations" | "timeline";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const d = t.customerDetail;
  const locale = lang === 'bs' ? 'bs-BA' : 'en-GB';
  const currencyCode = (value: unknown) => typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
  const formatCurrency = (value: unknown, currency?: unknown) => {
    const code = currencyCode(currency);
    if (!code) return d.unknownCurrency;
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) return d.unavailable;
    return formatMoney(Number(value), code, locale);
  };
  const formatDate = (value: string) => {
    if (!value) return '-';
    const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(calendarDay ? `${value}T00:00:00` : value);
    if (!Number.isFinite(date.getTime())) return '-';
    const pad = (part: number) => String(part).padStart(2, '0');
    const day = pad(date.getDate()), month = pad(date.getMonth() + 1), year = date.getFullYear();
    // Numeric Bosnian date/time remains readable even when browser CLDR data is incomplete.
    const formatted = lang === 'bs' ? `${day}.${month}.${year}.` : `${day}/${month}/${year}`;
    return calendarDay ? formatted : `${formatted}${lang === 'bs' ? ' ' : ', '}${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const statusText = (status: string) => ({ ...t.statusLabels, active: t.customers.active, lead: t.customers.lead, archived: t.customers.archived })[status] || d.unknownStatus;
  const statusBadge = (status: string) => {
    const colors: Record<string, 'success' | 'info' | 'warning' | 'error'> = { active: 'success', lead: 'info', archived: 'warning', confirmed: 'success', pending: 'warning', cancelled: 'error', completed: 'info' };
    return <Badge color={colors[status] || 'light'}>{statusText(status)}</Badge>;
  };
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [totalReservations, setTotalReservations] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("info");

  useEffect(() => {
    let current = true;
    setLoading(true); setLoadError(false); setCustomer(null); setReservations([]); setTimeline([]);
    if (!id) { setLoading(false); return; }
    (async () => {
      let customerMissing = false;
      try {
        const customerRequest = getCustomer(id).catch(error => {
          customerMissing = error?.response?.status === 404;
          throw error;
        });
        const [cust, res, tl] = await Promise.all([customerRequest, getReservations({ customerId: id, limit: 50 }), getCustomerTimeline(id)]);
        if (!current) return;
        setCustomer(cust); setReservations(res.data); setTimeline(tl);
        setTotalReservations(res.total);
      } catch {
        if (!current) return;
        setLoadError(!customerMissing);
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [id, refresh]);

  const totals = new Map<string, { currency: string; booked: number | null; paid: number | null; balance: number | null }>();
  let missingCurrency = 0;
  const add = (sum: number | null, amount: unknown): number | null => sum === null || amount === null || amount === undefined || (typeof amount === 'string' && !amount.trim()) || !Number.isFinite(Number(amount)) ? null : sum + Number(amount);
  for (const reservation of reservations) {
    const currency = currencyCode(reservation.currency);
    if (!currency) { missingCurrency++; continue; }
    const group = totals.get(currency) || { currency, booked: 0, paid: 0, balance: 0 };
    group.booked = add(group.booked, reservation.totalAmount);
    group.paid = add(group.paid, reservation.paidAmount);
    group.balance = add(group.balance, reservation.balanceDue);
    totals.set(currency, group);
  }

  const reservationCols: Column<Reservation>[] = [
    { key: "packageName", header: t.reservations.package },
    { key: "departureName", header: t.reservations.departure },
    { key: "totalAmount", header: t.reservations.amount, render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "paidAmount", header: t.reservations.paidAmount, render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "balanceDue", header: t.reservations.balance, render: (v, r) => (
      <span className={(v as number) > 0 ? "text-error-600 font-semibold" : ""}>{formatCurrency(v as number, r.currency)}</span>
    )},
    { key: "status", header: t.common.status, render: (v) => statusBadge(v as string) },
    { key: "bookingDate", header: t.reservations.bookingDate, render: (v) => formatDate(v as string) },
  ];

  const timelineCols: Column<TimelineEvent>[] = [
    {
      key: "createdAt", header: d.time, render: (v) => formatDate(v as string),
    },
    {
      key: "type", header: d.type, render: (v) => (
        <Badge color={v === "audit" ? "info" : "primary"} size="sm">{v === "audit" ? d.audit : d.reservation}</Badge>
      ),
    },
    {
      key: "action", header: d.action, render: (v) => (
        <span className="capitalize">{({ CREATE: d.created, UPDATE: d.updated, DELETE: d.deleted, RESERVATION_CREATED: d.reservationCreated } as Record<string, string>)[String(v).toUpperCase()] || d.otherAction}</span>
      ),
    },
    {
      key: "details", header: d.details, render: (_, e) => (
        <span className="text-xs text-gray-500 truncate max-w-[200px] inline-block">
          {e.type === "reservation"
            ? `${formatCurrency(e.details?.totalAmount, e.details?.currency)} — ${statusText(e.details?.status)}`
            : e.details?.oldValues
              ? d.updated
              : e.details?.newValues
                ? d.created
                : "-"}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <>
        <PageMeta title={`${t.customers.customerDetails} | Travline`} description={d.description} />
        <div role="status" aria-label={t.common.loading} className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (loadError) return <div className="p-6 text-gray-900 dark:text-gray-100">
    <div role="alert">{d.loadError}</div>
    <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{d.retry}</Button>
  </div>;

  if (!customer) {
    return (
      <div className="p-6">
        <EmptyState title={d.notFound} description={d.notFoundDescription} action={{ label: d.backToCustomers, onClick: () => navigate("/customers") }} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "info", label: d.info },
    { key: "reservations", label: t.customers.reservations, count: reservations.length },
    { key: "timeline", label: d.activity, count: timeline.length },
  ];

  return (
    <>
      <PageMeta title={`${customer.full_name} | Travline`} description={d.descriptionFor.replace('{name}', customer.full_name)} />

      <div className="p-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/customers")} className="flex items-center gap-1">
            &larr; {t.common.back}
          </Button>
        </div>

        <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center">
                <span className="text-xl font-bold text-brand-600 dark:text-brand-400">
                  {customer.full_name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.full_name}</h1>
                <p className="text-sm text-gray-500">{customer.email || d.noEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">{statusBadge(customer.status || "active")}</div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">{t.customers.phone}</span>
              <span className="font-medium dark:text-gray-200">{customer.phone || "-"}</span>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">{t.customers.email}</span>
              <span className="font-medium dark:text-gray-200">{customer.email || "-"}</span>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">{t.customers.created}</span>
              <span className="font-medium dark:text-gray-200">{formatDate(customer.created_at)}</span>
            </div>
          </div>

          {customer.notes && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block mb-1">{t.customers.notes}</span>
              <p className="text-sm dark:text-gray-300">{customer.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        {activeTab === "info" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{d.summary}</h3>
            <p className="text-sm mb-4 text-gray-500 dark:text-gray-400">{d.loadedNotice.replace('{loaded}', String(reservations.length)).replace('{total}', String(totalReservations))}</p>
            <div><span className="text-xs text-gray-500 block">{d.loadedReservations}</span><span className="font-medium dark:text-gray-200">{reservations.length}</span></div>
            {Array.from(totals.values()).sort((a, b) => a.currency.localeCompare(b.currency)).map(group => (
              <section key={group.currency} aria-label={group.currency} className="mt-4">
                <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">{group.currency}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-xs text-gray-500 block">{t.customers.totalSpent}</span><span className="font-medium dark:text-gray-200">{formatCurrency(group.paid, group.currency)}</span></div>
                  <div><span className="text-xs text-gray-500 block">{d.totalBooked}</span><span className="font-medium dark:text-gray-200">{formatCurrency(group.booked, group.currency)}</span></div>
                  <div><span className="text-xs text-gray-500 block">{d.outstandingBalance}</span><span className="font-medium text-error-600">{formatCurrency(group.balance, group.currency)}</span></div>
                </div>
              </section>
            ))}
            {totals.size === 0 && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{d.noMonetaryData}</p>}
            {missingCurrency > 0 && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{d.unknownCurrencyNotice.replace('{count}', String(missingCurrency))}</p>}
          </div>
        )}

        {activeTab === "reservations" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            {reservations.length > 0 ? (
              <DataTable data={reservations} columns={reservationCols} />
            ) : (
              <EmptyState title={d.noReservations} description={d.noReservationsDescription} />
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            {timeline.length > 0 ? (
              <DataTable data={timeline} columns={timelineCols} />
            ) : (
              <EmptyState title={d.noActivity} description={d.noActivityDescription} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
