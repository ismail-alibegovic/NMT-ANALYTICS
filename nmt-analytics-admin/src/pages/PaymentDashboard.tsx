import { useState, useEffect } from "react";
import PageMeta from "../components/common/PageMeta";
import { DataTable, Column } from "../components/ui/DataTable";
import Badge from "../components/ui/badge/Badge";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/button/Button";
import DonutChart from "../components/charts/DonutChart";
import { useToast } from "../context/ToastContext";
import { getPaymentDashboard, PaymentDashboardResponse, PaymentDashboardPayment, PaymentDashboardMetric } from "../api/payments";
import { getPaymentStatusDistribution, PaymentStatusResponse } from "../api/analytics";
import { DollarLineIcon, BoxIconLine, ArrowDownIcon, AlertIcon, DownloadIcon } from "../icons";

const formatCurrency = (amount: number, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(amount);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("bs-BA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
};

const statusBadge = (status: string) => {
  const colors: Record<string, BadgeColor> = {
    succeeded: "success", pending: "warning", failed: "error", refunded: "info", cancelled: "dark",
    unpaid: "error", partially_paid: "warning", paid: "success",
  };
  return <Badge color={colors[status] || "light"}>{status.replace(/_/g, " ").toUpperCase()}</Badge>;
};

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

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

const statusColors = ["#12B76A", "#F79009", "#F04438", "#667085"];

export default function PaymentDashboard() {
  const { error: showError } = useToast();
  const [dashboard, setDashboard] = useState<PaymentDashboardResponse | null>(null);
  const [statusDist, setStatusDist] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
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
        setLoading(false);
      }
    })();
  }, [showError]);

  const statusLabels: Record<string, string> = {
    succeeded: "Succeeded", pending: "Pending", failed: "Failed", refunded: "Refunded", cancelled: "Cancelled",
  };

  const statusOrder = ["succeeded", "pending", "failed", "refunded", "cancelled"];
  const labels: string[] = [];
  const series: number[] = [];

  if (statusDist?.breakdown) {
    for (const s of statusOrder) {
      if (statusDist.breakdown[s]) {
        labels.push(statusLabels[s] || s);
        series.push(statusDist.breakdown[s].total);
      }
    }
  }

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
    { key: "createdAt", header: "Kreirano", render: (v) => formatDate(v as string) },
  ];

  if (loading) {
    return (
      <>
        <PageMeta title="Payment Dashboard | NMT Analytics" description="Payment overview" />
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const m = dashboard?.metrics;
  const hasOverdue = dashboard?.overdueReservations && dashboard.overdueReservations.length > 0;
  const hasPending = dashboard?.pendingPayments && dashboard.pendingPayments.length > 0;
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
      <PageMeta title="Payment Dashboard | NMT Analytics" description="Payment overview" />

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white/90 font-outfit">Payment Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of all payment activity</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            if (hasOverdue) exportTableToCsv(dashboard!.overdueReservations, "overdue-reservations.csv", overdueCsvCols);
          }} disabled={!hasOverdue} className="flex items-center gap-2">
            <DownloadIcon className="w-4 h-4" />
            Export Overdue
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            if (hasRecent) exportTableToCsv(dashboard!.recentPayments, "recent-payments.csv", paymentCsvCols);
          }} disabled={!hasRecent} className="flex items-center gap-2">
            <DownloadIcon className="w-4 h-4" />
            Export Payments
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6 mb-8">
        <MetricCard title="Paid Today" value={formatCurrency(m?.totalPaidToday ?? 0)} icon={DollarLineIcon} color="bg-success-500" />
        <MetricCard title="Paid This Month" value={formatCurrency(m?.totalPaidThisMonth ?? 0)} icon={BoxIconLine} color="bg-brand-500" />
        <MetricCard title="Overdue" value={formatCurrency(m?.overdueAmount ?? 0)} icon={ArrowDownIcon}
          subtitle={`${m?.overdueCount ?? 0} reservations overdue`} color="bg-error-500" />
        <MetricCard title="Pending" value={formatCurrency(m?.totalPendingAmount ?? 0)} icon={AlertIcon}
          subtitle={`${m?.pendingCount ?? 0} payments pending`} color="bg-warning-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-error-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Overdue Reservations</h3>
            </div>
            {hasOverdue ? (
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
            {hasPending ? (
              <DataTable data={dashboard!.pendingPayments} columns={paymentColumns} />
            ) : (
              <EmptyState title="No pending payments" description="All payments have been processed." />
            )}
          </div>

          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-success-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Payments</h3>
            </div>
            {hasRecent ? (
              <DataTable data={dashboard!.recentPayments} columns={paymentColumns} />
            ) : (
              <EmptyState title="No recent payments" description="No successful payments recorded yet." />
            )}
          </div>
        </div>

        <div>
          <DonutChart
            title="Payment Distribution"
            subtitle="Total amounts by status"
            labels={labels}
            series={series}
            colors={statusColors}
          />
        </div>
      </div>
    </>
  );
}
