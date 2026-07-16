import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { PageToolbar } from "../../components/ui/PageToolbar";
import EmptyState from "../../components/ui/EmptyState";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import { getDepartures, Departure } from "../../api/departures";
import { getAvailability, AvailabilityResponse, AvailabilityRoom } from "../../api/availability";
import { formatDate } from "../../utils/business";
import { GridIcon, TimeIcon } from "../../icons";

type Band = "green" | "amber" | "red";

const bandFromAvail = (available: number, capacity: number): Band => {
  if (capacity <= 0) return "red";
  const ratio = available / capacity;
  if (available <= 0) return "red";
  if (ratio < 0.2) return "amber";
  return "green";
};

const bandClasses: Record<Band, string> = {
  green: "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30",
  amber: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30",
  red: "border-rose-500/40 bg-rose-50 dark:bg-rose-950/30",
};

const bandText: Record<Band, string> = {
  green: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-rose-700 dark:text-rose-300",
};

const bandBar: Record<Band, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

const statusLabel = (status: string): string => {
  switch (status) {
    case "available": return "Available";
    case "almost_full": return "Filling up";
    case "full": return "Full";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status;
  }
};

type Row = {
  departure: Departure;
  availability: AvailabilityResponse | null;
  error: boolean;
};

export default function Availability() {
  const { t } = useT();
  const tr = t.operations.availability;
  const { error: showError } = useToast();
  const navigate = useNavigate();

  const [departures, setDepartures] = useState<Departure[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [packageFilter, setPackageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchDepartures = useCallback(async () => {
    setLoadingDeps(true);
    try {
      const res = await getDepartures({ limit: 200 });
      setDepartures(res.data || []);
    } catch (e: any) {
      showError(e?.message || "Failed to load departures");
    } finally {
      setLoadingDeps(false);
    }
  }, [showError]);

  const fetchAvailability = useCallback(async () => {
    if (departures.length === 0) return;
    setLoadingAvail(true);
    try {
      const results = await Promise.all(
        departures.map(async (d): Promise<Row> => {
          try {
            const a = await getAvailability(d.id);
            return { departure: d, availability: a, error: false };
          } catch {
            return { departure: d, availability: null, error: true };
          }
        }),
      );
      setRows(results);
      setLastFetch(new Date());
    } finally {
      setLoadingAvail(false);
    }
  }, [departures]);

  useEffect(() => {
    fetchDepartures();
  }, [fetchDepartures]);

  useEffect(() => {
    if (departures.length > 0) fetchAvailability();
  }, [departures, fetchAvailability]);

  const packageOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departures) {
      const id = d.package_id;
      const name = d.packages?.name || d.packageName || "(unknown)";
      if (!map.has(id)) map.set(id, name);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [departures]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const pkgName = r.departure.packages?.name || r.departure.packageName || "";
      const dest = r.departure.packages?.destination || r.departure.destination || "";
      if (packageFilter !== "all" && r.departure.package_id !== packageFilter) return false;
      const a = r.availability;
      if (statusFilter !== "all") {
        if (!a || a.occupancy_status !== statusFilter) return false;
      }
      if (q) {
        const haystack = `${pkgName} ${dest} ${r.departure.depart_at}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, packageFilter, statusFilter]);

  const statusOptions = useMemo(() => [
    { value: "available", label: tr.statusGreen },
    { value: "almost_full", label: tr.statusAmber },
    { value: "full", label: tr.statusRed },
  ], [tr]);

  const stats = useMemo(() => {
    const total = rows.length;
    let avail = 0, critical = 0, full = 0;
    for (const r of rows) {
      const a = r.availability;
      if (!a) continue;
      const band = bandFromAvail(a.available, a.capacity);
      if (band === "green") avail++;
      else if (band === "amber") critical++;
      else if (band === "red") full++;
    }
    return { total, avail, critical, full };
  }, [rows]);

  return (
    <>
      <PageMeta title={tr.title} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`${tr.packageName} / ${tr.transport} / ${formatDate(new Date().toISOString())}`}
        filters={[
          { key: "package", label: tr.filterPackage, options: [{ value: "all", label: tr.allPackages }, ...packageOptions], value: packageFilter, onChange: setPackageFilter },
          { key: "status", label: tr.filterStatus, options: [{ value: "all", label: tr.allStatuses }, ...statusOptions], value: statusFilter, onChange: setStatusFilter },
        ]}
        actions={
          <button
            type="button"
            onClick={fetchAvailability}
            disabled={loadingAvail}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <span className={loadingAvail ? "animate-spin" : ""}>↻</span>
            {tr.refresh}
          </button>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tr.summaryTotal} value={stats.total} tone="neutral" />
        <StatCard label={tr.statusGreen} value={stats.avail} tone="green" />
        <StatCard label={tr.summaryCritical} value={stats.critical} tone="amber" />
        <StatCard label={tr.summaryFull} value={stats.full} tone="red" />
      </div>

      {lastFetch && (
        <div className="mt-2 text-xs text-gray-400">
          {t.common.loading === "Loading..." ? "Last refreshed" : "Zadnje osvježeno"}: {lastFetch.toLocaleTimeString()}
        </div>
      )}

      <div className="mt-4">
        {loadingDeps ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState title={tr.noDepartures} description={tr.selectDeparture} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((row) => (
              <DepartureCard key={row.departure.id} row={row} tr={tr} onOpen={() => navigate(`/departures/${row.departure.id}`)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "green" | "amber" | "red" }) {
  const toneClass = {
    neutral: "border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-200",
    green: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-500/30 text-amber-700 dark:text-amber-300",
    red: "border-rose-500/30 text-rose-700 dark:text-rose-300",
  }[tone];
  return (
    <div className={`rounded-xl border bg-white p-4 dark:bg-gray-800 ${toneClass}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function DepartureCard({ row, tr, onOpen }: { row: Row; tr: any; onOpen: () => void }) {
  const { departure, availability, error } = row;
  const pkgName = departure.packages?.name || departure.packageName || "";
  const dest = departure.packages?.destination || departure.destination || "";
  const capacity = availability?.capacity ?? departure.capacity;
  const booked = availability?.booked ?? departure.booked;
  const available = availability?.available ?? Math.max(0, capacity - booked);
  const band = error ? "red" : bandFromAvail(available, capacity);
  const remainRatio = capacity > 0 ? Math.min(1, booked / capacity) : 0;

  return (
    <div className={`rounded-xl border-2 p-4 transition hover:shadow-md ${bandClasses[band]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <TimeIcon className="size-3.5" />
            <span>{formatDate(departure.depart_at)}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-white">{pkgName}</h3>
          {dest && <div className="truncate text-sm text-gray-500 dark:text-gray-400">{dest}</div>}
        </div>
        <BandBadge band={band} label={statusLabel(availability?.occupancy_status ?? "")} bandText={bandText} />
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">{tr.capacity}</span>
          <span className="font-medium text-gray-900 dark:text-white">{capacity}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">{tr.booked}</span>
          <span className="font-medium text-gray-900 dark:text-white">{booked}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">{tr.available}</span>
          <span className={`font-semibold ${bandText[band]}`}>{available}</span>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full ${bandBar[band]}`} style={{ width: `${remainRatio * 100}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <GridIcon className="size-3.5" />
          {tr.transport}: {availability?.transport_type || departure.transport_type || "—"}
        </span>
        {availability && availability.seats_occupied.length > 0 && (
          <span>{tr.occupied}: {availability.seats_occupied.length}</span>
        )}
      </div>

      {availability && availability.rooms.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{tr.rooms}</div>
          <ul className="mt-1 space-y-1">
            {availability.rooms.slice(0, 3).map((r: AvailabilityRoom, i: number) => (
              <li key={r.hotel_id || i} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                <span className="truncate">{r.hotel_name || "—"} · {r.room_type || "—"}</span>
                <span>{r.available}/{r.allocated}</span>
              </li>
            ))}
            {availability.rooms.length > 3 && (
              <li className="text-xs text-gray-400">+{availability.rooms.length - 3}</li>
            )}
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{tr.noRooms}</div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {tr.seatMap}
      </button>
    </div>
  );
}

function BandBadge({ band, label, bandText }: { band: Band; label: string; bandText: Record<Band, string> }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bandText[band]} bg-white/60 dark:bg-gray-900/60`}>
      {label}
    </span>
  );
}
