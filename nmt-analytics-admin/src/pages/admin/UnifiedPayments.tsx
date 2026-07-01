import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import { DataTable, Column } from "../../components/ui/DataTable";
import Badge from "../../components/ui/badge/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Button from "../../components/ui/button/Button";
import DonutChart from "../../components/charts/DonutChart";
import { useToast } from "../../context/ToastContext";
import { getPayments, Payment, PaymentFilters } from "../../api/payments";
import { getTransactions, Transaction, TransactionFilters } from "../../api/transactions";
import { getPaymentDashboard, PaymentDashboardResponse, PaymentDashboardPayment, PaymentDashboardMetric } from "../../api/payments";
import { getPaymentStatusDistribution, PaymentStatusResponse } from "../../api/analytics";
import { DollarLineIcon, BoxIconLine, ArrowDownIcon, AlertIcon, DownloadIcon } from "../../icons";

const ITEMS_PER_PAGE = 10;

const formatCurrency = (amount: number, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(amount);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("bs-BA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
};

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

const statusBadge = (status: string) => {
  const colors: Record<string, BadgeColor> = {
    succeeded: "success", pending: "warning", failed: "error", refunded: "info", cancelled: "dark",
    unpaid: "error", partially_paid: "warning", paid: "success",
  };
  return <Badge color={colors[status] || "light"}>{status.replace(/_/g, " ").toUpperCase()}</Badge>;
};

type Tab = "dashboard" | "payments" | "transactions";

const tabs: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "payments", label: "Payments" },
  { key: "transactions", label: "Transactions" },
];

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
  const { error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // ---- Dashboard state ----
  const [dashboard, setDashboard] = useState<PaymentDashboardResponse | null>(null);
  const [statusDist, setStatusDist] = useState<PaymentStatusResponse | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  // ---- Payments state ----
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payLoading, setPayLoading] = useState(false);
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");

  // ---- Transactions state ----
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txType, setTxType] = useState("");

  const payTotalPages = Math.ceil(payTotal / ITEMS_PER_PAGE);
  const txTotalPages = Math.ceil(txTotal / ITEMS_PER_PAGE);

  // ---- Fetch Dashboard ----
  useEffect(() => {
    if (activeTab !== "dashboard") return;
    setDashLoading(true);
    (async () => {
      try {
        const [dash, dist] = await Promise.all([
          getPaymentDashboard(),
          getPaymentStatusDistribution(),
        ]);
        setDashboard(dash);
        setStatusDist(dist);
      } catch (err) {
        console.error("Failed to load payment dashboard:", err);
        showError("Failed to load payment dashboard");
      } finally {
        setDashLoading(false);
      }
    })();
  }, [activeTab, showError]);

  // ---- Fetch Payments ----
  const fetchPayments = useCallback(async (page = 1) => {
    setPayLoading(true);
    try {
      const filters: PaymentFilters = { page, limit: ITEMS_PER_PAGE };
      if (payFrom) filters.from = payFrom;
      if (payTo) filters.to = payTo;
      const res = await getPayments(filters);
      setPayments(res.data);
      setPayTotal(res.pagination.total);
      setPayPage(page);
    } catch (err: any) {
      showError("Failed to load payments");
    } finally {
      setPayLoading(false);
    }
  }, [payFrom, payTo, showError]);

  useEffect(() => {
    if (activeTab === "payments") fetchPayments(1);
  }, [activeTab, fetchPayments]);

  // ---- Fetch Transactions ----
  const fetchTransactions = useCallback(async (page = 1) => {
    setTxLoading(true);
    try {
      const filters: TransactionFilters = { page, limit: ITEMS_PER_PAGE };
      if (txFrom) filters.dateFrom = txFrom;
      if (txTo) filters.dateTo = txTo;
      if (txType) filters.type = txType;
      const res = await getTransactions(filters);
      setTransactions(res.data);
      setTxTotal(res.total);
      setTxPage(page);
    } catch (err: any) {
      showError("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [txFrom, txTo, txType, showError]);

  useEffect(() => {
    if (activeTab === "transactions") fetchTransactions(1);
  }, [activeTab, fetchTransactions]);

  // ---- Chart data ----
  const statusLabels: Record<string, string> = {
    succeeded: "Succeeded", pending: "Pending", failed: "Failed", refunded: "Refunded", cancelled: "Cancelled",
  };
  const statusOrder = ["succeeded", "pending", "failed", "refunded", "cancelled"];
  const chartLabels: string[] = [];
  const chartSeries: number[] = [];
  if (statusDist?.breakdown) {
    for (const s of statusOrder) {
      if (statusDist.breakdown[s]) {
        chartLabels.push(statusLabels[s] || s);
        chartSeries.push(statusDist.breakdown[s].total);
      }
    }
  }
  const statusColors = ["#12B76A", "#F79009", "#F04438", "#667085"];

  // ---- Columns ----
  const overdueColumns: Column<PaymentDashboardMetric>[] = [
    { key: "customerName", header: "Putnik", render: (_, r) => (
      <div>
        <div className="font-medium">{r.customerName}</div>
        {r.customerPhone && <div className="text-xs text-gray-500">{r.customerPhone}</div>}
      </div>
    )},
    { key: "packageName", header: "Aranžman" },
    { key: "departureDate", header: "Polazak", render: (v) => formatDate(v as string) },
    { key: "balanceDue", header: "Dug", render: (v, r) => (
      <span className="font-semibold text-error-600">{formatCurrency(v as number, r.currency)}</span>
    )},
    { key: "paymentStatus", header: "Status", render: (v) => statusBadge(v as string) },
  ];

  const paymentColumns: Column<PaymentDashboardPayment>[] = [
    { key: "customerName", header: "Putnik" },
    { key: "amount", header: "Iznos", render: (v, p) => (
      <span className="font-semibold">{formatCurrency(v as number, p.currency)}</span>
    )},
    { key: "status", header: "Status", render: (v) => statusBadge(v as string) },
    { key: "paymentDate", header: "Datum", render: (v) => formatDate(v as string) },
    { key: "paymentMethod", header: "Način", render: (v) => v ? (v as string).replace(/_/g, " ") : "-" },
    { key: "createdAt", header: "Kreirano", render: (v) => formatDate(v as string) },
  ];

  const paymentListColumns: Column<Payment>[] = [
    { key: "id", header: "ID", render: (v) => <span className="text-xs font-mono">{(v as string).substring(0, 8)}</span> },
    { key: "amount", header: "Iznos", render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "payment_method", header: "Način", render: (v) => v ? (v as string).replace(/_/g, " ") : "-" },
    { key: "status", header: "Status", render: (v) => statusBadge(v as string) },
    { key: "paymentDate", header: "Datum", render: (v) => formatDate(v as string) },
    { key: "reservation", header: "Rezervacija", render: (v) => v ? (v as any).customerName || "-" : "-" },
  ];

  const txColumns: Column<Transaction>[] = [
    { key: "id", header: "ID", render: (v) => <span className="text-xs font-mono">{(v as string).substring(0, 8)}</span> },
    { key: "type", header: "Tip" },
    { key: "amount", header: "Iznos", render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "note", header: "Napomena" },
    { key: "occurred_at", header: "Datum", render: (v) => formatDate(v as string) },
  ];

  // ---- Export ----
  const m = dashboard?.metrics;
  const hasOverdue = dashboard?.overdueReservations && dashboard.overdueReservations.length > 0;
  const hasRecent = dashboard?.recentPayments && dashboard.recentPayments.length > 0;

  const overdueCsvCols = [
    { key: "customerName", label: "Putnik" },
    { key: "packageName", label: "Aranzman" },
    { key: "departureDate", label: "Polazak" },
    { key: "balanceDue", label: "Dug" },
    { key: "paymentStatus", label: "Status" },
  ];
  const paymentCsvCols = [
    { key: "customerName", label: "Putnik" },
    { key: "amount", label: "Iznos" },
    { key: "status", label: "Status" },
    { key: "paymentDate", label: "Datum" },
  ];

  return (
    <>
      <PageMeta title="Payments | Travline" description="Unified payment management" />

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage all payment activity in one place</p>
      </div>

      {/* Metric Cards - Always visible */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6 mb-6">
        <MetricCard title="Paid Today" value={formatCurrency(m?.totalPaidToday ?? 0)} icon={DollarLineIcon} color="bg-success-500" />
        <MetricCard title="Paid This Month" value={formatCurrency(m?.totalPaidThisMonth ?? 0)} icon={BoxIconLine} color="bg-brand-500" />
        <MetricCard title="Overdue" value={formatCurrency(m?.overdueAmount ?? 0)} icon={ArrowDownIcon}
          subtitle={`${m?.overdueCount ?? 0} overdue`} color="bg-error-500" />
        <MetricCard title="Pending" value={formatCurrency(m?.totalPendingAmount ?? 0)} icon={AlertIcon}
          subtitle={`${m?.pendingCount ?? 0} pending`} color="bg-warning-500" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-error-500" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Overdue Reservations</h3>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    if (hasOverdue) exportTableToCsv(dashboard!.overdueReservations, "overdue-reservations.csv", overdueCsvCols);
                  }} disabled={!hasOverdue} className="flex items-center gap-1 text-xs">
                    <DownloadIcon className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (hasRecent) exportTableToCsv(dashboard!.recentPayments, "recent-payments.csv", paymentCsvCols);
                  }} disabled={!hasRecent} className="flex items-center gap-1 text-xs">
                    <DownloadIcon className="w-3.5 h-3.5" /> Payments CSV
                  </Button>
                </div>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : hasOverdue ? (
                <DataTable data={dashboard!.overdueReservations} columns={overdueColumns} />
              ) : (
                <EmptyState title="No overdue reservations" description="All reservations are up to date with payments." />
              )}
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-warning-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pending Payments</h3>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : dashboard?.pendingPayments && dashboard.pendingPayments.length > 0 ? (
                <DataTable data={dashboard.pendingPayments} columns={paymentColumns} />
              ) : (
                <EmptyState title="No pending payments" description="All payments have been processed." />
              )}
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-success-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Payments</h3>
              </div>
              {dashLoading ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : dashboard?.recentPayments && dashboard.recentPayments.length > 0 ? (
                <DataTable data={dashboard.recentPayments} columns={paymentColumns} />
              ) : (
                <EmptyState title="No recent payments" description="No successful payments recorded yet." />
              )}
            </div>
          </div>

          <div>
            <DonutChart
              title="Payment Distribution"
              subtitle="Total amounts by status"
              labels={chartLabels}
              series={chartSeries}
              colors={statusColors}
            />
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input type="date" value={payFrom} onChange={e => { setPayFrom(e.target.value); setPayPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" value={payTo} onChange={e => { setPayTo(e.target.value); setPayPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm" />
            <Button size="sm" onClick={() => fetchPayments(1)} className="ml-2">Filter</Button>
            {(payFrom || payTo) && (
              <button onClick={() => { setPayFrom(""); setPayTo(""); }} className="text-xs text-gray-500 hover:text-gray-700">
                Clear
              </button>
            )}
          </div>

          {payLoading ? (
            <div className="flex justify-center p-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : payments.length > 0 ? (
            <>
              <DataTable data={payments} columns={paymentListColumns} />
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500">Page {payPage} of {payTotalPages} ({payTotal} total)</span>
                <div className="flex gap-2">
                  <button onClick={() => fetchPayments(payPage - 1)} disabled={payPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">← Prev</button>
                  <button onClick={() => fetchPayments(payPage + 1)} disabled={payPage >= payTotalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Next →</button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No payments found" description="No payments match your filters." />
          )}
        </div>
      )}

      {activeTab === "transactions" && (
        <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select value={txType} onChange={e => { setTxType(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm">
              <option value="">All types</option>
              <option value="payment">Payment</option>
              <option value="refund">Refund</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <input type="date" value={txFrom} onChange={e => { setTxFrom(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm" />
            <span className="text-gray-400 text-sm">—</span>
            <input type="date" value={txTo} onChange={e => { setTxTo(e.target.value); setTxPage(1); }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-sm" />
            <Button size="sm" onClick={() => fetchTransactions(1)} className="ml-2">Filter</Button>
            {(txFrom || txTo || txType) && (
              <button onClick={() => { setTxFrom(""); setTxTo(""); setTxType(""); }} className="text-xs text-gray-500 hover:text-gray-700">
                Clear
              </button>
            )}
          </div>

          {txLoading ? (
            <div className="flex justify-center p-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : transactions.length > 0 ? (
            <>
              <DataTable data={transactions} columns={txColumns} />
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500">Page {txPage} of {txTotalPages} ({txTotal} total)</span>
                <div className="flex gap-2">
                  <button onClick={() => fetchTransactions(txPage - 1)} disabled={txPage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">← Prev</button>
                  <button onClick={() => fetchTransactions(txPage + 1)} disabled={txPage >= txTotalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Next →</button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No transactions found" description="No transactions match your filters." />
          )}
        </div>
      )}
    </>
  );
}
