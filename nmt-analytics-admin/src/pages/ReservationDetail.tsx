import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import CommunicationHistoryPanel from "../components/communications/CommunicationHistoryPanel";
import ManualMessageComposer from "../components/communications/ManualMessageComposer";
import { Modal } from "../components/ui/modal";
import { useToast } from "../context/ToastContext";
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
  formatReservationCurrency,
  formatReservationDate,
  reservationPaymentStatusBadge,
} from "../api/reservations";
import {
  createContract as apiCreateContract,
  getContracts,
  Contract,
} from "../api/contracts";
import { sendReservationManualMessage } from "../api/manualMessaging";
import EditReservationModal from "../components/reservations/EditReservationModal";

type Tab = "overview" | "passengers" | "payments" | "services" | "documents";

const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Pregled" },
  { key: "passengers", label: "Putnici" },
  { key: "payments", label: "Uplate" },
  { key: "services", label: "Usluge" },
  { key: "documents", label: "Dokumenti" },
];

const transportLabels: Record<string, string> = {
  bus: "Autobus",
  flight: "Avion",
  none: "Bez prijevoza",
};

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [passengers, setPassengers] = useState<ReservationPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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

        // Check for existing contracts
        try {
          const contractsRes = await getContracts({ reservationId: id, limit: 5 });
          setExistingContracts(contractsRes.data || []);
        } catch {
          // Non-critical — don't block the page
        }
      } catch (err: any) {
        showError(err?.message || "Failed to load reservation");
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

  const handleGenerateContract = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const contract = await apiCreateContract({ reservationId: id });
      setGeneratedContract(contract);
      showSuccess("Contract generated");
      // Refresh existing contracts list
      try {
        const contractsRes = await getContracts({ reservationId: id, limit: 5 });
        setExistingContracts(contractsRes.data || []);
      } catch {
        // Allow silent failure
      }
    } catch (err: any) {
      showError(err?.message || "Failed to generate contract");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenContract = (contractId: string) => {
    setContractModalOpen(false);
    setGeneratedContract(null);
    navigate(`/operations/contracts?search=${encodeURIComponent(contractId)}`);
  };

  if (loading) return <PageMeta title="Učitavanje..." description="" />;

  if (!reservation) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeftIcon className="size-4" /> Nazad
        </Button>
        <EmptyState icon={<PlugInIcon className="size-8" />} title="Rezervacija nije pronađena" description="Tražena rezervacija ne postoji ili nemate pristup." />
      </div>
    );
  }

  const paid = Number(reservation.paidAmount ?? 0);
  const total = Number(reservation.totalAmount ?? 0);
  const remaining = Math.max(0, total - paid);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
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
  const accommodationLines = options.accommodation || [];

  const readinessLabels: Record<string, { label: string; color: "success" | "warning" | "error" | "info" }> = {
    ready: { label: "Spremno", color: "success" },
    missing: { label: "Dopuniti podatke", color: "warning" },
    expired_before_departure: { label: "Ističe prije polaska", color: "error" },
    expired_before_return: { label: "Ističe prije povratka", color: "error" },
    not_required: { label: "Nije potrebno", color: "info" },
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
      header: "Ime i prezime",
      render: (_v, item) => String((item as any).fullName ?? (item as any).full_name ?? "—"),
    },
    {
      key: "idDocument",
      header: "Dokument",
      render: (_v, item) => {
        const type = ((item as any).id_document_type as string) || "";
        const num = ((item as any).id_document_number as string) || "";
        if (!type && !num) return "—";
        const label = type === "passport" ? "Pasoš" : type === "id_card" ? "LK" : type;
        return num ? `${label}: ${num}` : label || "—";
      },
    },
    {
      key: "expiry",
      header: "Ističe",
      render: (_v, item) => String((item as any).id_document_expiry || "—"),
    },
    {
      key: "nationality",
      header: "Državljanstvo",
      render: (_v, item) => String((item as any).nationality || "—"),
    },
    {
      key: "dateOfBirth",
      header: "Datum rođenja",
      render: (_v, item) => String((item as any).date_of_birth || "—"),
    },
    {
      key: "readiness",
      header: "Spremnost",
      render: (_v, item) => {
        const s = ((item as any).documentReadinessStatus as string) || "not_required";
        const info = readinessLabels[s] || { label: s, color: "info" as const };
        return <Badge color={info.color} size="sm">{info.label}</Badge>;
      },
    },
  ];

  const priceRows = [
    { label: "Osnovna cijena", key: "base_total_at_booking" },
    { label: "Smještaj", key: "accommodation_total_at_booking" },
    { label: "Dodatne usluge", key: "addons_total_at_booking" },
    { label: "Ukupno pri booking-u", key: "total_at_booking" },
  ].filter((row) => bookingSnapshot?.[row.key] !== undefined);

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
            <Button size="sm" variant="outline" onClick={() => setEditModalOpen(true)}>
              <PencilIcon className="size-4" /> Uredi rezervaciju
            </Button>
            <Button size="sm" variant="outline" onClick={() => setContractModalOpen(true)}>
              <FileIcon className="size-4" /> Ugovor
            </Button>
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
              <EmptyState icon={<GroupIcon className="size-8" />} title="Nema putnika" description="Ova rezervacija nema zasebne putničke zapise." />
            ) : (
              <>
                {!allNotRequired && (
                  <div className={`mb-4 rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${needsAttentionCount > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"}`}>
                    <div className="text-sm">
                      <span className="font-medium">Putni podaci:</span>{" "}
                      {readinessCounts.ready ? `${readinessCounts.ready} ${readinessCounts.ready === 1 ? "spreman" : "spremna"}` : ""}
                      {readinessCounts.ready && needsAttentionCount > 0 ? " · " : ""}
                      {needsAttentionCount > 0 ? `${needsAttentionCount} ${needsAttentionCount === 1 ? "zahtijeva pažnju" : "zahtijevaju pažnju"}` : ""}
                    </div>
                    {needsAttentionCount > 0 && reservation.departureId && (
                      <Link to={`/departures/${reservation.departureId}`} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        Otvori polazak
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
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
            <p className="text-sm text-gray-500">
              Plaćanje se vodi kroz modul Uplate. Otvorite uplate za ovu rezervaciju da vidite detalje.
            </p>
          </div>
        )}

        {/* Services Tab */}
        {activeTab === "services" && (
          <div className="space-y-6">
            {/* Sold booking data */}
            <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Prodane usluge</h3>

              {!bookingSnapshot && purchasedAddons.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">
                  Nema snimljenih usluga za ovu rezervaciju.
                </p>
              ) : (
                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {bookingSnapshot?.variant_name && (
                    <>
                      <dt className="text-gray-500">Varijanta</dt>
                      <dd className="text-gray-900 dark:text-white">{bookingSnapshot.variant_name}</dd>
                    </>
                  )}

                  {bookingSnapshot?.transport_type && (
                    <>
                      <dt className="text-gray-500">Prijevoz</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {transportLabels[bookingSnapshot.transport_type] || bookingSnapshot.transport_type}
                      </dd>
                    </>
                  )}

                  {accommodationLines.length > 0 && (
                    <div className="sm:col-span-2 mt-2">
                      <dt className="text-gray-500 mb-2">Smještaj</dt>
                      {accommodationLines.map((line: any, i: number) => (
                        <dd key={i} className="text-gray-900 dark:text-white mb-1">
                          {line.hotel_name || line.hotel || "—"}
                          {line.room_type || line.roomType ? ` — ${line.room_type || line.room_label || line.roomType || line.roomLabel}` : ""}
                          <span className="text-gray-500">
                            {" "}· {line.room_count ?? line.roomCount ?? 0} soba · {line.guests_expected ?? line.guestsExpected ?? 0} putnika
                          </span>
                        </dd>
                      ))}
                    </div>
                  )}

                  {purchasedAddons.length > 0 && (
                    <div className="sm:col-span-2 mt-2">
                      <dt className="text-gray-500 mb-2">Dodatne usluge</dt>
                      {purchasedAddons.map((addon: any, i: number) => (
                        <dd key={i} className="text-gray-900 dark:text-white mb-1">
                          {addon.provider_name || addon.service_type || "—"}
                          {addon.description ? <span className="text-gray-500"> — {addon.description}</span> : ""}
                          <span className="text-gray-500">
                            {" "}· {addon.quantity ?? 1} × {addon.unit_price ?? 0} {addon.currency || reservation.currency}
                          </span>
                        </dd>
                      ))}
                    </div>
                  )}

                  {reservation.notes && (
                    <>
                      <dt className="text-gray-500">Napomene</dt>
                      <dd className="text-gray-900 dark:text-white">{reservation.notes}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>

            {/* Price breakdown */}
            {priceRows.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Cijena pri booking-u</h3>
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
              <Button size="sm" variant="outline" onClick={handleDownloadVoucher}>Preuzmi vaučer</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadInvoice}>Preuzmi fakturu</Button>
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
          } catch (err: any) {
            showError(err?.message || "Failed to reload reservation");
          }
        }}
        reservationId={id || null}
      />

      {/* Contract Generation Modal */}
      <Modal isOpen={contractModalOpen} onClose={() => { setContractModalOpen(false); setGeneratedContract(null); }} className="max-w-md">
        <div className="space-y-4 p-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generiši ugovor</h3>

          {existingContracts.length > 0 && !generatedContract && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Ova rezervacija već ima ugovore</p>
              <ul className="mt-2 space-y-1">
                {existingContracts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {c.contractNumber} — <Badge color={c.status === "signed" ? "success" : c.status === "cancelled" ? "error" : "warning"} variant="light" size="sm">{c.status}</Badge>
                    </span>
                    <button
                      onClick={() => handleOpenContract(c.id)}
                      className="text-brand-600 dark:text-brand-400 text-sm font-medium hover:underline"
                    >
                      Otvori
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {generatedContract ? (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20 p-4 text-center space-y-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Ugovor uspješno generisan</p>
              <p className="text-sm text-green-700 dark:text-green-300">{generatedContract.contractNumber}</p>
              <div className="flex justify-center gap-2">
                <Button variant="primary" onClick={() => handleOpenContract(generatedContract.id)}>
                  Otvori ugovor
                </Button>
                <Button variant="outline" onClick={() => { setContractModalOpen(false); setGeneratedContract(null); }}>
                  Zatvori
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Generišite ugovor iz ove rezervacije sa podacima putnika, aranžmana i cijenom.
              </p>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-1 text-sm">
                <p><span className="text-gray-500">Putnik:</span> <span className="text-gray-900 dark:text-white">{reservation.customerName}</span></p>
                <p><span className="text-gray-500">Aranžman:</span> <span className="text-gray-900 dark:text-white">{reservation.packageName}</span></p>
                <p><span className="text-gray-500">Iznos:</span> <span className="text-gray-900 dark:text-white">{formatReservationCurrency(Number(reservation.totalAmount), reservation.currency)}</span></p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setContractModalOpen(false)}>Otkaži</Button>
                <Button variant="primary" onClick={handleGenerateContract} disabled={generating}>
                  {generating ? "Generisanje..." : "Generiši"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
