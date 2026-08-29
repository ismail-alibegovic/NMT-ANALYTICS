import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import Badge from "../../components/ui/badge/Badge";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { TrashBinIcon } from "../../icons";
import {
  getFlights,
  getFlight,
  createFlight,
  updateFlight,
  deleteFlight,
  type Flight,
} from "../../api/flights";

type StatusFilter = "" | "active" | "inactive";

const EMPTY_FORM = {
  airline: "",
  flightNumber: "",
  departureAirport: "",
  arrivalAirport: "",
  departureTime: "",
  arrivalTime: "",
  capacity: "180",
  basePrice: "",
  currency: "BAM",
  notes: "",
  active: true,
};

export default function Flights() {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t, lang } = useT();
  const [searchParams] = useSearchParams();
  const tr = t.operations.flights;
  const locale = lang === "bs" ? "bs-BA" : "en-US";

  const formatDateTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [relatedDeparturesFlight, setRelatedDeparturesFlight] = useState<Flight | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const focusedFlightId = searchParams.get("flightId");

  const fetchFlights = useCallback(async (nextSearch: string, nextStatus: StatusFilter) => {
    try {
      setLoading(true);
      const params: { search?: string; active?: string; limit?: number } = { limit: 200 };
      if (nextSearch.trim()) params.search = nextSearch.trim();
      if (nextStatus) params.active = nextStatus;
      const result = await getFlights(params);
      const rows = result.data || [];
      const sorted = focusedFlightId
        ? [...rows].sort((a, b) => Number(b.id === focusedFlightId) - Number(a.id === focusedFlightId))
        : rows;
      setFlights(sorted);
    } catch (err: any) {
      showError(err?.message || tr.loadError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedFlightId]);

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user && !authLoading) {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(() => fetchFlights(search, statusFilter), 300);
      return () => {
        if (fetchTimer.current) clearTimeout(fetchTimer.current);
      };
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading, search, statusFilter, fetchFlights]);

  const openCreate = () => {
    setEditingFlight(null);
    setForm({ ...EMPTY_FORM });
    setIsModalOpen(true);
  };

  const openEdit = async (f: Flight) => {
    try {
      const fresh = await getFlight(f.id);
      setEditingFlight(fresh);
      setForm({
        airline: fresh.airline,
        flightNumber: fresh.flightNumber,
        departureAirport: fresh.departureAirport,
        arrivalAirport: fresh.arrivalAirport,
        departureTime: fresh.departureTime ? fresh.departureTime.slice(0, 16) : "",
        arrivalTime: fresh.arrivalTime ? fresh.arrivalTime.slice(0, 16) : "",
        capacity: String(fresh.capacity ?? ""),
        basePrice: fresh.basePrice ? String(fresh.basePrice) : "",
        currency: fresh.currency || "BAM",
        notes: fresh.notes || "",
        active: fresh.active,
      });
      setIsModalOpen(true);
    } catch (err: any) {
      showError(err?.message || tr.loadError);
    }
  };

  const setField = (key: keyof typeof EMPTY_FORM, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.departureAirport.trim() || !form.arrivalAirport.trim()) {
      showError(tr.requiredFields);
      return;
    }
    if (form.departureTime && form.arrivalTime && new Date(form.arrivalTime) <= new Date(form.departureTime)) {
      showError(tr.chronologyError);
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        airline: form.airline.trim(),
        flightNumber: form.flightNumber.trim(),
        departureAirport: form.departureAirport.trim().toUpperCase(),
        arrivalAirport: form.arrivalAirport.trim().toUpperCase(),
        departureTime: form.departureTime ? new Date(form.departureTime).toISOString() : "",
        arrivalTime: form.arrivalTime ? new Date(form.arrivalTime).toISOString() : "",
        capacity: form.capacity === "" ? undefined : Number(form.capacity),
        basePrice: form.basePrice === "" ? undefined : Number(form.basePrice),
        currency: form.currency,
        notes: form.notes || undefined,
        active: form.active,
      };
      if (editingFlight) {
        await updateFlight(editingFlight.id, payload);
        showSuccess(tr.editSuccess);
      } else {
        await createFlight(payload);
        showSuccess(tr.createSuccess);
      }
      setIsModalOpen(false);
      setEditingFlight(null);
      setForm({ ...EMPTY_FORM });
      fetchFlights(search, statusFilter);
    } catch (err: any) {
      showError(err?.message || (editingFlight ? tr.editError : tr.createError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (f: Flight) => {
    try {
      await updateFlight(f.id, { active: !f.active });
      showSuccess(tr.toggleSuccess);
      fetchFlights(search, statusFilter);
    } catch (err: any) {
      showError(err?.message || tr.toggleError);
    }
  };

  const handleDelete = async (f: Flight) => {
    if (!confirm(tr.confirmDelete.replace("{airline}", f.airline).replace("{flightNumber}", f.flightNumber))) return;
    try {
      await deleteFlight(f.id);
      showSuccess(tr.deleteSuccess);
      fetchFlights(search, statusFilter);
    } catch (err: any) {
      showError(err?.message || tr.deleteError);
    }
  };

  const columns: Column<Flight>[] = [
    {
      key: "airline",
      header: tr.airline,
      render: (_value, f) => (
        <div className="flex items-center gap-2">
          <span className={`font-medium ${f.active ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
            {f.airline}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{f.flightNumber}</span>
          {!f.active && (
            <Badge color="warning" size="sm">
              {tr.statusInactive}
            </Badge>
          )}
          {focusedFlightId === f.id && (
            <Badge color="primary" size="sm">
              {tr.focus}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "route",
      header: tr.route,
      render: (_value, f) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {f.departureAirport} → {f.arrivalAirport}
        </span>
      ),
    },
    {
      key: "departureTime",
      header: tr.departure,
      render: (_value, f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDateTime(f.departureTime)}</span>
      ),
    },
    {
      key: "arrivalTime",
      header: tr.arrival,
      render: (_value, f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDateTime(f.arrivalTime)}</span>
      ),
    },
    {
      key: "capacity",
      header: tr.capacity,
      render: (_value, f) => <span className="text-sm text-gray-600 dark:text-gray-400">{f.capacity}</span>,
    },
    {
      key: "basePrice",
      header: tr.price,
      render: (_value, f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.basePrice > 0 ? `${f.basePrice} ${f.currency}` : "—"}
        </span>
      ),
    },
    {
      key: "usage",
      header: tr.usage,
      render: (_value, f) => (
        <div className="flex min-w-[140px] flex-col gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {f.linkedDepartureCount && f.linkedDepartureCount > 0
              ? tr.linkedDepartureCount.replace("{count}", String(f.linkedDepartureCount))
              : tr.noLinkedDepartures}
          </span>
          {f.linkedDepartureCount && f.linkedDepartureCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e?.stopPropagation();
                setRelatedDeparturesFlight(f);
              }}
            >
              {tr.viewDepartures}
            </Button>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_value, f) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" onClick={(e?: React.MouseEvent) => { e?.stopPropagation(); openEdit(f); }}>
            {tr.edit}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e?: React.MouseEvent) => {
              e?.stopPropagation();
              handleToggleActive(f);
            }}
          >
            {f.active ? tr.deactivate : tr.activate}
          </Button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(f);
            }}
            className="text-gray-400 transition-colors hover:text-red-500"
            aria-label={tr.delete}
          >
            <TrashBinIcon className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageMeta title={`${tr.title} — Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        searchPlaceholder={tr.searchPlaceholder}
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "status",
            label: tr.status,
            value: statusFilter,
            onChange: (value) => setStatusFilter(value as StatusFilter),
            options: [
              { value: "", label: tr.filterAll },
              { value: "active", label: tr.filterActive },
              { value: "inactive", label: tr.filterInactive },
            ],
          },
        ]}
        createButton={{ label: tr.add, onClick: openCreate }}
      />

      <div className="p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">{tr.loading}</div>
        ) : flights.length === 0 ? (
          <EmptyState
            title={tr.emptyTitle}
            description={tr.emptyDescription}
            action={{ label: tr.add, onClick: () => { setEditingFlight(null); setForm({ ...EMPTY_FORM }); setIsModalOpen(true); } }}
          />
        ) : (
          <DataTable
            data={flights}
            columns={columns}
          />
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingFlight(null); }} className="max-w-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {editingFlight ? tr.editTitle : tr.createTitle}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder={tr.airlinePlaceholder}
              value={form.airline}
              onChange={(e) => setField("airline", e.target.value)}
              className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <input
              placeholder={tr.flightNumberPlaceholder}
              value={form.flightNumber}
              onChange={(e) => setField("flightNumber", e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            />
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setField("active", e.target.checked)}
                  className="size-4 rounded border-gray-300"
                />
                {form.active ? tr.statusActive : tr.statusInactive}
              </label>
            </div>
            <input
              placeholder={tr.departureAirportPlaceholder}
              value={form.departureAirport}
              onChange={(e) => setField("departureAirport", e.target.value)}
              maxLength={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700"
            />
            <input
              placeholder={tr.arrivalAirportPlaceholder}
              value={form.arrivalAirport}
              onChange={(e) => setField("arrivalAirport", e.target.value)}
              maxLength={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700"
            />
            <div>
              <label className="text-xs text-gray-500">{tr.departureTime}</label>
              <input
                type="datetime-local"
                value={form.departureTime}
                onChange={(e) => setField("departureTime", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{tr.arrivalTime}</label>
              <input
                type="datetime-local"
                value={form.arrivalTime}
                onChange={(e) => setField("arrivalTime", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
            <input
              type="number"
              min={1}
              placeholder={tr.capacityPlaceholder}
              value={form.capacity}
              onChange={(e) => setField("capacity", e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder={tr.pricePlaceholder}
                value={form.basePrice}
                onChange={(e) => setField("basePrice", e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
              />
              <select
                value={form.currency}
                onChange={(e) => setField("currency", e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="BAM">BAM</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </select>
            </div>
            <input
              placeholder={tr.notesPlaceholder}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setIsModalOpen(false); setEditingFlight(null); }}>
              {tr.cancel}
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (editingFlight ? tr.updating : tr.creating) : editingFlight ? tr.update : tr.create}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!relatedDeparturesFlight} onClose={() => setRelatedDeparturesFlight(null)} className="max-w-2xl">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tr.relatedDepartures}</h3>
          {relatedDeparturesFlight?.linkedDepartures?.length ? (
            <div className="space-y-3">
              {relatedDeparturesFlight.linkedDepartures.map((departure) => (
                <div
                  key={departure.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">{departure.packageName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{departure.destination}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(departure.departAt)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRelatedDeparturesFlight(null);
                      navigate(`/departures/${departure.id}`);
                    }}
                  >
                    {tr.openDeparture}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={tr.relatedDepartures} description={tr.noRelatedDepartures} />
          )}
        </div>
      </Modal>
    </>
  );
}