import { useState, useEffect, useMemo, type ComponentType, type SVGProps } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useT } from "../lib/i18n/context";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import SeatMap from "../components/operations/SeatMap";
import RoomingWorkspace from "../components/operations/RoomingWorkspace";
import { useToast } from "../context/ToastContext";
import {
  AlertIcon,
  AngleRightIcon,
  BoxIcon,
  CalenderIcon,
  CheckLineIcon,
  ChevronLeftIcon,
  DollarLineIcon,
  GroupIcon,
  ListIcon,
  PlugInIcon,
} from "../icons";
import {
  getDeparture,
  getDeparturePassengers,
  getDepartureGroups,
  Departure,
  DepartureCapabilities,
  DeparturePassenger,
  DepartureManifest,
  DepartureGroup,
  updateDeparturePassenger,
  type PassengerDocumentStatus,
} from "../api/departures";

const formatCurrency = (amount: number, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(amount || 0);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("bs-BA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("bs-BA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const statusBadge = (status: string) => {
  const colors: Record<string, any> = {
    active: "info",
    completed: "success",
    cancelled: "error",
    confirmed: "success",
    pending: "warning",
  };
  return <Badge color={colors[status] || "light"} size="sm">{status.toUpperCase()}</Badge>;
};

type Tab = "overview" | "passengers" | "razvrstavanje" | "drustva" | "hotels";

export default function DepartureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [manifest, setManifest] = useState<DepartureManifest | null>(null);
  const [groups, setGroups] = useState<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [docFilter, setDocFilter] = useState<"all" | "ready" | "attention">("all");
  const [searchParams] = useSearchParams();
  // Deep-link support: /departures/:id?tab=passengers opens straight to the seat map.
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "passengers" || t === "razvrstavanje" || t === "drustva" || t === "hotels" || t === "overview") {
      setActiveTab(t as Tab);
    }
  }, [searchParams]);
  const [groupBy, setGroupBy] = useState<"hotel" | "agent">("hotel");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [dep, mani, grps] = await Promise.all([
          getDeparture(id),
          getDeparturePassengers(id),
          getDepartureGroups(id).catch(() => ({ byHotel: [], byAgent: [] })),
        ]);
        setDeparture(dep);
        setManifest(mani);
        setGroups(grps);
      } catch (err: any) {
        console.error("Failed to load departure:", err);
        showError(err?.message || "Failed to load departure details");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, showError]);

  const passengers: DeparturePassenger[] = Array.isArray((manifest as any)?.manifest)
    ? (manifest as any).manifest
    : (manifest as any)?.passengers || [];

  // Normalize seat/paid/debt fields to support either shape
  const normPax: DeparturePassenger[] = passengers.map((p: any) => ({
    ...p,
    seatNumber: p.seatNumber ?? p.seat ?? null,
    paidAmount: p.paidAmount ?? p.paid ?? 0,
    debtAmount: p.debtAmount ?? p.debt ?? 0,
    status: p.reservationStatus || p.status || 'pending',
  }));

  // Group passengers by hotel (for hotels tab)
  const hotelGroups = useMemo(() => {
    const m = new Map<string, DeparturePassenger[]>();
    normPax.forEach((p) => {
      const key = p.hotelName || "—bez hotela—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    });
    return Array.from(m.entries()).map(([label, list]) => ({
      label,
      count: list.length,
      passengers: list,
      roomTypes: Array.from(new Set(list.map((p) => p.roomType).filter(Boolean))) as string[],
      checkIn: list.find((p) => p.checkIn)?.checkIn,
      checkOut: list.find((p) => p.checkOut)?.checkOut,
      guides: Array.from(new Set(list.map((p) => p.tourGuide).filter(Boolean))) as string[],
    }));
  }, [normPax]);

  const totalGuests = manifest?.summary.totalGuests ?? departure?.booked ?? 0;
  const occupancyPct = departure && departure.capacity > 0
    ? Math.round((totalGuests / departure.capacity) * 100)
    : 0;
  const overCapacity = departure ? Math.max(0, totalGuests - departure.capacity) : 0;
  const confirmedGuests = manifest?.summary.confirmedGuests ?? 0;
  const totalDebt = manifest?.summary.totalDebt ?? 0;
  const totalPaid = manifest?.summary.totalPaid ?? 0;
  const currency = manifest?.summary.currency || departure?.packages?.currency || "EUR";
  const allocations = manifest?.summary.allocations || [];
  const capabilities: DepartureCapabilities | undefined = (departure as any)?.capabilities;
  const transportConfigured = capabilities?.hasBusTransport || capabilities?.hasFlight || false;
  const t = useT();
  const readinessItems = departure ? [
    {
      label: "Kapacitet i putnička lista",
      detail: overCapacity > 0
        ? `${overCapacity} putnika iznad kapaciteta ${departure.capacity}`
        : totalGuests > 0
          ? `${totalGuests} evidentiranih putnika unutar kapaciteta`
          : "Još nema evidentiranih putnika",
      ready: totalGuests > 0 && overCapacity === 0,
      action: () => setActiveTab("passengers"),
    },
    {
      label: "Potvrde rezervacija",
      detail: totalGuests > 0 ? `${confirmedGuests} od ${totalGuests} putnika potvrđeno` : "Nema rezervacija za potvrdu",
      ready: totalGuests > 0 && confirmedGuests === totalGuests,
      action: () => setActiveTab("passengers"),
    },
    {
      label: "Naplata",
      detail: totalDebt > 0 ? `${formatCurrency(totalDebt, currency)} preostalog duga` : "Nema evidentiranog duga",
      ready: totalGuests > 0 && totalDebt <= 0,
      action: () => navigate("/payments"),
    },
    ...(capabilities?.hasAccommodation ? [{
      label: "Smještaj",
      detail: allocations.length > 0
        ? `${allocations.length} aktivnih hotelskih alokacija`
        : hotelGroups.length > 0
          ? `${hotelGroups.length} hotel${hotelGroups.length === 1 ? "" : "a"} u rezervacijama, bez alokacije`
          : "Smještaj nije dodijeljen",
      ready: allocations.length > 0,
      action: () => setActiveTab("hotels"),
    }] : []),
    ...(transportConfigured ? [{
      label: "Transport",
      detail: transportConfigured
        ? `${departure.transport_type === "flight" ? "Avionski" : "Autobuski"} prevoz · kapacitet ${departure.transport_capacity || departure.capacity}`
        : "Transport nije konfigurisan",
      ready: Boolean(transportConfigured),
      action: () => setActiveTab("passengers"),
    }] : []),
    ...(capabilities?.needTravelDocuments ? [{
      label: t("departure.documents"),
      detail: departure?.documentReadiness?.attentionPassengerCount
        ? `${departure.documentReadiness.attentionPassengerCount} putnika zahtijeva pažnju`
        : "Svi putnici imaju ispravne dokumente",
      ready: !(departure?.documentReadiness?.attentionPassengerCount),
      action: () => { setActiveTab("passengers"); setDocFilter("attention"); },
    }] : []),
  ] : [];
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const readinessPct = readinessItems.length > 0 ? Math.round((readyCount / readinessItems.length) * 100) : 0;

  const passengerCols: Column<DeparturePassenger>[] = [
    { key: "fullName", header: "Putnik", render: (v) => <span className="font-medium dark:text-white">{String(v)}</span> },
    { key: "phone", header: "Telefon", render: (v) => v ? <span className="text-gray-600 dark:text-gray-300">{String(v)}</span> : <span className="text-gray-400">—</span> },
    { key: "hotelName", header: "Hotel", render: (v) => v ? <span className="text-gray-700 dark:text-gray-200">{String(v)}</span> : <span className="text-gray-400">—</span> },
    { key: "roomType", header: "Soba", render: (v) => v ? <Badge color="light" size="sm">{String(v)}</Badge> : <span className="text-gray-400">—</span> },
    { key: "tourGuide", header: "Vodič", render: (v) => v ? <span className="text-gray-600 dark:text-gray-300">{String(v)}</span> : <span className="text-gray-400">—</span> },
    { key: "agent", header: "Agent", render: (v) => v ? <span className="text-brand-600 dark:text-brand-400">{String(v)}</span> : <span className="text-gray-400">—</span> },
    { key: "paidAmount", header: "Plaćeno", render: (v) => <span className="text-success-600 dark:text-success-400 font-medium">{formatCurrency(Number(v), "EUR")}</span> },
    { key: "debtAmount", header: "Dug", render: (v) => Number(v) > 0 ? <span className="text-error-600 font-semibold">{formatCurrency(Number(v), "EUR")}</span> : <span className="text-gray-400">—</span> },
    { key: "status", header: "Status", render: (v) => statusBadge(String(v)) },
  ];


  const docStatusCol: Column<DeparturePassenger> = {
    key: "documentReadinessStatus",
    header: t("departure.documents"),
    render: (v) => {
      const s = String(v);
      const label = t(`departure.documentStatus.${s}`) || s;
      if (s === "ready") return <span className="text-success-600 dark:text-success-400 text-xs font-medium">{label}</span>;
      if (s === "missing") return <span className="text-warning-600 dark:text-warning-400 text-xs font-medium">{label}</span>;
      if (s === "expired_before_departure" || s === "expired_before_return") return <span className="text-error-600 dark:text-error-400 text-xs font-medium">{label}</span>;
      if (s === "not_required") return <span className="text-gray-400 text-xs">{label}</span>;
      return <span className="text-gray-400">—</span>;
    },
  };

  const allPassengerCols = capabilities?.needTravelDocuments
    ? [...passengerCols, docStatusCol]
    : passengerCols;

  const filteredPassengers = useMemo(() => {
    if (!capabilities?.needTravelDocuments || docFilter === "all") return passengers;
    const needsAttention = (p: DeparturePassenger) =>
      !p.documentReadinessStatus || (p.documentReadinessStatus !== "ready" && p.documentReadinessStatus !== "not_required");
    if (docFilter === "ready") return passengers.filter((p) => p.documentReadinessStatus === "ready");
    if (docFilter === "attention") return passengers.filter(needsAttention);
    return passengers;
  }, [passengers, docFilter, capabilities?.needTravelDocuments]);

  if (loading) {
    return (
      <>
        <PageMeta title="Polazak | Travline" description="Detalji polaska" />
        <div className="p-4 sm:p-6">
          <div className="mb-5 h-8 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-52 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04] lg:col-span-2" />
            <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
          </div>
        </div>
      </>
    );
  }

  if (!departure) {
    return (
      <div className="p-6">
        <EmptyState title="Polazak nije pronađen" description="Traženi polazak ne postoji." action={{ label: "Nazad na polaske", onClick: () => navigate("/departures") }} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Pregled" },
    { key: "passengers", label: "Putnici", count: totalGuests },
    { key: "razvrstavanje", label: "Razvrstavanje", count: (groupBy === "hotel" ? groups?.byHotel : groups?.byAgent)?.length },
    { key: "drustva", label: "Društva" },
    ...(capabilities?.hasAccommodation ? [{ key: "hotels" as Tab, label: "Hoteli", count: hotelGroups.length }] : []),
  ];

  const currentGroups = groupBy === "hotel" ? groups?.byHotel || [] : groups?.byAgent || [];

  return (
    <>
      <PageMeta title={`${departure.packageName} | Travline`} description={`Polazak ${formatDate(departure.depart_at)}`} />

      <div className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => navigate("/departures")}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:text-white"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          Svi polasci
        </button>

        <section className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Radni prostor putovanja</span>
                {statusBadge(departure.status)}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-3xl">{departure.packageName}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{departure.destination}</p>
              <div className="mt-5 flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:flex-wrap sm:gap-x-6">
                <span className="inline-flex items-center gap-2">
                  <CalenderIcon className="size-4 text-gray-400" aria-hidden="true" />
                  {formatDateTime(departure.depart_at)} — {formatDateTime(departure.return_at)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <PlugInIcon className="size-4 text-gray-400" aria-hidden="true" />
                  {capabilities?.hasFlight ? "Avionski prevoz" : capabilities?.hasBusTransport ? "Autobuski prevoz" : "Transport nije definisan"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("passengers")} className="justify-center gap-2">
                <GroupIcon className="size-4" aria-hidden="true" /> Putnička lista
              </Button>
              <Button size="sm" onClick={() => navigate(`/reservations?departureId=${departure.id}`)} className="justify-center gap-2">
                <ListIcon className="size-4" aria-hidden="true" /> Rezervacije
              </Button>
            </div>
          </div>

          <div className="grid border-t border-gray-200 dark:border-gray-800 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetric icon={GroupIcon} label="Putnici" value={`${totalGuests}`} detail={`${confirmedGuests} potvrđeno`} />
            <WorkspaceMetric icon={DollarLineIcon} label="Naplaćeno" value={formatCurrency(totalPaid, currency)} detail={totalDebt > 0 ? `${formatCurrency(totalDebt, currency)} duga` : "Bez duga"} attention={totalDebt > 0} />
            {capabilities?.hasAccommodation && <WorkspaceMetric icon={BoxIcon} label="Smještaj" value={`${hotelGroups.length}`} detail={allocations.length > 0 ? `${allocations.length} alokacija` : "Bez alokacije"} attention={allocations.length === 0} />}
            <WorkspaceMetric icon={ListIcon} label="Operativna spremnost" value={`${readinessPct}%`} detail={`${readyCount} od ${readinessItems.length} stavki spremno`} attention={readinessPct < 100} />
          </div>
        </section>

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
                activeTab === tab.key
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2">
              <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-950 dark:text-white">Operativna spremnost</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Stvarno stanje ključnih priprema za ovaj polazak.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${readinessPct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{readinessPct}%</span>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {readinessItems.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    onClick={item.action}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-white/[0.03] sm:px-6"
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${item.ready ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400" : "bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400"}`}>
                      {item.ready ? <CheckLineIcon className="size-4" aria-hidden="true" /> : <AlertIcon className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
                      <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400">{item.detail}</span>
                    </span>
                    <span className={`hidden text-xs font-semibold sm:block ${item.ready ? "text-success-600 dark:text-success-400" : "text-warning-600 dark:text-warning-400"}`}>
                      {item.ready ? "Spremno" : "Potrebna pažnja"}
                    </span>
                    <AngleRightIcon className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>

            <aside className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
              <h2 className="font-semibold text-gray-950 dark:text-white">Sažetak putovanja</h2>
              <dl className="mt-5 space-y-4">
                <TripFact label="Period" value={`${formatDate(departure.depart_at)} — ${formatDate(departure.return_at)}`} />
                <TripFact label="Trajanje" value={`${Math.max(1, Math.ceil((new Date(departure.return_at).getTime() - new Date(departure.depart_at).getTime()) / 86400000))} dana`} />
                <TripFact label="Kapacitet" value={`${totalGuests} / ${departure.capacity} mjesta (${occupancyPct}%)`} attention={overCapacity > 0} />
                <TripFact label="Rezervacije" value={`${manifest?.summary.totalReservations ?? 0}`} />
                <TripFact label="Prodajni agenti" value={`${groups?.byAgent.length ?? 0}`} />
                <TripFact label="Vodiči" value={`${manifest?.summary.guides?.length ?? 0}`} />
              </dl>
            </aside>
          </div>
        )}

        {/* PASSENGERS TAB */}
        {activeTab === "passengers" && (
          <div className="space-y-6">
            {capabilities?.hasManagedSeatLayout && departure.capacity > 0 && passengers.length > 0 && (
              <SeatMap
                passengers={normPax}
                capacity={departure.capacity}
                transportType={departure.transport_type as "bus" | "flight"}
                editable
                onSeatChanged={async () => {
                  try {
                    const fresh = await getDeparturePassengers(id!);
                    setManifest(fresh);
                  } catch {
                    showError("Greška pri ažuriranju putnika");
                  }
                }}
              />
            )}
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              {capabilities?.needTravelDocuments && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("departure.documentReadiness")}:</span>
                  {(["all", "ready", "attention"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDocFilter(f)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        docFilter === f
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                      }`}
                    >
                      {t(`departure.docFilter.${f === "all" ? "all" : f === "ready" ? "ready" : "attention"}`)}
                    </button>
                  ))}
                </div>
              )}
              {passengers.length > 0 ? (
                <DataTable data={filteredPassengers} columns={allPassengerCols} />
              ) : (
                <EmptyState
                  title="Nema putnika"
                  description="Za ovaj polazak još nisu dodijeljeni putnici. Rezervacije vezane za ovaj polazak automatski se pojavljuju ovdje."
                  action={{ label: "Idi na rezervacije", onClick: () => navigate("/reservations") }}
                />
              )}
            </div>
          </div>
        )}

        {/* RAZVRSTAVANJE TAB */}
        {activeTab === "razvrstavanje" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pregled putnika grupisanih po {groupBy === "hotel" ? "hotelu" : "agentu prodaje"}.
              </p>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 p-1">
                <button
                  onClick={() => setGroupBy("hotel")}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${groupBy === "hotel" ? "bg-brand-500 text-white" : "text-gray-500"}`}
                >
                  Po hotelu
                </button>
                <button
                  onClick={() => setGroupBy("agent")}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${groupBy === "agent" ? "bg-brand-500 text-white" : "text-gray-500"}`}
                >
                  Po agentu
                </button>
              </div>
            </div>

            {currentGroups.length > 0 ? (
              <div className="space-y-4">
                {currentGroups.map((g, idx) => (
                  <div key={idx} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">{g.label || (groupBy === "hotel" ? "—bez hotela—" : "—direktna prodaja—")}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {g.count} putnik{g.count !== 1 ? "a" : ""}
                        </p>
                      </div>
                      <Badge color="primary" size="sm">{g.count}</Badge>
                    </div>
                    <div className="p-4">
                      <DataTable data={g.passengers} columns={passengerCols.slice(0, 6)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <EmptyState title="Nema grupa" description={`Nema podataka za grupisanje po ${groupBy === "hotel" ? "hotelu" : "agentu"}.`} />
              </div>
            )}
          </div>
        )}

        {/* DRUSTVA TAB */}
        {activeTab === "drustva" && (manifest as any)?.passengerGroups && (
          <DrustvaTab
            groups={(manifest as any).passengerGroups}
            passengers={normPax}
            groupMembers={(manifest as any).groupMembers || []}
            groupById={(manifest as any).groupById || {}}
          />
        )}
        {activeTab === "drustva" && !(manifest as any)?.passengerGroups && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <EmptyState
              title="Nema društava"
              description="Za ovaj polazak još nisu formirana putnička društva."
            />
          </div>
        )}

        {/* HOTELS TAB — Rooming Workspace */}
        {activeTab === "hotels" && capabilities?.hasAccommodation && (
          <RoomingWorkspace
            departureId={departure.id}
            passengers={normPax}
            departure={{
              hasBusTransport: capabilities.hasBusTransport,
              transportType: capabilities.transportType,
            }}
          />
        )}
        {activeTab === "hotels" && !capabilities?.hasAccommodation && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <EmptyState
              title="Nema smještaja"
              description="Ovaj polazak ne uključuje smještaj."
            />
          </div>
        )}
      </div>
    </>
  );
}

function WorkspaceMetric({ icon: Icon, label, value, detail, attention = false }: { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; value: string; detail: string; attention?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3 border-gray-200 p-4 dark:border-gray-800 sm:[&:nth-child(even)]:border-l xl:border-l xl:first:border-l-0">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
        <div className="mt-1 truncate text-lg font-semibold text-gray-950 dark:text-white">{value}</div>
        <div className={`mt-0.5 truncate text-xs ${attention ? "text-warning-600 dark:text-warning-400" : "text-gray-500 dark:text-gray-400"}`}>{detail}</div>
      </div>
    </div>
  );
}

function TripFact({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 last:border-0 last:pb-0 dark:border-gray-800">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`text-right text-sm font-medium ${attention ? "text-warning-600 dark:text-warning-400" : "text-gray-900 dark:text-white"}`}>{value}</dd>
    </div>
  );
}
