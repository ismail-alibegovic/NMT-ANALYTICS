import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import Input from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import Select from "../../components/form/Select";
import Badge from "../../components/ui/badge/Badge";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { toDateTimeInput as flightLocalTime, fromDateTimeInput } from "../../utils/dateTimeInput";
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

// An unchanged minute-level control must retain any stored seconds/milliseconds.
function serializeFlightTime(value: string, original?: string) {
  return fromDateTimeInput(original && value === flightLocalTime(original) ? original : value);
}

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
  const submitLock = useRef(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const closeForm = () => {
    if (submitLock.current) return;
    setIsModalOpen(false);
    setEditingFlight(null);
  };
  const focusedFlightId = searchParams.get("flightId");

  const fetchFlights = useCallback(async (nextSearch: string, nextStatus: StatusFilter) => {
    try {
      setLoading(true);
      const params: { search?: string; active?: string; limit?: number } = { limit: 200 };
      if (nextSearch.trim()) params.search = nextSearch.trim();
      if (nextStatus) params.active = nextStatus === "active" ? "true" : "false";
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
    setFormErrors({});
    setSaveError("");
    setForm({ ...EMPTY_FORM });
    setIsModalOpen(true);
  };

  const openEdit = async (f: Flight) => {
    try {
      const fresh = await getFlight(f.id);
      setEditingFlight(fresh);
      setFormErrors({});
      setSaveError("");
      setForm({
        airline: fresh.airline,
        flightNumber: fresh.flightNumber,
        departureAirport: fresh.departureAirport,
        arrivalAirport: fresh.arrivalAirport,
        departureTime: fresh.departureTime ? flightLocalTime(fresh.departureTime) : "",
        arrivalTime: fresh.arrivalTime ? flightLocalTime(fresh.arrivalTime) : "",
        capacity: String(fresh.capacity ?? ""),
        basePrice: fresh.basePrice != null ? String(fresh.basePrice) : "",
        currency: fresh.currency || "BAM",
        notes: fresh.notes || "",
        active: fresh.active,
      });
      setIsModalOpen(true);
    } catch (err: any) {
      showError(err?.message || tr.loadError);
    }
  };

  const setField = (key: keyof typeof EMPTY_FORM, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: "" }));
    setSaveError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const errors: Record<string, string> = {};
    for (const key of ["airline", "flightNumber", "departureAirport", "arrivalAirport", "departureTime", "arrivalTime"] as const) {
      if (!form[key].trim()) errors[key] = tr.requiredFields;
    }
    for (const key of ["departureAirport", "arrivalAirport"] as const) {
      if (form[key] && !/^[A-Z]{3}$/.test(form[key].trim().toUpperCase())) errors[key] = tr.airportError;
    }
    if (form.departureAirport.trim() && form.departureAirport.trim().toUpperCase() === form.arrivalAirport.trim().toUpperCase()) errors.arrivalAirport = tr.sameAirportError;
    for (const key of ["departureTime", "arrivalTime"] as const) {
      if (form[key] && (!Number.isFinite(new Date(form[key]).getTime()) || flightLocalTime(form[key]) !== form[key])) errors[key] = tr.dateError;
    }
    if (form.departureTime && form.arrivalTime && new Date(form.arrivalTime) <= new Date(form.departureTime)) errors.arrivalTime = tr.chronologyError;
    if (form.capacity === "" || !Number.isSafeInteger(Number(form.capacity)) || Number(form.capacity) <= 0) errors.capacity = tr.capacityError;
    if (form.basePrice !== "" && (!Number.isFinite(Number(form.basePrice)) || Number(form.basePrice) < 0)) errors.basePrice = tr.priceError;
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById(`flight-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    submitLock.current = true;
    setSaveError("");
    try {
      setSubmitting(true);
      const payload = {
        airline: form.airline.trim(),
        flightNumber: form.flightNumber.trim(),
        departureAirport: form.departureAirport.trim().toUpperCase(),
        arrivalAirport: form.arrivalAirport.trim().toUpperCase(),
        departureTime: serializeFlightTime(form.departureTime, editingFlight?.departureTime),
        arrivalTime: serializeFlightTime(form.arrivalTime, editingFlight?.arrivalTime),
        capacity: form.capacity === "" ? undefined : Number(form.capacity),
        basePrice: form.basePrice === "" ? 0 : Number(form.basePrice),
        currency: form.currency,
        notes: form.notes.trim() || null,
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
      setSaveError(err?.message || (editingFlight ? tr.editError : tr.createError));
    } finally {
      submitLock.current = false;
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
            label: t.common.status,
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
            action={{ label: tr.add, onClick: openCreate }}
          />
        ) : (
          <DataTable
            data={flights}
            columns={columns}
          />
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeForm} className="max-w-2xl" scrollable closeLabel={t.common.close} title={editingFlight ? tr.editTitle : tr.createTitle}>
        <form onSubmit={handleSubmit} noValidate className="space-y-6 p-4 sm:p-6" aria-busy={submitting}>
          <fieldset disabled={submitting} className="min-w-0 space-y-5">
            <legend className="mb-4 text-sm text-gray-600 dark:text-gray-400">{tr.requiredHint}</legend>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              {([
                ["airline", tr.airline, tr.airlinePlaceholder, "text", true],
                ["flightNumber", tr.flightNumberLabel, tr.flightNumberPlaceholder, "text", true],
                ["departureAirport", tr.departureAirportLabel, tr.departureAirportPlaceholder, "text", true],
                ["arrivalAirport", tr.arrivalAirportLabel, tr.arrivalAirportPlaceholder, "text", true],
                ["departureTime", tr.departureTime, "", "datetime-local", true],
                ["arrivalTime", tr.arrivalTime, "", "datetime-local", true],
                ["capacity", tr.capacity, tr.capacityPlaceholder, "number", true],
                ["basePrice", tr.pricePlaceholder, "0.00", "number", false],
              ] as const).map(([key, label, placeholder, type, required]) => (
                <div key={key} className="min-w-0">
                  <Label htmlFor={`flight-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</Label>
                  <Input id={`flight-${key}`} name={key} type={type} required={required}
                    placeholder={placeholder} value={form[key]} onChange={(e) => setField(key, e.target.value)}
                    min={key === "capacity" ? "1" : key === "basePrice" ? "0" : undefined}
                    step={key === "capacity" ? 1 : key === "basePrice" ? 0.01 : undefined}
                    maxLength={key.endsWith("Airport") ? 3 : undefined}
                    className={key.endsWith("Airport") ? "uppercase" : ""}
                    error={!!formErrors[key]} hint={formErrors[key]} />
                </div>
              ))}
              <div className="min-w-0">
                <Label htmlFor="flight-currency">{tr.currencyLabel}</Label>
                <Select id="flight-currency" name="currency" placeholder={tr.currencyLabel} value={form.currency} onChange={(value) => setField("currency", value)}
                  options={Array.from(new Set(["BAM", "EUR", "USD", "TRY", form.currency])).map(value => ({ value, label: value }))} />
              </div>
              <div className="flex min-h-11 items-center sm:pt-7">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} className="size-4 rounded border-gray-300" />
                  {tr.statusActive}
                </label>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{tr.timezoneHint} {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            <div>
              <Label htmlFor="flight-notes">{tr.notesLabel}</Label>
              <textarea id="flight-notes" name="notes" value={form.notes} onChange={(e) => setField("notes", e.target.value)}
                rows={3} placeholder={tr.notesPlaceholder}
                className="w-full min-w-0 resize-y rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
            </div>
          </fieldset>
          {saveError && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{saveError}</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            <Button variant="outline" onClick={closeForm} disabled={submitting}>{tr.cancel}</Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (editingFlight ? tr.updating : tr.creating) : editingFlight ? tr.update : tr.create}
            </Button>
          </div>
        </form>
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