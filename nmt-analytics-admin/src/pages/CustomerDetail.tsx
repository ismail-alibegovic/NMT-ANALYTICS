import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import { useToast } from "../context/ToastContext";
import { getCustomer, getCustomerTimeline, Customer, TimelineEvent } from "../api/customers";
import { getReservations, Reservation } from "../api/reservations";

const formatCurrency = (amount: number, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(amount);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("bs-BA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

const statusBadge = (status: string) => {
  const colors: Record<string, any> = {
    active: "success", lead: "info", archived: "warning",
    confirmed: "success", pending: "warning", cancelled: "error", completed: "info",
  };
  return <Badge color={colors[status] || "light"}>{status.replace(/_/g, " ").toUpperCase()}</Badge>;
};

type Tab = "info" | "reservations" | "timeline";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("info");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [cust, res, tl] = await Promise.all([
          getCustomer(id),
          getReservations({ customerId: id, limit: 50 }),
          getCustomerTimeline(id),
        ]);
        setCustomer(cust);
        setReservations(res.data);
        setTimeline(tl);
      } catch (err) {
        console.error("Failed to load customer:", err);
        showError("Failed to load customer details");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, showError]);

  const reservationCols: Column<Reservation>[] = [
    { key: "packageName", header: "Aranžman" },
    { key: "departureName", header: "Polazak" },
    { key: "totalAmount", header: "Iznos", render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "paidAmount", header: "Plaćeno", render: (v, r) => formatCurrency(v as number, r.currency) },
    { key: "balanceDue", header: "Saldo", render: (v, r) => (
      <span className={(v as number) > 0 ? "text-error-600 font-semibold" : ""}>{formatCurrency(v as number, r.currency)}</span>
    )},
    { key: "status", header: "Status", render: (v) => statusBadge(v as string) },
    { key: "bookingDate", header: "Datum", render: (v) => formatDate(v as string) },
  ];

  const timelineCols: Column<TimelineEvent>[] = [
    {
      key: "createdAt", header: "Vrijeme", render: (v) => formatDate(v as string),
    },
    {
      key: "type", header: "Tip", render: (v) => (
        <Badge color={v === "audit" ? "info" : "primary"} size="sm">{String(v).toUpperCase()}</Badge>
      ),
    },
    {
      key: "action", header: "Akcija", render: (v) => (
        <span className="capitalize">{String(v).replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "details", header: "Detalji", render: (_, e) => (
        <span className="text-xs text-gray-500 truncate max-w-[200px] inline-block">
          {e.type === "reservation"
            ? `${formatCurrency(e.details?.totalAmount || 0)} - ${e.details?.status || ""}`
            : e.details?.oldValues
              ? "Updated"
              : e.details?.newValues
                ? "Created"
                : "-"}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <>
        <PageMeta title="Customer Detail | Travline" description="Customer details and activity" />
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <EmptyState title="Customer not found" description="The customer you're looking for doesn't exist." action={{ label: "Back to Customers", onClick: () => navigate("/customers") }} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "info", label: "Info" },
    { key: "reservations", label: "Reservations", count: reservations.length },
    { key: "timeline", label: "Activity", count: timeline.length },
  ];

  return (
    <>
      <PageMeta title={`${customer.full_name} | Travline`} description={`Customer details for ${customer.full_name}`} />

      <div className="p-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/customers")} className="flex items-center gap-1">
            &larr; Back
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
                <p className="text-sm text-gray-500">{customer.email || "No email"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">{statusBadge(customer.status || "active")}</div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">Phone</span>
              <span className="font-medium dark:text-gray-200">{customer.phone || "-"}</span>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">Email</span>
              <span className="font-medium dark:text-gray-200">{customer.email || "-"}</span>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block">Created</span>
              <span className="font-medium dark:text-gray-200">{formatDate(customer.created_at)}</span>
            </div>
          </div>

          {customer.notes && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-white/[0.02] rounded-xl">
              <span className="text-xs text-gray-500 block mb-1">Notes</span>
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
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Customer Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-xs text-gray-500 block">Total Reservations</span><span className="font-medium">{reservations.length}</span></div>
              <div><span className="text-xs text-gray-500 block">Total Spent</span><span className="font-medium">{formatCurrency(reservations.reduce((s, r) => s + Number(r.paidAmount || 0), 0))}</span></div>
              <div><span className="text-xs text-gray-500 block">Total Booked</span><span className="font-medium">{formatCurrency(reservations.reduce((s, r) => s + Number(r.totalAmount || 0), 0))}</span></div>
              <div><span className="text-xs text-gray-500 block">Outstanding Balance</span><span className="font-medium text-error-600">{formatCurrency(reservations.reduce((s, r) => s + Number(r.balanceDue || 0), 0))}</span></div>
            </div>
          </div>
        )}

        {activeTab === "reservations" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            {reservations.length > 0 ? (
              <DataTable data={reservations} columns={reservationCols} />
            ) : (
              <EmptyState title="No reservations" description="This customer has no reservations yet." />
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            {timeline.length > 0 ? (
              <DataTable data={timeline} columns={timelineCols} />
            ) : (
              <EmptyState title="No activity" description="No activity recorded for this customer yet." />
            )}
          </div>
        )}
      </div>
    </>
  );
}
