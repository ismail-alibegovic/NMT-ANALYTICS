import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import EmptyState from "../components/ui/EmptyState";
import { DataTable, Column } from "../components/ui/DataTable";
import { useToast } from "../context/ToastContext";
import {
  getDeparture,
  getDeparturePassengers,
  getDepartureGroups,
  Departure,
  DeparturePassenger,
  DepartureManifest,
  DepartureGroup,
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

type Tab = "overview" | "passengers" | "groups" | "hotels";

export default function DepartureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [manifest, setManifest] = useState<DepartureManifest | null>(null);
  const [groups, setGroups] = useState<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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

  const occupancyPct = departure && departure.capacity > 0
    ? Math.round((departure.booked / departure.capacity) * 100)
    : 0;

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

  if (loading) {
    return (
      <>
        <PageMeta title="Polazak | Travline" description="Detalji polaska" />
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
    { key: "passengers", label: "Putnici", count: passengers.length },
    { key: "groups", label: "Grupe", count: (groupBy === "hotel" ? groups?.byHotel : groups?.byAgent)?.length },
    { key: "hotels", label: "Hoteli", count: hotelGroups.length },
  ];

  const currentGroups = groupBy === "hotel" ? groups?.byHotel || [] : groups?.byAgent || [];

  return (
    <>
      <PageMeta title={`${departure.packageName} | Travline`} description={`Polazak ${formatDate(departure.depart_at)}`} />

      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/departures")} className="flex items-center gap-1">
            ← Nazad
          </Button>
        </div>

        {/* Hero card with departure info */}
        <div className="relative overflow-hidden rounded-2xl mb-6 bg-gradient-to-br from-[#0F0F1A] via-[#15162B] to-[#1A1B3A] border border-white/10 p-8">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, #6366F1 0%, transparent 50%)" }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">Polazak</span>
                {statusBadge(departure.status)}
              </div>
              <h1 className="text-3xl font-bold text-white mb-1">{departure.packageName}</h1>
              <p className="text-indigo-200/70 text-sm">{departure.destination}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-300">
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">📅 Polazak:</span>
                  <span className="font-medium text-white">{formatDateTime(departure.depart_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">↩ Povratak:</span>
                  <span className="font-medium text-white">{formatDateTime(departure.return_at)}</span>
                </span>
              </div>
            </div>

            {/* Occupancy gauge */}
            <div className="bg-white/5 backdrop-blur rounded-xl p-4 min-w-[200px] border border-white/10">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Popunjenost</div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-white">{departure.booked}</span>
                <span className="text-gray-500">/ {departure.capacity}</span>
                <span className="ml-auto text-sm font-semibold text-indigo-300">{occupancyPct}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${occupancyPct}%`,
                    background: occupancyPct >= 90
                      ? "linear-gradient(90deg, #EF4444, #F87171)"
                      : occupancyPct >= 50
                        ? "linear-gradient(90deg, #6366F1, #818CF8)"
                        : "linear-gradient(90deg, #22C55E, #4ADE80)",
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {departure.capacity - departure.booked} slobodnih mjesta
              </p>
            </div>
          </div>

          {/* Summary stats row */}
          <div className="relative z-10 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Putnika</div>
              <div className="text-lg font-bold text-white">{manifest?.summary.totalGuests ?? departure.booked}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Potvrđeno</div>
              <div className="text-lg font-bold text-emerald-300">{manifest?.summary.confirmedGuests ?? 0}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Naplavljeno</div>
              <div className="text-lg font-bold text-indigo-300">{formatCurrency(manifest?.summary.totalPaid ?? 0, manifest?.summary.currency || "EUR")}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Dugovanja</div>
              <div className="text-lg font-bold text-red-300">{formatCurrency(manifest?.summary.totalDebt ?? 0, manifest?.summary.currency || "EUR")}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
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

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Linija putovanja</h3>
              <div className="flex items-center gap-4 py-2">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-brand-500 ring-4 ring-brand-500/20" />
                  <div className="w-px h-12 bg-gray-200 dark:bg-gray-700" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                </div>
                <div className="flex-1 space-y-6">
                  <div>
                    <div className="text-xs text-gray-500">Polazak</div>
                    <div className="font-medium text-gray-900 dark:text-white">{departure.destination}</div>
                    <div className="text-sm text-gray-500">{formatDateTime(departure.depart_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Povratak</div>
                    <div className="font-medium text-gray-900 dark:text-white">{departure.destination}</div>
                    <div className="text-sm text-gray-500">{formatDateTime(departure.return_at)}</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4 italic">
                Trajanje: {Math.ceil((new Date(departure.return_at).getTime() - new Date(departure.depart_at).getTime()) / 86400000)} dana
              </p>
            </div>

            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Statistika</h3>
              <div className="space-y-3">
                <StatRow label="Ukupno putnika" value={`${manifest?.summary.totalGuests ?? departure.booked}`} />
                <StatRow label="Potvrđeno" value={`${manifest?.summary.confirmedGuests ?? 0}`} color="success" />
                <StatRow label="Na čekanju" value={`${(manifest?.summary.totalGuests ?? 0) - (manifest?.summary.confirmedGuests ?? 0)}`} color="warning" />
                <StatRow label="Otkazano" value={"0"} color="error" />
                <hr className="border-gray-100 dark:border-gray-800" />
                <StatRow label="Hotela" value={`${hotelGroups.length}`} />
                <StatRow label="Grupa (po hotelu)" value={`${groups?.byHotel.length ?? 0}`} />
                <StatRow label="Grupa (po agentu)" value={`${groups?.byAgent.length ?? 0}`} />
              </div>
            </div>
          </div>
        )}

        {/* PASSENGERS TAB */}
        {activeTab === "passengers" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            {passengers.length > 0 ? (
              <DataTable data={normPax} columns={passengerCols} />
            ) : (
              <EmptyState
                title="Nema putnika"
                description="Za ovaj polazak još nisu dodijeljeni putnici. Rezervacije vezane za ovaj polazak automatski se pojavljuju ovdje."
                action={{ label: "Idi na rezervacije", onClick: () => navigate("/reservations") }}
              />
            )}
          </div>
        )}

        {/* GROUPS TAB */}
        {activeTab === "groups" && (
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

        {/* HOTELS TAB */}
        {activeTab === "hotels" && (
          <div className="space-y-4">
            {hotelGroups.length > 0 ? (
              hotelGroups.map((h, idx) => (
                <div key={idx} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{h.label}</h4>
                        {h.roomTypes.length > 0 && (
                          <span className="text-xs text-gray-500">
                            · {h.roomTypes.join(", ")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {h.count} putnik{h.count !== 1 ? "a" : ""} ·
                        {h.checkIn && h.checkOut ? ` ${formatDate(h.checkIn)} → ${formatDate(h.checkOut)}` : ""}
                        {h.guides.length > 0 ? ` · Vodiči: ${h.guides.join(", ")}` : ""}
                      </p>
                    </div>
                    <Badge color="primary" size="sm">{h.count}</Badge>
                  </div>
                  <div className="p-4">
                    <DataTable data={h.passengers} columns={passengerCols.slice(0, 6)} />
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <EmptyState
                  title="Nema dodijeljenih hotela"
                  description="Putnici još nemaju dodijeljene hotele. Dodijelite hotele iz rezervacija da se pojave ovdje."
                  action={{ label: "Idi na hotele", onClick: () => navigate("/operations/hotels") }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: "success" | "warning" | "error" }) {
  const colorMap = {
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`font-semibold ${color ? colorMap[color] : "text-gray-900 dark:text-white"}`}>{value}</span>
    </div>
  );
}
