import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import CommunicationHistoryPanel from "../components/communications/CommunicationHistoryPanel";
import { useToast } from "../context/ToastContext";
import {
  ChevronLeftIcon,
  DollarLineIcon,
  GroupIcon,
  PlugInIcon,
} from "../icons";
import {
  getReservation,
  deleteReservation,
  downloadVoucher,
  downloadInvoice,
  Reservation,
  ReservationPassenger,
  ReservationInstallment,
  formatReservationCurrency,
  formatReservationDate,
  reservationPaymentStatusBadge,
} from "../api/reservations";

type Tab = "overview" | "passengers" | "payments" | "services" | "documents";

const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Pregled" },
  { key: "passengers", label: "Putnici" },
  { key: "payments", label: "Uplate" },
  { key: "services", label: "Usluge" },
  { key: "documents", label: "Dokumenti" },
];

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [passengers, setPassengers] = useState<ReservationPassenger[]>([]);
  const [installments, setInstallments] = useState<ReservationInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [res, pax, inst] = await Promise.all([
          getReservation(id),
          import("../api/departures").then(async (m) => {
            try {
              const dp = await m.getDeparturePassengers((res as any).departureId || "");
              return dp.filter((p: any) => p.reservation_id === id);
            } catch { return []; }
          }),
          import("../api/departures").then(async (m) => {
            try {
              const grp = await m.getDepartureGroups((res as any).departureId || "");
              return grp?.byAgent || [];
            } catch { return []; }
          }),
        ]);
        setReservation(res);
        setPassengers(pax);
      } catch (err: any) {
        showError(err?.message || "Failed to load reservation");
        navigate(-1);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleDownloadVoucher = async () => {
    if (!id) return;
    try {
      const blob = await downloadVoucher(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voucher-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showError("Failed to download voucher"); }
  };

  const handleDownloadInvoice = async () => {
    if (!id) return;
    try {
      const blob = await downloadInvoice(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showError("Failed to download invoice"); }
  };

  if (loading) return <PageMeta title="Učitavanje..." description="" />;

  if (!reservation) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeftIcon className="size-4" /> Nazad
        </Button>
        <EmptyState icon={PlugInIcon} title="Rezervacija nije pronađena" description="Tražena rezervacija ne postoji ili nemate pristup." />
      </div>
    );
  }

  const paid = Number(reservation.paidAmount ?? 0);
  const total = Number(reservation.totalAmount ?? 0);
  const remaining = Math.max(0, total - paid);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const reservationShortId = reservation.id ? reservation.id.slice(0, 8) : "—";

  const paxColumns: Column<ReservationPassenger>[] = [
    { key: "full_name", header: "Ime i prezime", render: (v) => String(v ?? "—") },
    { key: "id_document", header: "Dokument", render: (v) => String(v ?? "—") },
    { key: "nationality", header: "Nacionalnost", render: (v) => String(v ?? "—") },
  ];

  return (
    <>
      <PageMeta title={`Rezervacija ${reservationShortId}`} description="" />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Rezervacija {reservationShortId}
          </h1>
          <Badge color={reservation.status === "confirmed" ? "success" : reservation.status === "cancelled" ? "error" : reservation.status === "completed" ? "info" : "warning"} size="sm">
            {reservation.status.toUpperCase()}
          </Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDownloadVoucher}>Vaucer</Button>
            <Button size="sm" variant="outline" onClick={handleDownloadInvoice}>Faktura</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Klijent</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{reservation.customerName}</dd>
              {reservation.customerPhone && <dd className="text-sm text-gray-500">{reservation.customerPhone}</dd>}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Paket</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{reservation.packageName}</dd>
              <dd className="text-sm text-gray-500">{reservation.departureName}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Datum</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatReservationDate(reservation.reservationAt || reservation.bookingDate)}</dd>
              <dd className="text-sm text-gray-500">{reservation.partySize || reservation.participants} putnika</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Ukupno</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatReservationCurrency(total, reservation.currency)}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Plaćeno</dt>
              <dd className="text-lg font-semibold text-green-600 dark:text-green-400">{formatReservationCurrency(paid, reservation.currency)}</dd>
              <dd className="text-sm text-gray-500">{paidPct}% — {formatReservationCurrency(remaining, reservation.currency)} preostalo</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">Status uplate</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{reservationPaymentStatusBadge(reservation)}</dd>
            </div>
          </div>
        )}

        {/* Passengers Tab */}
        {activeTab === "passengers" && (
          <div>
            {passengers.length === 0 ? (
              <EmptyState icon={GroupIcon} title="Nema putnika" description="Ova rezervacija nema zasebne putničke zapise." />
            ) : (
              <DataTable columns={paxColumns} rows={passengers} rowKey="id" />
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
            <p className="text-sm text-gray-500">
              Plaćanje se vodi kroz modul Uplate. Otvorite uplate za ovu rezervaciju da vidite detalje.
            </p>
          </div>
        )}

        {/* Services Tab */}
        {activeTab === "services" && (
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
            <p className="text-sm text-gray-500">
              {(reservation as any)?.options?.booking_snapshot
                ? `Booking snapshot v${(reservation as any).options.booking_snapshot.booking_snapshot_version || 1}`
                : "Nema snimljenih usluga za ovu rezervaciju."}
            </p>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button size="sm" variant="outline" onClick={handleDownloadVoucher}>Preuzmi vaučer</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadInvoice}>Preuzmi fakturu</Button>
            </div>
            <CommunicationHistoryPanel
              relatedReservationId={reservation.id}
              title="Communication history"
            />
          </div>
        )}
      </div>
    </>
  );
}
