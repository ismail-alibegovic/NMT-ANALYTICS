import { useState, useEffect } from "react";
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
import { PlusIcon, TrashBinIcon } from "../../icons";
import { getFlights, createFlight, deleteFlight, Flight } from "../../api/operations";

export default function Flights() {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const tr = t.operations.flights;

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [relatedDeparturesFlight, setRelatedDeparturesFlight] = useState<Flight | null>(null);
  const search = ""; // server-side search hook not yet wired to toolbar

  const [formAirline, setFormAirline] = useState("");
  const [formFlightNumber, setFormFlightNumber] = useState("");
  const [formDepAirport, setFormDepAirport] = useState("");
  const [formArrAirport, setFormArrAirport] = useState("");
  const [formDepTime, setFormDepTime] = useState("");
  const [formArrTime, setFormArrTime] = useState("");
  const [formCapacity, setFormCapacity] = useState(180);
  const [formBasePrice, setFormBasePrice] = useState<number | "">("");
  const [formCurrency, setFormCurrency] = useState("BAM");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const focusedFlightId = searchParams.get("flightId");

  const fetchFlights = async () => {
    try {
      setLoading(true);
      const data = await getFlights(search ? { search } : undefined);
      const rows = Array.isArray(data) ? data : [];
      const sorted = focusedFlightId
        ? [...rows].sort((a, b) => Number(b.id === focusedFlightId) - Number(a.id === focusedFlightId))
        : rows;
      setFlights(sorted);
    } catch (err: any) {
      showError(err.message || tr.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchFlights();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  const handleCreate = async () => {
    if (!formAirline.trim() || !formFlightNumber.trim() || !formDepAirport.trim() || !formArrAirport.trim()) {
      showError(tr.requiredFields);
      return;
    }
    try {
      setSubmitting(true);
      await createFlight({
        airline: formAirline.trim(),
        flightNumber: formFlightNumber.trim(),
        departureAirport: formDepAirport.trim().toUpperCase(),
        arrivalAirport: formArrAirport.trim().toUpperCase(),
        departureTime: formDepTime,
        arrivalTime: formArrTime,
        capacity: formCapacity,
        basePrice: formBasePrice === "" ? 0 : Number(formBasePrice),
        currency: formCurrency,
        notes: formNotes || undefined,
        active: true,
      });
      showSuccess(tr.createSuccess);
      setIsModalOpen(false);
      setFormAirline(""); setFormFlightNumber(""); setFormDepAirport(""); setFormArrAirport("");
      setFormDepTime(""); setFormArrTime(""); setFormCapacity(180); setFormBasePrice("");
      setFormCurrency("BAM"); setFormNotes("");
      fetchFlights();
    } catch (err: any) {
      showError(err.message || tr.createError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: Flight) => {
    if (!confirm(tr.confirmDelete.replace('{airline}', f.airline).replace('{flightNumber}', f.flightNumber))) return;
    try {
      await deleteFlight(f.id);
      showSuccess(tr.deleteSuccess);
      fetchFlights();
    } catch (err: any) {
      showError(err.message || tr.deleteError);
    }
  };

  const columns: Column<Flight>[] = [
    {
      key: "airline",
      header: tr.airline,
      render: (_value, f) => (
        <div>
          <span className="font-medium text-gray-900 dark:text-white">{f.airline}</span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{f.flightNumber}</span>
          {focusedFlightId === f.id && (
            <Badge color="primary" size="sm" className="ml-2">
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
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.departureTime ? new Date(f.departureTime).toLocaleString("bs-BA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      ),
    },
    {
      key: "arrivalTime",
      header: tr.arrival,
      render: (_value, f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.arrivalTime ? new Date(f.arrivalTime).toLocaleString("bs-BA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
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
              ? tr.linkedDepartureCount.replace('{count}', String(f.linkedDepartureCount))
              : tr.noLinkedDepartures}
          </span>
          {f.linkedDepartureCount && f.linkedDepartureCount > 0 ? (
            <Button size="sm" variant="outline" onClick={(e) => { e?.stopPropagation(); setRelatedDeparturesFlight(f); }}>
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
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(f); }}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <TrashBinIcon className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <PageMeta title={`${tr.title} — Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        hideSearch
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            <span>{tr.add}</span>
          </Button>
        }
      />


      <div className="p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">{tr.loading}</div>
        ) : flights.length === 0 ? (
          <EmptyState
            title={tr.emptyTitle}
            description={tr.emptyDescription}
            action={{ label: tr.add, onClick: () => setIsModalOpen(true) }}
          />
        ) : (
          <DataTable data={flights} columns={columns} />
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tr.createTitle}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder={tr.airlinePlaceholder} value={formAirline} onChange={e => setFormAirline(e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <input placeholder={tr.flightNumberPlaceholder} value={formFlightNumber} onChange={e => setFormFlightNumber(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <div></div>
            <input placeholder={tr.departureAirportPlaceholder} value={formDepAirport} onChange={e => setFormDepAirport(e.target.value)} maxLength={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700" />
            <input placeholder={tr.arrivalAirportPlaceholder} value={formArrAirport} onChange={e => setFormArrAirport(e.target.value)} maxLength={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700" />
            <div>
              <label className="text-xs text-gray-500">{tr.departureTime}</label>
              <input type="datetime-local" value={formDepTime} onChange={e => setFormDepTime(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <div>
              <label className="text-xs text-gray-500">{tr.arrivalTime}</label>
              <input type="datetime-local" value={formArrTime} onChange={e => setFormArrTime(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <input type="number" placeholder="Kapacitet" value={formCapacity} onChange={e => setFormCapacity(+e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <div className="flex gap-2">
              <input type="number" placeholder="Bazna cijena" value={formBasePrice} onChange={e => setFormBasePrice(e.target.value === "" ? "" : Number(e.target.value))} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
              <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option>BAM</option><option>EUR</option><option>USD</option><option>TRY</option>
              </select>
            </div>
            <input placeholder={tr.notesPlaceholder} value={formNotes} onChange={e => setFormNotes(e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{tr.cancel}</Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? tr.creating : tr.create}
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
                <div key={departure.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">{departure.packageName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{departure.destination}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {departure.departAt ? new Date(departure.departAt).toLocaleString("bs-BA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
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
