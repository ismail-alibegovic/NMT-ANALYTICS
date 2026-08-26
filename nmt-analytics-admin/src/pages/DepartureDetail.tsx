import { useState, useEffect, useMemo, type ComponentType, type SVGProps } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "../lib/i18n/context";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import SeatMap from "../components/operations/SeatMap";
import RoomingWorkspace from "../components/operations/RoomingWorkspace";
import DrustvaTab from "../components/operations/DrustvaTab";
import CommunicationHistoryPanel from "../components/communications/CommunicationHistoryPanel";
import ManualMessageComposer from "../components/communications/ManualMessageComposer";
import { useToast } from "../context/ToastContext";
import { Modal } from "../components/ui/modal";
import Input from "../components/form/input/InputField";
import Label from "../components/form/Label";
import Select from "../components/form/Select";
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
  getPassengerGroups,
  PassengerGroup,
  updateDeparture,
  Departure,
  DepartureCapabilities,
  DeparturePassenger,
  DepartureManifest,
  DepartureGroup,
  updateDeparturePassenger,
  type PassengerDocumentStatus,
} from "../api/departures";
import { getFlights, type Flight } from "../api/flights";
import { sendDepartureManualMessage } from "../api/manualMessaging";

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

const statusBadge = (status?: string | null) => {
  const normalizedStatus = status ?? "unknown";
  const colors: Record<string, any> = {
    active: "info",
    completed: "success",
    cancelled: "error",
    confirmed: "success",
    pending: "warning",
  };
  return <Badge color={colors[normalizedStatus] || "light"} size="sm">{normalizedStatus.toUpperCase()}</Badge>;
};

type Tab = "overview" | "passengers" | "razvrstavanje" | "drustva" | "hotels";

export default function DepartureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [manifest, setManifest] = useState<DepartureManifest | null>(null);
  const [groups, setGroups] = useState<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] } | null>(null);
  const [passengerGroups, setPassengerGroups] = useState<PassengerGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
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

  useEffect(() => {
    if (!id || activeTab !== "drustva") return;
    getPassengerGroups(id).then(setPassengerGroups).catch(() => {});
  }, [id, activeTab]);
  const [groupBy, setGroupBy] = useState<"hotel" | "agent">("hotel");

  // Document edit modal state
  const [editingPassenger, setEditingPassenger] = useState<DeparturePassenger | null>(null);
  const [docForm, setDocForm] = useState<Record<string, string>>({});
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [flightModalOpen, setFlightModalOpen] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [flightSaving, setFlightSaving] = useState(false);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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
  const summary = manifest?.summary ?? {};

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

  const departureDefaultEmail = useMemo(
    () => normPax.find((p) => p.email)?.email || "",
    [normPax],
  );
  const departureDefaultPhone = useMemo(
    () => normPax.find((p) => p.phone)?.phone || "",
    [normPax],
  );

  // Open document editor for a passenger
  const openDocEditor = (p: DeparturePassenger) => {
    setEditingPassenger(p);
    setDocForm({
      id_document_type: p.id_document_type || "",
      id_document_number: p.id_document_number || "",
      id_document_expiry: p.id_document_expiry || "",
      nationality: p.nationality || "",
      date_of_birth: p.date_of_birth || "",
    });
    setDocError(null);
  };

  // Save passenger document data
  const handleDocSave = async () => {
    if (!editingPassenger?.id) return;
    setDocSaving(true);
    setDocError(null);
    try {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(docForm)) {
        body[k] = v === "" ? null : v;
      }
      await updateDeparturePassenger(editingPassenger.id, body);
      const [freshMani, freshDep] = await Promise.all([
        getDeparturePassengers(id!),
        getDeparture(id!),
      ]);
      setManifest(freshMani);
      setDeparture(freshDep);
      setEditingPassenger(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t.common.error;
      setDocError(msg);
    } finally {
      setDocSaving(false);
    }
  };

  const openFlightSelector = async () => {
    setFlightModalOpen(true);
    setFlightError(null);
    setFlightsLoading(true);
    try {
      const result = await getFlights({ active: "true", limit: 100 });
      setFlights(result.data || []);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t.departure.loadFlightsError;
      setFlightError(msg);
    } finally {
      setFlightsLoading(false);
    }
  };

  const handleLinkFlight = async (flightId: string | null) => {
    if (!id) return;
    setFlightSaving(true);
    setFlightError(null);
    try {
      await updateDeparture(id, { flight_id: flightId });
      const freshDep = await getDeparture(id);
      setDeparture(freshDep);
      setFlightModalOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t.departure.saveFlightError;
      setFlightError(msg);
    } finally {
      setFlightSaving(false);
    }
  };

  const handleUnlinkFlight = () => handleLinkFlight(null);

  const openPackage = () => {
    if (!departure?.package_id) return;
    navigate(`/packages?packageId=${encodeURIComponent(departure.package_id)}`);
  };

  const openHotel = (hotelId: string) => {
    navigate(`/operations/hotels?hotelId=${encodeURIComponent(hotelId)}`);
  };

  const openFlights = () => {
    navigate(
      departure?.linkedFlight?.id
        ? `/operations/flights?flightId=${encodeURIComponent(departure.linkedFlight.id)}`
        : "/operations/flights",
    );
  };

  const totalGuests = summary.totalGuests ?? departure?.booked ?? 0;
  const occupancyPct = departure && departure.capacity > 0
    ? Math.round((totalGuests / departure.capacity) * 100)
    : 0;
  const overCapacity = departure ? Math.max(0, totalGuests - departure.capacity) : 0;
  const confirmedGuests = summary.confirmedGuests ?? 0;
  const totalDebt = summary.totalDebt ?? 0;
  const totalPaid = summary.totalPaid ?? 0;
  const currency = summary.currency || departure?.packages?.currency || "EUR";
  const allocations = summary.allocations || [];
  const relatedHotels = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();

    for (const allocation of (departure?.hotelAllocations || [])) {
      const hotelId = allocation?.hotel_id || allocation?.hotels?.id;
      const hotelName = allocation?.hotels?.name;
      if (hotelId && hotelName && !map.has(hotelId)) {
        map.set(hotelId, { id: hotelId, name: hotelName });
      }
    }

    for (const linked of (departure?.packageHotels || [])) {
      const hotelId = linked?.hotelId || linked?.hotel_id || linked?.hotel?.id || linked?.hotels?.id;
      const hotelName = linked?.hotel?.name || linked?.hotels?.name || linked?.hotel_name;
      if (hotelId && hotelName && !map.has(hotelId)) {
        map.set(hotelId, { id: hotelId, name: hotelName });
      }
    }

    return Array.from(map.values());
  }, [departure?.hotelAllocations, departure?.packageHotels]);
  const capabilities: DepartureCapabilities | undefined = (departure as any)?.capabilities;
  const transportConfigured = capabilities?.hasBusTransport || capabilities?.hasFlight || false;
  const t = useTranslation();
  const readinessItems = departure ? [
    {
      label: t.departure.capacityAndManifest,
      detail: overCapacity > 0
        ? t.departure.capacityOverBy.replace("{over}", String(overCapacity)).replace("{capacity}", String(departure.capacity))
        : t.departure.noPassengers,
      ready: totalGuests > 0 && overCapacity <= 0,
    },
    {
      label: t.departure.reservationConfirmations,
      detail: totalGuests > 0
        ? t.departure.confirmedOfTotal.replace("{confirmed}", String(confirmedGuests)).replace("{total}", String(totalGuests))
        : t.departure.noReservationsToConfirm,
      ready: totalGuests > 0 && confirmedGuests === totalGuests,
    },
    {
      label: t.departure.billing,
      detail: totalDebt > 0
        ? t.departure.remainingDebt.replace("{amount}", formatCurrency(totalDebt, currency))
        : t.departure.noDebt,
      ready: totalGuests > 0 && totalDebt <= 0,
    },
    ...(capabilities?.hasAccommodation && capabilities.accommodationConfigured ? [{
      label: t.departure.accommodation,
      detail: allocations.length > 0
        ? t.departure.activeHotelAllocations.replace("{count}", String(allocations.length))
        : t.departure.noAccommodationConfigured,
      ready: allocations.length > 0,
    }] : []),
    {
      label: t.departure.transport,
      detail: transportConfigured
        ? t.departure.transportCapacity
            .replace("{type}", departure.transport_type === "flight" ? t.departure.airTransport : t.departure.busTransport)
            .replace("{capacity}", String(departure.transport_capacity || departure.capacity))
        : t.departure.noTransportAvailable,
      ready: transportConfigured,
    },
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
    header: t.departure.documents,
    render: (v) => {
      const s = String(v);
      const label = (t.departure.documentStatus as Record<string, string>)[s] || s;
      if (s === "ready") return <span className="text-success-600 dark:text-success-400 text-xs font-medium">{label}</span>;
      if (s === "missing") return <span className="text-warning-600 dark:text-warning-400 text-xs font-medium">{label}</span>;
      if (s === "expired_before_departure" || s === "expired_before_return") return <span className="text-error-600 dark:text-error-400 text-xs font-medium">{label}</span>;
      if (s === "not_required") return <span className="text-gray-400 text-xs">{label}</span>;
      return <span className="text-gray-400">—</span>;
    },
  };

  // Document edit action column for passengers tab
  const docEditCol: Column<DeparturePassenger> | null = capabilities?.needTravelDocuments
    ? {
        key: "docEdit",
        header: "",
        render: (_v: any, item: DeparturePassenger) => (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openDocEditor(item); }}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-white/[0.06] dark:hover:text-brand-400"
            title={t.departure.editDocuments}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
        ),
      }
    : null;

  const allPassengerCols = capabilities?.needTravelDocuments
    ? docEditCol
      ? [...passengerCols, docStatusCol, docEditCol]
      : [...passengerCols, docStatusCol]
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
        <EmptyState title={t.departure.notFound} description={t.departure.notFoundDescription} action={{ label: t.departure.backToDepartures, onClick: () => navigate("/departures") }} />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: t.departure.overview },
    { key: "passengers", label: t.departure.passengers, count: totalGuests },
    { key: "razvrstavanje", label: t.departure.razvrstavanje, count: (groupBy === "hotel" ? groups?.byHotel : groups?.byAgent)?.length },
    { key: "drustva", label: t.departure.drustva },
    ...(capabilities?.hasAccommodation ? [{ key: "hotels" as Tab, label: t.departure.hotels, count: hotelGroups.length }] : []),
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
              {departure.package_id && (
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={openPackage}>
                    {t.departure.openPackage}
                  </Button>
                </div>
              )}
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
              {capabilities?.hasFlight && (
                <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
                  <div className={`rounded-xl border p-4 ${
                    departure.linkedFlight
                      ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]"
                      : "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
                  }`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t.departure.flightContext}</p>
                        {departure.linkedFlight ? (
                          <>
                            <h3 className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">
                              {departure.linkedFlight.airline} {departure.linkedFlight.flight_number}
                            </h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {departure.linkedFlight.departure_airport} → {departure.linkedFlight.arrival_airport}
                            </p>
                            <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                              <span>{t.departure.departureTime}: {formatDateTime(departure.linkedFlight.departure_time)}</span>
                              <span>{t.departure.arrivalTime}: {formatDateTime(departure.linkedFlight.arrival_time)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <h3 className="mt-1 text-sm font-semibold text-warning-700 dark:text-warning-400">{t.departure.flightNotConfigured}</h3>
                            <p className="mt-1 max-w-2xl text-sm text-warning-700/90 dark:text-warning-300">{t.departure.flightNotConfiguredDetail}</p>
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button variant="outline" size="sm" onClick={openFlightSelector} className="justify-center">
                          {departure.linkedFlight ? t.departure.changeFlight : t.departure.linkFlight}
                        </Button>
                        <Button variant="outline" size="sm" onClick={openFlights} className="justify-center">
                          {t.departure.openFlights}
                        </Button>
                        {departure.linkedFlight && (
                          <Button variant="outline" size="sm" onClick={handleUnlinkFlight} disabled={flightSaving} className="justify-center">
                            {t.departure.unlinkFlight}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                <TripFact label="Rezervacije" value={`${summary.totalReservations ?? 0}`} />
                <TripFact label="Prodajni agenti" value={`${groups?.byAgent.length ?? 0}`} />
                <TripFact label="Vodiči" value={`${summary.guides?.length ?? 0}`} />
              </dl>
              {relatedHotels.length > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    {t.departure.relatedHotels}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relatedHotels.map((hotel) => (
                      <Button key={hotel.id} variant="outline" size="sm" onClick={() => openHotel(hotel.id)}>
                        {t.departure.openHotel}: {hotel.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div className="lg:col-span-3">
              <div className="mb-5">
                <ManualMessageComposer
                  initialEmail={departureDefaultEmail}
                  initialPhone={departureDefaultPhone}
                  onSend={(payload) => sendDepartureManualMessage(departure.id, payload)}
                  onSent={() => setHistoryRefreshKey((value) => value + 1)}
                />
              </div>
              <CommunicationHistoryPanel
                relatedDepartureId={departure.id}
                title="Communication history"
                refreshKey={historyRefreshKey}
              />
            </div>
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
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t.departure.documentReadiness}:</span>
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
                      {(t.departure.docFilter as Record<string, string>)[f === "all" ? "all" : f === "ready" ? "ready" : "attention"]}
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
        {activeTab === "drustva" && (
          <DrustvaTab
            departureId={id || ""}
            passengers={normPax}
            groups={passengerGroups}
            onRefresh={async () => {
              if (!id) return;
              try {
                const gs = await getPassengerGroups(id);
                setPassengerGroups(gs);
              } catch {}
            }}
          />
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

      <Modal
        isOpen={!!editingPassenger}
        onClose={() => setEditingPassenger(null)}
        className="max-w-lg"
      >
        <div className="p-6">
          <h2 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white">{t.departure.editDocuments}</h2>
          {editingPassenger && (
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-200">{editingPassenger.fullName}</span>
              {editingPassenger.passport_number && <span className="ml-2">· {editingPassenger.passport_number}</span>}
            </p>
          )}

          {docError && (
            <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
              {docError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-type">{t.departure.documentType}</Label>
              <Select
                options={[
                  { value: "", label: t.departure.noDocument },
                  { value: "passport", label: t.departure.passport },
                  { value: "id_card", label: t.departure.idCard },
                  { value: "none", label: t.departure.none },
                ]}
                defaultValue={docForm.id_document_type || ""}
                onChange={(value: string) => setDocForm((prev) => ({ ...prev, id_document_type: value }))}
              />
            </div>

            <div>
              <Label htmlFor="doc-number">{t.departure.documentNumber}</Label>
              <Input
                type="text"
                id="doc-number"
                value={docForm.id_document_number || ""}
                onChange={(e) => setDocForm((prev) => ({ ...prev, id_document_number: e.target.value }))}
                placeholder={t.departure.documentNumberPlaceholder}
              />
            </div>

            <div>
              <Label htmlFor="doc-expiry">{t.departure.documentExpiry}</Label>
              <Input
                type="date"
                id="doc-expiry"
                value={docForm.id_document_expiry || ""}
                onChange={(e) => setDocForm((prev) => ({ ...prev, id_document_expiry: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="doc-nationality">{t.departure.nationality}</Label>
                <Input
                  type="text"
                  id="doc-nationality"
                  value={docForm.nationality || ""}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, nationality: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="doc-dob">{t.departure.dateOfBirth}</Label>
                <Input
                  type="date"
                  id="doc-dob"
                  value={docForm.date_of_birth || ""}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingPassenger(null)} disabled={docSaving}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleDocSave} disabled={docSaving}>
              {docSaving ? t.common.saving : t.common.save}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={flightModalOpen}
        onClose={() => setFlightModalOpen(false)}
        className="max-w-2xl"
      >
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{t.departure.selectFlight}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.departure.flightNotConfiguredDetail}</p>
            </div>
            {departure?.linkedFlight && (
              <Button variant="outline" size="sm" onClick={handleUnlinkFlight} disabled={flightSaving} className="justify-center">
                {t.departure.unlinkFlight}
              </Button>
            )}
          </div>

          {flightError && (
            <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
              {flightError}
            </div>
          )}

          {flightsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : flights.length > 0 ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {flights.map((flight) => {
                const selected = departure?.linkedFlight?.id === flight.id;
                return (
                  <div
                    key={flight.id}
                    className={`rounded-xl border p-4 ${
                      selected
                        ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                          {flight.airline} {flight.flightNumber}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          {flight.departureAirport} → {flight.arrivalAirport}
                        </p>
                        <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                          <span>{t.departure.departureTime}: {formatDateTime(flight.departureTime)}</span>
                          <span>{t.departure.arrivalTime}: {formatDateTime(flight.arrivalTime)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={selected ? "outline" : "primary"}
                        onClick={() => handleLinkFlight(flight.id)}
                        disabled={flightSaving || selected}
                        className="justify-center"
                      >
                        {selected ? t.departure.flightReady : t.departure.linkFlight}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title={t.departure.noFlights} description={t.departure.flightNotConfiguredDetail} />
          )}

          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={() => setFlightModalOpen(false)} disabled={flightSaving}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      </Modal>
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
