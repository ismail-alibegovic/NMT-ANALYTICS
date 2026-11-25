import { useState, useEffect, useCallback, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import { DataTable, Column } from "../../components/ui/DataTable";
import Badge from "../../components/ui/badge/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Button from "../../components/ui/button/Button";
import DonutChart from "../../components/charts/DonutChart";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { formatCurrency, formatDate } from "../../utils/business";
import { getPayments, Payment, PaymentFilters } from "../../api/payments";
import { getTransactions, Transaction, TransactionFilters } from "../../api/transactions";
import { getPaymentDashboard, PaymentDashboardResponse, PaymentDashboardPayment, PaymentDashboardMetric } from "../../api/payments";
import { getPaymentStatusDistribution, PaymentStatusResponse } from "../../api/analytics";
import { DollarLineIcon, BoxIconLine, ArrowDownIcon, AlertIcon, DownloadIcon } from "../../icons";

const ITEMS_PER_PAGE = 10;

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";
type Tab = "dashboard" | "payments" | "transactions";

function MetricCard({ title, value, icon: Icon, subtitle, color }: {
  title: string; value: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; subtitle?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex items-center justify-between">
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${color || "bg-indigo-50 dark:bg-indigo-500/10"}`}>
          <Icon className={`size-6 ${color ? "text-white" : "text-indigo-600 dark:text-indigo-400"}`} />
        </div>
      </div>
      <div className="mt-5">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <h4 className="mt-1 font-bold text-gray-900 text-2xl dark:text-white/90">{value}</h4>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

function csvEscape(val: string) {
  if (!val) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function exportTableToCsv(rows: any[], filename: string, columns: { key: string; label: string }[]) {
  const bom = "\uFEFF";
  const header = columns.map(c => csvEscape(c.label)).join(",");
  const data = rows.map(r => columns.map(c => csvEscape(String(r[c.key] ?? ""))).join(","));
  const csv = bom + header + "\n" + data.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UnifiedPayments() {
  const { userContext } = useApp();
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-US" : "bs-BA";
  const u = t.payments.unified;
  const { error: showError } = useToast();
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const uRef = useRef(u);
  uRef.current = u;

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // ---- Dashboard state ----
  const [dashboard, setDashboard] = useState<PaymentDashboardResponse | null>(null);
  const [statusDist, setStatusDist] = useState<PaymentStatusResponse | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState(false);

  // ---- Payments state ----
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState(false);
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");

  // ---- Transactions state ----
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState(false);
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txType, setTxType] = useState("");

  const payTotalPages = Math.max(1, Math.ceil(payTotal / ITEMS_PER_PAGE));
  const txTotalPages = Math.max(1, Math.ceil(txTotal / ITEMS_PER_PAGE));

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: u.tabs.dashboard },
    { key: "payments", label: u.tabs.payments },
    { key: "transactions", label: u.tabs.transactions },
  ];

  // ---- Fetch Dashboard ----
  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashError(false);
    try {
      const [dash, dist] = await Promise.all([
        getPaymentDashboard(),
        getPaymentStatusDistribution(),
      ]);
      setDashboard(dash);
      setStatusDist(dist);
    } catch (err) {
      console.error("Failed to load payment dashboard:", err);
      setDashError(true);
      showErrorRef.current(uRef.current.dashboardLoadError);
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") void fetchDashboard();
  }, [activeTab, fetchDashboard]);

  // ---- Fetch Payments ----
  const fetchPayments = useCallback(async (page = 1) => {
    setPayLoading(true);
    setPayError(false);
    try {
      const filters: PaymentFilters = { page, limit: ITEMS_PER_PAGE };
      if (payFrom) filters.from = payFrom;
      if (payTo) filters.to = payTo;
      const res = await getPayments(filters);
      setPayments(res.data || []);
      setPayTotal(res.pagination?.total || 0);
      setPayPage(page);
    } catch {
      setPayError(true);
      setPayments([]);
      showErrorRef.current(uRef.current.paymentsLoadError);
    } finally {
      setPayLoading(false);
    }
  }, [payFrom, payTo]);

  useEffect(() => {
    if (activeTab === "payments") void fetchPayments(1);
  }, [activeTab, fetchPayments]);

  // ---- Fetch Transactions ----
  const fetchTransactions = useCallback(async (page = 1) => {
    setTxLoading(true);
    setTxError(false);
    try {
      const filters: TransactionFilters = { page, limit: ITEMS_PER_PAGE };
      if (txFrom) filters.dateFrom = txFrom;
      if (txTo) filters.dateTo = txTo;
      if (txType) filters.type = txType;
      const res = await getTransactions(filters);
      setTransactions(res.data || []);
      setTxTotal(res.total || 0);
      setTxPage(page);
    } catch {
      setTxError(true);
      setTransactions([]);
      showErrorRef.current(uRef.current.transactionsLoadError);
    } finally {
      setTxLoading(false);
    }
  }, [txFrom, txTo, txType]);

  useEffect(() => {
    if (activeTab === "transactions") void fetchTransactions(1);
  }, [activeTab, fetchTransactions]);

  const statusBadge = (status: string) => {
    const colors: Record<string, BadgeColor> = {
      succeeded: "success", pending: "warning", failed: "error", refunded: "info", cancelled: "dark",
      unpaid: "error", partially_paid: "warning", paid: "success",
    };
    const label = (u.statuses as Record<string, string>)[status] || status.replace(/_/g, " ");
    return <Badge color={colors[status] || "light"}>{label}</Badge>;
  };

  const formatMethod = (method: unknown) => {
    if (!method || typeof method !== "string") return "-";
    const mapped = (t.payment.methods as Record<string, string>)[method];
    return mapped || method.replace(/_/g, " ");
  };

  const formatTxType = (type: string) =>
    (u.txTypes as Record<string, string>)[type] || type;

  // ---- Chart data ----
  const statusOrder = ["succeeded", "pending", "failed", "refunded", "cancelled"];
  const chartLabels: string[] = [];
  const chartSeries: number[] = [];
  if (statusDist?.breakdown) {
    for (const s of statusOrder) {
      if (statusDist.breakdown[s]) {
        chartLabels.push((u.statuses as Record<string, string>)[s] || s);
        chartSeries.push(statusDist.breakdown[s].total);
      }
    }
  }
  const statusColors = ["#12B76A", "#F79009", "#F04438", "#667085"];

  // ---- Columns ----
  const overdueColumns: Column<PaymentDashboardMetric>[] = [
    { key: "customerName", header: u.columns.traveler, render: (_, r) => (
      <div>
        <div className="font-medium">{r.customerName}</div>
        {r.customerPhone && <div className="text-xs text-gray-500">{r.customerPhone}</div>}
      </div>
    )},
    { key: "packageName", header: u.columns.package },
    { key: "departureDate", header: u.columns.departure, render: (v) => formatDate(v as string, locale) },
    { key: "balanceDue", header: u.columns.balanceDue, render: (v, r) => (
      <span className="font-semibold text-error-600">{formatCurrency(v as number, r.currency || "BAM", locale)}</span>
    )},
    { key: "paymentStatus", header: u.columns.status, render: (v) => statusBadge(v as string) },
  ];

  const paymentColumns: Column<PaymentDashboardPayment>[] = [
    { key: "customerName", header: u.columns.traveler },
    { key: "amount", header: u.columns.amount, render: (v, p) => (
      <span className="font-semibold">{formatCurrency(v as number, p.currency || "BAM", locale)}</span>
    )},
    { key: "status", header: u.columns.status, render: (v) => statusBadge(v as string) },
    { key: "paymentDate", header: u.columns.date, render: (v) => formatDate(v as string, locale) },
    { key: "paymentMethod", header: u.columns.method, render: (v) => formatMethod(v) },
    { key: "createdAt", header: u.columns.createdAt, render: (v) => formatDate(v as string, locale) },
  ];

  const paymentListColumns: Column<Payment>[] = [
    { key: "id", header: u.columns.id, render: (v) => <span className="text-xs font-mono">{v ? String(v).substring(0, 8) : "—"}</span> },
    { key: "amount", header: u.columns.amount, render: (v, r) => formatCurrency(v as number, r.currency || "BAM", locale) },
    { key: "payment_method", header: u.columns.method, render: (v) => formatMethod(v) },
    { key: "status", header: u.columns.status, render: (v) => statusBadge(v as string) },
    { key: "paymentDate", header: u.columns.date, render: (v) => formatDate(v as string, locale) },
    { key: "reservation", header: u.columns.reservation, render: (v) => v ? (v as any).customerName || "-" : "-" },
  ];

  const txColumns: Column<Transaction>[] = [
    { key: "id", header: u.columns.id, render: (v) => <span className="text-xs font-mono">{v ? String(v).substring(0, 8) : "—"}</span> },
    { key: "type", header: u.columns.type, render: (v) => formatTxType(String(v || "")) },
    { key: "amount", header: u.columns.amount, render: (v, r) => formatCurrency(v as number, r.currency || "BAM", locale) },
    { key: "note", header: u.columns.note },
    { key: "occurred_at", header: u.columns.date, render: (v) => formatDate(v as string, locale) },
  ];

  // ---- Export ----
  const m = dashboard?.metrics;
  const orgCurrency = dashboard?.currency || userContext?.org?.currency || "BAM";
  const isMixedCurrency = Boolean(dashboard?.multiCurrency);
  const metricMoney = (val: number | null | undefined) =>
    dashError ? "—" : isMixedCurrency || val == null ? t.reports.selectCurrency : formatCurrency(val, orgCurrency, locale);
  const hasOverdue = Boolean(dashboard?.overdueReservations && dashboard.overdueReservations.length > 0);
  const hasRecent = Boolean(dashboard?.recentPayments && dashboard.recentPayments.length > 0);

  const overdueCsvCols = [
    { key: "customerName", label: u.columns.traveler },
    { key: "packageName", label: u.columns.package },
    { key: "departureDate", label: u.columns.departure },
    { key: "balanceDue", label: u.columns.balanceDue },
    { key: "paymentStatus", label: u.columns.status },
  ];
  const paymentCsvCols = [
    { key: "customerName", label: u.columns.traveler },
    { key: "amount", label: u.columns.amount },
    { key: "status", label: u.columns.status },
    { key: "paymentDate", label: u.columns.date },
  ];

  return (
    <>
      <PageMeta title={`${t.payments.title} | Travline`} description={t.payments.description} />

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.payments.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{u.pageSubtitle}</p>
      </div>

      {/* Metric Cards - Fail-closed when dashboard query fails */}
      {!dashError && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6 mb-6">
        <MetricCard title={u.paidToday} value={metricMoney(m?.totalPaidToday)} icon={DollarLineIcon} color="bg-success-500" />
        <MetricCard title={u.paidThisMonth} value={metricMoney(m?.totalPaidThisMonth)} icon={BoxIconLine} color="bg-brand-500" />
        <MetricCard
          title={u.overdue}
          value={metricMoney(m?.overdueAmount)}
          icon={ArrowDownIcon}
          subtitle={u.overdueCount.replace("{count}", String(m?.overdueCount ?? 0))}
          color="bg-error-500"
        />
        <MetricCard
          title={u.pending}
          value={metricMoney(m?.totalPendingAmount)}
          icon={AlertIcon}
          subtitle={u.pendingCount.replace("{count}", String(m?.pendingCount ?? 0))}
          color="bg-warning-500"
        />
      </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        dashError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{u.dashboardLoadError}</p>
            <Button type="button" variant="outline" onClick={() => void fetchDashboard()}>{u.retry}</Button>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-error-500" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{u.overdueReservations}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    if (hasOverdue) exportTableToCsv(dashboard!.overdueReservations, "overdue-reservations.csv", overdueCsvCols);
                  }} disabled={!hasOverdue} className="flex items-center gap-1 text-xs">
                    <DownloadIcon className="w-3.5 h-3.5" /> {u.exportCsv}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (hasRecent) exportTableToCsv(dashboard!.recentPayments, "recent-payments.csv", paymentCsvCols);
                  }} disabled={!hasRecent} className="flex items-center gap-1 text-xs">
                    <DownloadIcon className="w-3.5 h-3.5" /> {u.exportPaymentsCsv}
                  </Button>
                </div>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : hasOverdue ? (
                <DataTable data={dashboard!.overdueReservations} columns={overdueColumns} />
              ) : (
                <EmptyState title={u.noOverdueTitle} description={u.noOverdueDesc} />
              )}
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-warning-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{u.pendingPayments}</h3>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : dashboard?.pendingPayments && dashboard.pendingPayments.length > 0 ? (
                <DataTable data={dashboard.pendingPayments} columns={paymentColumns} />
              ) : (
                <EmptyState title={u.noPendingTitle} description={u.noPendingDesc} />
              )}
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-success-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{u.recentPayments}</h3>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : dashboard?.recentPayments && dashboard.recentPayments.length > 0 ? (
                <DataTable data={dashboard.recentPayments} columns={paymentColumns} />
              ) : (
                <EmptyState title={u.noRecentTitle} description={u.noRecentDesc} />
              )}
            </div>
          </div>

          <div>
            <DonutChart
              title={u.distributionTitle}
              subtitle={u.distributionSubtitle}
              labels={chartLabels}
              series={chartSeries}
              colors={statusColors}
            />
          </div>
        </div>
        )
      )}

      {activeTab === "payments" && (
        <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input type="date" aria-label={u.dateFromLabel} value={payFrom} onChange={e => { setPayFrom(e.target.value); setPayPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm dark:text-white" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" aria-label={u.dateToLabel} value={payTo} onChange={e => { setPayTo(e.target.value); setPayPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm dark:text-white" />
            <Button size="sm" onClick={() => void fetchPayments(1)} className="ml-2">{u.filterButton}</Button>
            {(payFrom || payTo) && (
              <button type="button" onClick={() => { setPayFrom(""); setPayTo(""); }} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
                {u.clearFilters}
              </button>
            )}
          </div>

          {payLoading ? (
            <div className="flex justify-center p-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : payError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
              <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{u.paymentsLoadError}</p>
              <Button type="button" variant="outline" onClick={() => void fetchPayments(payPage)}>{u.retry}</Button>
            </div>
          ) : payments.length > 0 ? (
            <>
              <DataTable data={payments} columns={paymentListColumns} />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500">
                  {u.pageSummary
                    .replace("{page}", String(payPage))
                    .replace("{totalPages}", String(payTotalPages))
                    .replace("{total}", String(payTotal))}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void fetchPayments(payPage - 1)} disabled={payPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 dark:text-gray-200">{u.prevPage}</button>
                  <button type="button" onClick={() => void fetchPayments(payPage + 1)} disabled={payPage >= payTotalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 dark:text-gray-200">{u.nextPage}</button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title={t.payments.noPayments} description={u.noPaymentsDesc} />
          )}
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select aria-label={u.typeFilterLabel} value={txType} onChange={e => { setTxType(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm dark:text-white dark:bg-gray-900">
              <option value="">{t.payments.allTypes}</option>
              <option value="payment">{u.txTypes.payment}</option>
              <option value="refund">{u.txTypes.refund}</option>
              <option value="adjustment">{u.txTypes.adjustment}</option>
            </select>
            <input type="date" aria-label={u.dateFromLabel} value={txFrom} onChange={e => { setTxFrom(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm dark:text-white" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" aria-label={u.dateToLabel} value={txTo} onChange={e => { setTxTo(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm dark:text-white" />
            <Button size="sm" onClick={() => void fetchTransactions(1)} className="ml-2">{u.filterButton}</Button>
            {(txFrom || txTo || txType) && (
              <button type="button" onClick={() => { setTxFrom(""); setTxTo(""); setTxType(""); }} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
                {u.clearFilters}
              </button>
            )}
          </div>

          {txLoading ? (
            <div className="flex justify-center p-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : txError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
              <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{u.transactionsLoadError}</p>
              <Button type="button" variant="outline" onClick={() => void fetchTransactions(txPage)}>{u.retry}</Button>
            </div>
          ) : transactions.length > 0 ? (
            <>
              <DataTable data={transactions} columns={txColumns} />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500">
                  {u.pageSummary
                    .replace("{page}", String(txPage))
                    .replace("{totalPages}", String(txTotalPages))
                    .replace("{total}", String(txTotal))}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void fetchTransactions(txPage - 1)} disabled={txPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 dark:text-gray-200">{u.prevPage}</button>
                  <button type="button" onClick={() => void fetchTransactions(txPage + 1)} disabled={txPage >= txTotalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 dark:text-gray-200">{u.nextPage}</button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title={u.noTransactionsTitle} description={u.noTransactionsDesc} />
          )}
        </div>
      )}
    </>
  );
}
