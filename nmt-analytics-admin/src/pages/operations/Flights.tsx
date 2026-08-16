import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { PlusIcon, TrashBinIcon } from "../../icons";
import { getFlights, createFlight, deleteFlight, Flight } from "../../api/operations";

export default function Flights() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const fetchFlights = async () => {
    try {
      setLoading(true);
      const data = await getFlights(search ? { search } : undefined);
      setFlights(data);
    } catch (err: any) {
      showError(err.message || "Greška pri učitavanju letova");
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
      showError("Popunite obavezna polja");
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
      showSuccess("Let kreiran");
      setIsModalOpen(false);
      setFormAirline(""); setFormFlightNumber(""); setFormDepAirport(""); setFormArrAirport("");
      setFormDepTime(""); setFormArrTime(""); setFormCapacity(180); setFormBasePrice("");
      setFormCurrency("BAM"); setFormNotes("");
      fetchFlights();
    } catch (err: any) {
      showError(err.message || "Greška pri kreiranju leta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: Flight) => {
    if (!confirm(`Obrisati let ${f.airline} ${f.flightNumber}?`)) return;
    try {
      await deleteFlight(f.id);
      showSuccess("Let obrisan");
      fetchFlights();
    } catch (err: any) {
      showError(err.message || "Greška pri brisanju");
    }
  };

  const columns: Column<Flight>[] = [
    {
      key: "airline",
      header: "Aviokompanija",
      render: (f) => (
        <div>
          <span className="font-medium text-gray-900 dark:text-white">{f.airline}</span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{f.flightNumber}</span>
        </div>
      ),
    },
    {
      key: "route",
      header: "Ruta",
      render: (f) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {f.departureAirport} → {f.arrivalAirport}
        </span>
      ),
    },
    {
      key: "departureTime",
      header: "Polazak",
      render: (f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.departureTime ? new Date(f.departureTime).toLocaleString("bs-BA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      ),
    },
    {
      key: "arrivalTime",
      header: "Dolazak",
      render: (f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.arrivalTime ? new Date(f.arrivalTime).toLocaleString("bs-BA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      ),
    },
    {
      key: "capacity",
      header: "Kapacitet",
      render: (f) => <span className="text-sm text-gray-600 dark:text-gray-400">{f.capacity}</span>,
    },
    {
      key: "basePrice",
      header: "Cijena",
      render: (f) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {f.basePrice > 0 ? `${f.basePrice} ${f.currency}` : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (f) => (
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
      <PageMeta title="Letovi — Travline" description="Katalog letova i avio prijevoza" />
      <PageToolbar
        title="Letovi"
        hideSearch
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            <span>Novi let</span>
          </Button>
        }
      />


      <div className="p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-gray-400">Učitavanje...</div>
        ) : flights.length === 0 ? (
          <EmptyState
            title="Nema letova"
            description="Dodajte prvi let u katalog"
            action={{ label: "Novi let", onClick: () => setIsModalOpen(true) }}
          />
        ) : (
          <DataTable data={flights} columns={columns} />
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-lg">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Novi let</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Aviokompanija (npr. Turkish Airlines)" value={formAirline} onChange={e => setFormAirline(e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <input placeholder="Broj leta (npr. TK101)" value={formFlightNumber} onChange={e => setFormFlightNumber(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <div></div>
            <input placeholder="Aerodrom polaska (npr. SJJ)" value={formDepAirport} onChange={e => setFormDepAirport(e.target.value)} maxLength={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700" />
            <input placeholder="Aerodrom dolaska (npr. IST)" value={formArrAirport} onChange={e => setFormArrAirport(e.target.value)} maxLength={4} className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase dark:bg-gray-800 dark:border-gray-700" />
            <div>
              <label className="text-xs text-gray-500">Vrijeme polaska</label>
              <input type="datetime-local" value={formDepTime} onChange={e => setFormDepTime(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Vrijeme dolaska</label>
              <input type="datetime-local" value={formArrTime} onChange={e => setFormArrTime(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <input type="number" placeholder="Kapacitet" value={formCapacity} onChange={e => setFormCapacity(+e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            <div className="flex gap-2">
              <input type="number" placeholder="Bazna cijena" value={formBasePrice} onChange={e => setFormBasePrice(e.target.value === "" ? "" : Number(e.target.value))} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
              <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option>BAM</option><option>EUR</option><option>USD</option><option>TRY</option>
              </select>
            </div>
            <input placeholder="Napomene (opcionalno)" value={formNotes} onChange={e => setFormNotes(e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Odustani</Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? "Kreiranje..." : "Kreiraj"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
