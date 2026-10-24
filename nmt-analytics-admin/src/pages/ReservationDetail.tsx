import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import CommunicationHistoryPanel from "../components/communications/CommunicationHistoryPanel";
import ManualMessageComposer from "../components/communications/ManualMessageComposer";
import { Modal } from "../components/ui/modal";
import { useApp } from "../context/AppContext";
import { hasAccess } from "../types/roles";
import { useToast } from "../context/ToastContext";
import { useT } from '../lib/i18n/context';
import { formatCurrency } from '../utils/business';
import {
  ChevronLeftIcon,
  GroupIcon,
  PlugInIcon,
  FileIcon,
  PencilIcon,
} from "../icons";
import {
  getReservation,
  downloadVoucher,
  downloadInvoice,
  Reservation,
  ReservationPassenger,
  getReservationAccommodation,
  ReservationAccommodationRequirement,
  reservationPaymentStatusBadge,
} from "../api/reservations";
import {
  createContract as apiCreateContract,
  getContracts,
  Contract,
} from "../api/contracts";
import {
  getReservationInstallmentSchedule,
  ReservationInstallmentSchedule,
} from "../api/installments";
import { sendReservationManualMessage } from "../api/manualMessaging";
import EditReservationModal from "../components/reservations/EditReservationModal";
import AddPaymentModal from "../components/payments/AddPaymentModal";

type Tab = "overview" | "passengers" | "payments" | "services" | "documents";

export default function ReservationDetail() {
  const { t: copy, lang } = useT();
  const w = copy.reservationDetail;
  const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
  const locale = lang === 'bs' ? 'bs-BA' : 'en-GB';
  const formatReservationCurrency = (amount: number, currency = 'BAM') => formatCurrency(amount, currency, locale);
  const formatReservationDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    if (!Number.isFinite(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0'), month = String(date.getMonth() + 1).padStart(2, '0');
    return lang === 'bs' ? `${day}.${month}.${date.getFullYear()}.` : `${day}/${month}/${date.getFullYear()}`;
  };
  const statusLabel = (status: string) => ({ confirmed: w.confirmed, pending: w.pending, cancelled: w.cancelled, completed: w.completed, signed: w.signed, draft: w.draft, sent: w.sent, failed: w.failed, refunded: w.refunded } as Record<string, string>)[status] || status;
  const paymentLabel = (res: Reservation) => ({ Paid: w.paid, Partial: w.partial, Unpaid: w.unpaid } as Record<string, string>)[reservationPaymentStatusBadge(res)] || '—';
  const readyCount = (count: number) => {
    const one = lang === 'bs' ? count % 10 === 1 && count % 100 !== 11 : count === 1;
    const few = lang === 'bs' && count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14);
    return fill(one ? w.readyOne : few ? w.readyFew : w.readyMany, { count });
  };
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: w.overview },
    { key: "passengers", label: w.passengers },
    { key: "payments", label: w.payments },
    { key: "services", label: w.services },
    { key: "documents", label: w.documents },
  ];
  const transportLabels: Record<string, string> = {
    bus: w.bus, flight: w.flight, none: w.noTransport,
  };

  const loadErrorCopy = useRef(w.errorLoad);
  useEffect(() => { loadErrorCopy.current = w.errorLoad; }, [w.errorLoad]);
  const { userContext } = useApp();
  const canManagePayments = hasAccess("manager", userContext?.role);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [passengers, setPassengers] = useState<ReservationPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAccommodation, setCurrentAccommodation] = useState<ReservationAccommodationRequirement[]>([]);
  const [installmentSchedule, setInstallmentSchedule] = useState<ReservationInstallmentSchedule | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(null);

  // Contract generation state
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [existingContracts, setExistingContracts] = useState<Contract[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedContract, setGeneratedContract] = useState<Contract | null>(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await getReservation(id);
        const departureId = res.departureId;
        const pax = departureId
          ? await import("../api/departures").then(async (m) => {
              try {
                const manifest = await m.getDeparturePassengers(departureId);
                return (manifest.manifest || []).filter(
                  (p: any) => p.reservationId === id || p.reservation_id === id
                );
              } catch {
                return [];
              }
            })
          : [];

        setReservation(res);
        setPassengers(pax as unknown as ReservationPassenger[]);

        try {
          const acc = await getReservationAccommodation(id);
          setCurrentAccommodation(acc);
        } catch {
          setCurrentAccommodation([]);
        }

        try {
          const schedule = await getReservationInstallmentSchedule(id);
          setInstallmentSchedule(schedule);
        } catch {
          setInstallmentSchedule(null);
        }

        // Check for existing contracts
        try {
          const contractsRes = await getContracts({ reservationId: id, limit: 5 });
          setExistingContracts(contractsRes.data || []);
        } catch {
          // Non-critical — don't block the page
        }
      } catch {
        showError(loadErrorCopy.current);
        navigate(-1);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate, showError]);

  const reloadReservation = async () => {
    if (!id) return;
    const res = await getReservation(id);
    const departureId = res.departureId;
    const pax = departureId
      ? await import("../api/departures").then(async (m) => {
          try {
            const manifest = await m.getDeparturePassengers(departureId);
            return (manifest.manifest || []).filter(
              (p: any) => p.reservationId === id || p.reservation_id === id
            );
          } catch {
            return [];
          }
        })
      : [];
    setReservation(res);
    setPassengers(pax as unknown as ReservationPassenger[]);

    try {
      const acc = await getReservationAccommodation(id);
      setCurrentAccommodation(acc);
    } catch {
      setCurrentAccommodation([]);
    }

    try {
      const schedule = await getReservationInstallmentSchedule(id);
      setInstallmentSchedule(schedule);
    } catch {
      setInstallmentSchedule(null);
    }
  };

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
    } catch { showError(w.errorVoucher); }
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
    } catch { showError(w.errorInvoice); }
  };

  const handleGenerateContract = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const contract = await apiCreateContract({ reservationId: id });
      setGeneratedContract(contract);
      showSuccess(w.contractCreated);
      // Refresh existing contracts list
      try {
        const contractsRes = await getContracts({ reservationId: id, limit: 5 });
        setExistingContracts(contractsRes.data || []);
      } catch {
        // Allow silent failure
      }
    } catch {
      showError(w.errorContract);
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenContract = (contractId: string) => {
    setContractModalOpen(false);
    setGeneratedContract(null);
    navigate(`/operations/contracts?search=${encodeURIComponent(contractId)}`);
  };

  if (loading) return <PageMeta title={w.loading} description="" />;

  if (!reservation) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeftIcon className="size-4" /> {w.back}
        </Button>
        <EmptyState icon={<PlugInIcon className="size-8" />} title={w.notFound} description={w.notFoundHint} />
      </div>
    );
  }

  const paid = Number(reservation.paidAmount ?? 0);
  const total = Number(reservation.totalAmount ?? 0);
  const remaining = Math.max(0, total - paid);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const installments = installmentSchedule?.installments || [];
  const pendingInstallments = installments.filter((row) => row.status === "pending");
  const selectedInstallment =
    installments.find((row) => row.id === selectedInstallmentId) ||
    pendingInstallments[0] ||
    null;
  const reservationShortId = reservation.id ? reservation.id.slice(0, 8) : "—";
  const reservationEmail = (reservation as any).customer?.email || (reservation as any).customers?.email || "";
  const reservationPhone = reservation.customerPhone || (reservation as any).customer?.phone || "";

  const options = (reservation as any)?.options || {};
  // The commercial "What Was Sold" snapshot lives at the TOP LEVEL of
  // reservation.options. The nested server-side `booking_snapshot` is a
  // separate package/services catalogue snapshot and must NOT be used for
  // sold accommodation or sold price values.
  const bookingSnapshot = options.booking_snapshot_version !== undefined ? options : null;
  const purchasedAddons = options.selected_addons || [];

  const readinessLabels: Record<string, { label: string; color: "success" | "warning" | "error" | "info" }> = {
    ready: { label: w.ready, color: "success" },
    missing: { label: w.missing, color: "warning" },
    expired_before_departure: { label: w.expiredDeparture, color: "error" },
    expired_before_return: { label: w.expiredReturn, color: "error" },
    not_required: { label: w.notRequired, color: "info" },
  };

  const readinessCounts = passengers.reduce(
    (acc, p) => {
      const s = ((p as any).documentReadinessStatus as string) || "not_required";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const needsAttentionCount = (readinessCounts.missing || 0) + (readinessCounts.expired_before_departure || 0) + (readinessCounts.expired_before_return || 0);
  const allNotRequired = Object.keys(readinessCounts).every((k) => k === "not_required");

  const paxColumns: Column<ReservationPassenger>[] = [
    {
      key: "fullName",
      header: w.fullName,
      render: (_v, item) => String((item as any).fullName ?? (item as any).full_name ?? "—"),
    },
    {
      key: "idDocument",
      header: w.document,
      render: (_v, item) => {
        const type = ((item as any).id_document_type as string) || "";
        const num = ((item as any).id_document_number as string) || "";
        if (!type && !num) return "—";
        const label = type === "passport" ? w.passport : type === "id_card" ? w.identityCard : type;
        return num ? `${label}: ${num}` : label || "—";
      },
    },
    {
      key: "expiry",
      header: w.expiry,
      render: (_v, item) => formatReservationDate((item as any).id_document_expiry),
    },
    {
      key: "nationality",
      header: w.nationality,
      render: (_v, item) => String((item as any).nationality || "—"),
    },
    {
      key: "dateOfBirth",
      header: w.birthDate,
      render: (_v, item) => formatReservationDate((item as any).date_of_birth),
    },
    {
      key: "readiness",
      header: w.readiness,
      render: (_v, item) => {
        const s = ((item as any).documentReadinessStatus as string) || "not_required";
        const info = readinessLabels[s] || { label: s, color: "info" as const };
        return <Badge color={info.color} size="sm">{info.label}</Badge>;
      },
    },
  ];

  const priceRows = [
    { label: w.basePrice, key: "base_total_at_booking" },
    { label: w.accommodation, key: "accommodation_total_at_booking" },
    { label: w.addons, key: "addons_total_at_booking" },
    { label: w.totalAtBooking, key: "total_at_booking" },
  ].filter((row) => bookingSnapshot?.[row.key] !== undefined);

  return (
    <>
      <PageMeta title={fill(w.reservation, { id: reservationShortId })} description="" />
      <div className="p-4 sm:p-6 space-y-6">
        {reservation.quotationId && <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <Link className="font-medium text-brand-600 dark:text-brand-400" to={`/quotations/${reservation.quotationId}`}>{copy.quotations.sourceQuotation}</Link>
          <p className="mt-1 text-sm text-gray-500">{copy.quotations.bookingTermsLocked}</p>
        </div>}
        {reservation.status !== 'cancelled' && reservation.creationState && reservation.creationState !== 'completed' && (
          <div role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300">
            {reservation.creationState === 'in_progress' ? copy.saleRecovery.processing : copy.saleRecovery.manual}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeftIcon className="size-4" />
            <span className="sr-only">{w.back}</span>
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {fill(w.reservation, { id: reservationShortId })}
          </h1>
          <Badge color={reservation.status === "confirmed" ? "success" : reservation.status === "cancelled" ? "error" : reservation.status === "completed" ? "info" : "warning"} size="sm">
            {statusLabel(reservation.status)}
          </Badge>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditModalOpen(true)}>
              <PencilIcon className="size-4" /> {w.edit}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setContractModalOpen(true)}>
              <FileIcon className="size-4" /> {w.contract}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadVoucher}>{w.voucher}</Button>
            <Button size="sm" variant="outline" disabled={!canManagePayments} onClick={handleDownloadInvoice}>{w.invoice}</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-800 gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
              <dt className="text-sm text-gray-500">{w.client}</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{reservation.customerName}</dd>
              {reservation.customerPhone && <dd className="text-sm text-gray-500">{reservation.customerPhone}</dd>}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">{w.package}</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">
                {reservation.packageId ? (
                  <Link to={`/packages/${reservation.packageId}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                    {reservation.packageName}
                  </Link>
                ) : (
                  reservation.packageName
                )}
              </dd>
              {reservation.departureId ? (
                <dd className="text-sm text-gray-500">
                  <Link to={`/departures/${reservation.departureId}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                    {reservation.departureName}
                  </Link>
                </dd>
              ) : (
                <dd className="text-sm text-gray-500">{reservation.departureName}</dd>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">{w.date}</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatReservationDate(reservation.reservationAt || reservation.bookingDate)}</dd>
              <dd className="text-sm text-gray-500">{fill(w.travelerCount, { count: reservation.partySize || reservation.participants || 0 })}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">{w.total}</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatReservationCurrency(total, reservation.currency)}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">{w.paid}</dt>
              <dd className="text-lg font-semibold text-green-600 dark:text-green-400">{formatReservationCurrency(paid, reservation.currency)}</dd>
              <dd className="text-sm text-gray-500">{fill(w.balanceSummary, { percent: paidPct, amount: formatReservationCurrency(remaining, reservation.currency) })}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-4">
              <dt className="text-sm text-gray-500">{w.paymentStatus}</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{paymentLabel(reservation)}</dd>
            </div>
          </div>
        )}

        {/* Passengers Tab */}
        {activeTab === "passengers" && (
          <div>
            {passengers.length === 0 ? (
              <EmptyState icon={<GroupIcon className="size-8" />} title={w.noPassengers} description={w.noPassengersHint} />
            ) : (
              <>
                {!allNotRequired && (
                  <div className={`mb-4 rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${needsAttentionCount > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"}`}>
                    <div className="text-sm">
                      <span className="font-medium">{w.travelDetails}</span>{" "}
                      {readinessCounts.ready ? readyCount(readinessCounts.ready) : ""}
                      {readinessCounts.ready && needsAttentionCount > 0 ? " · " : ""}
                      {needsAttentionCount > 0 ? fill(needsAttentionCount === 1 ? w.attentionOne : w.attentionMany, { count: needsAttentionCount }) : ""}
                    </div>
                    {needsAttentionCount > 0 && reservation.departureId && (
                      <Link to={`/departures/${reservation.departureId}`} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        {w.openDeparture}
                      </Link>
                    )}
                  </div>
                )}
                <DataTable columns={paxColumns} data={passengers} />
              </>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">{w.finances}</h3>
                  <p className="mt-1 text-sm text-gray-500">{w.financesHint}</p>
                </div>
                <Button
                  size="sm"
                  disabled={!canManagePayments || Boolean(reservation.creationState && reservation.creationState !== 'completed')}
                  onClick={() => {
                    setSelectedInstallmentId(pendingInstallments[0]?.id || null);
                    setAddPaymentOpen(true);
                  }}
                >
                  {w.recordPayment}
                </Button>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <dt className="text-xs text-gray-500">{w.total}</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{formatReservationCurrency(total, reservation.currency)}</dd>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <dt className="text-xs text-gray-500">{w.paid}</dt>
                  <dd className="mt-1 text-base font-semibold text-green-600 dark:text-green-400">{formatReservationCurrency(paid, reservation.currency)}</dd>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <dt className="text-xs text-gray-500">{w.remaining}</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{formatReservationCurrency(remaining, reservation.currency)}</dd>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <dt className="text-xs text-gray-500">{w.status}</dt>
                  <dd className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{paymentLabel(reservation)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">{w.schedule}</h3>
              {installments.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">{w.noSchedule}</p>
              ) : (
                <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
                  {installments.map((installment) => {
                    const isPaid = installment.status === "succeeded";
                    const isPending = installment.status === "pending";
                    return (
                      <div key={installment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {fill(w.installment, { number: installment.installmentNumber, amount: formatReservationCurrency(installment.amount, installment.currency) })}
                          </p>
                          <p className="text-xs text-gray-500">
                            {w.due} {formatReservationDate(installment.dueDate)}
                            {installment.paymentDate ? fill(w.received, { date: formatReservationDate(installment.paymentDate) }) : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge color={isPaid ? "success" : isPending ? "warning" : "error"} size="sm">
                            {isPaid ? w.paid : isPending ? w.pending : statusLabel(installment.status)}
                          </Badge>
                          {isPending && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canManagePayments || Boolean(reservation.creationState && reservation.creationState !== 'completed')}
                              onClick={() => {
                                setSelectedInstallmentId(installment.id);
                                setAddPaymentOpen(true);
                              }}
                            >
                              {w.record}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Services Tab */}
        {activeTab === "services" && (
          <div className="space-y-6">
            {/* Sold booking data */}
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{w.soldServices}</h3>

              {!bookingSnapshot && purchasedAddons.length === 0 && currentAccommodation.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">
                  {w.noServices}
                </p>
              ) : (
                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {bookingSnapshot?.variant_name && (
                    <>
                      <dt className="text-gray-500">{w.variant}</dt>
                      <dd className="text-gray-900 dark:text-white">{bookingSnapshot.variant_name}</dd>
                    </>
                  )}

                  {bookingSnapshot?.transport_type && (
                    <>
                      <dt className="text-gray-500">{w.transport}</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {transportLabels[bookingSnapshot.transport_type] || bookingSnapshot.transport_type}
                      </dd>
                    </>
                  )}

                  {currentAccommodation.length > 0 && (
                    <div className="sm:col-span-2 mt-2">
                      <dt className="text-gray-500 mb-2">{w.accommodation}</dt>
                      {currentAccommodation.map((line, i) => (
                        <dd key={i} className="text-gray-900 dark:text-white mb-1">
                          {line.hotel?.name || line.hotelId || "—"}
                          {line.roomLabel ? ` — ${line.roomLabel}` : ""}
                          <span className="text-gray-500">
                            {" "}· {fill(w.accommodationCounts, { rooms: line.roomCount, travelers: line.guestsExpected })}
                          </span>
                        </dd>
                      ))}
                    </div>
                  )}

                  {purchasedAddons.length > 0 && (
                    <div className="sm:col-span-2 mt-2">
                      <dt className="text-gray-500 mb-2">{w.addons}</dt>
                      {purchasedAddons.map((addon: any, i: number) => (
                        <dd key={i} className="text-gray-900 dark:text-white mb-1">
                          {addon.provider_name || addon.service_type || "—"}
                          {addon.description ? <span className="text-gray-500"> — {addon.description}</span> : ""}
                          <span className="text-gray-500">
                            {" "}· {addon.quantity ?? 1} × {formatReservationCurrency(Number(addon.unit_price ?? 0), addon.currency || reservation.currency)}
                          </span>
                        </dd>
                      ))}
                    </div>
                  )}

                  {reservation.notes && (
                    <>
                      <dt className="text-gray-500">{w.notes}</dt>
                      <dd className="text-gray-900 dark:text-white">{reservation.notes}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>

            {/* Price breakdown */}
            {priceRows.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{w.bookingPrice}</h3>
                <dl className="mt-4 space-y-2 text-sm">
                  {priceRows.map((row) => (
                    <div key={row.key} className="flex justify-between">
                      <dt className="text-gray-500">{row.label}</dt>
                      <dd className={`font-medium text-gray-900 dark:text-white ${row.key === "total_at_booking" ? "text-base" : ""}`}>
                        {formatReservationCurrency(Number(bookingSnapshot[row.key] ?? 0), reservation.currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button size="sm" variant="outline" onClick={handleDownloadVoucher}>{w.downloadVoucher}</Button>
              <Button size="sm" variant="outline" disabled={!canManagePayments} onClick={handleDownloadInvoice}>{w.downloadInvoice}</Button>
            </div>
            <ManualMessageComposer
              initialEmail={reservationEmail}
              initialPhone={reservationPhone}
              onSend={(payload) => sendReservationManualMessage(reservation.id, payload)}
              onSent={() => setHistoryRefreshKey((value) => value + 1)}
            />
            <CommunicationHistoryPanel
              relatedReservationId={reservation.id}
              refreshKey={historyRefreshKey}
            />
          </div>
        )}
      </div>

      {/* Edit Reservation Modal */}
      <EditReservationModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={async () => {
          setEditModalOpen(false);
          try {
            await reloadReservation();
          } catch {
            showError(w.errorReload);
          }
        }}
        reservationId={id || null}
      />

      <AddPaymentModal
        isOpen={canManagePayments && addPaymentOpen}
        onClose={() => setAddPaymentOpen(false)}
        reservationId={reservation.id}
        reservationCurrency={reservation.currency}
        installmentId={selectedInstallment?.id || null}
        defaultAmount={selectedInstallment?.amount || null}
        onPaymentCreated={async () => {
          try {
            await reloadReservation();
          } catch {
            showError(w.errorReload);
          }
        }}
      />

      {/* Contract Generation Modal */}
      <Modal isOpen={contractModalOpen} onClose={() => { setContractModalOpen(false); setGeneratedContract(null); }} className="max-w-md">
        <div className="space-y-4 p-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{w.generateContract}</h3>

          {existingContracts.length > 0 && !generatedContract && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{w.existingContracts}</p>
              <ul className="mt-2 space-y-1">
                {existingContracts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {c.contractNumber} — <Badge color={c.status === "signed" ? "success" : c.status === "cancelled" ? "error" : "warning"} variant="light" size="sm">{statusLabel(c.status)}</Badge>
                    </span>
                    <button
                      onClick={() => handleOpenContract(c.id)}
                      className="text-brand-600 dark:text-brand-400 text-sm font-medium hover:underline"
                    >
                      {w.open}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {generatedContract ? (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20 p-4 text-center space-y-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">{w.contractSuccess}</p>
              <p className="text-sm text-green-700 dark:text-green-300">{generatedContract.contractNumber}</p>
              <div className="flex justify-center gap-2">
                <Button variant="primary" onClick={() => handleOpenContract(generatedContract.id)}>
                  {w.openContract}
                </Button>
                <Button variant="outline" onClick={() => { setContractModalOpen(false); setGeneratedContract(null); }}>
                  {w.close}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {w.contractHint}
              </p>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-1 text-sm">
                <p><span className="text-gray-500">{w.travelerLabel}</span> <span className="text-gray-900 dark:text-white">{reservation.customerName}</span></p>
                <p><span className="text-gray-500">{w.packageLabel}</span> <span className="text-gray-900 dark:text-white">{reservation.packageName}</span></p>
                <p><span className="text-gray-500">{w.amountLabel}</span> <span className="text-gray-900 dark:text-white">{formatReservationCurrency(Number(reservation.totalAmount), reservation.currency)}</span></p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setContractModalOpen(false)}>{w.cancel}</Button>
                <Button variant="primary" onClick={handleGenerateContract} disabled={generating}>
                  {generating ? w.generating : w.generate}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
