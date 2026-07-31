import { useState, useEffect, useMemo } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageShell from "../../components/common/PageShell";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { DownloadIcon, TrashBinIcon, PlusIcon, UserIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getExcursionPassengers, createExcursionPassenger, deleteExcursionPassenger,
  downloadBusListPDF, downloadRumingListPDF,
  ExcursionPassenger,
} from "../../api/operations";
import { getReservations, Reservation } from "../../api/reservations";

export default function Excursions() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.excursions;
  const [passengers, setPassengers] = useState<ExcursionPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState("");
  const [reservationList, setReservationList] = useState<Reservation[]>([]);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formIdDoc, setFormIdDoc] = useState("");
  const [formSeat, setFormSeat] = useState(1);
  const [formPaid, setFormPaid] = useState(0);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getExcursionPassengers(selectedResId);
      setPassengers(data);
      setLoading(false);
    } catch (err: any) {
      showError(err.message || "Failed to load passengers");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      getReservations({ limit: 200 })
        .then((r) => setReservationList(r.data || []))
        .catch(() => setReservationList([]));
    }
  }, [user, authLoading]);

  useEffect(() => { fetchData(); }, [selectedResId]);

  const handleCreate = async () => {
    if (!selectedResId) { showError("Select a reservation"); return; }
    try {
      await createExcursionPassenger({
        reservationId: selectedResId, fullName: formName, phone: formPhone,
        idDocument: formIdDoc, seatNumber: formSeat, paidAmount: formPaid,
      });
      showSuccess("Passenger added");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      showError(err.message || "Failed to add passenger");
    }
  };

  const handleDelete = async (id: string) => {
    try { await deleteExcursionPassenger(id); showSuccess("Passenger removed"); fetchData(); }
    catch (err: any) { showError(err.message || "Failed to delete"); }
  };

  const filteredPassengers = useMemo(() => {
    if (!search.trim()) return passengers;
    const q = search.trim().toLowerCase();
    return passengers.filter((p) =>
      (p.fullName || "").toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (p.idDocument || "").toLowerCase().includes(q)
    );
  }, [passengers, search]);

  const handleBusList = async () => {
    if (!selectedResId) return;
    try {
      const blob = await downloadBusListPDF(selectedResId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "bus_list.pdf";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err: any) { showError(err.message || "Failed to download bus list"); }
  };

  const handleRumingList = async () => {
    try {
      // Ruming list is per departure; we try the first passenger's reservation
      if (passengers.length === 0) { showError("Add passengers first"); return; }
      const blob = await downloadRumingListPDF(selectedResId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "ruming_list.pdf";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err: any) { showError(err.message || "Failed to download ruming list"); }
  };

  const columns: Column<ExcursionPassenger>[] = [
    { key: "fullName", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "idDocument", header: "ID Document" },
    { key: "seatNumber", header: "Seat" },
    { key: "paidAmount", header: "Paid", render: (_v, p) => <span>{p.paidAmount.toLocaleString()} BAM</span> },
    { key: "debtAmount", header: "Debt", render: (_v, p) => <span className={p.debtAmount > 0 ? "text-red-600 font-bold" : ""}>{p.debtAmount.toLocaleString()} BAM</span> },
    {
      key: "actions", header: "",
      render: (_, p) => (
        <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)} title="Remove passenger" className="p-2 text-red-600">
          <TrashBinIcon className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageShell
        title={tr.title}
        subtitle={tr.description}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBusList} disabled={!selectedResId} title="Bus passenger list PDF" className="flex items-center gap-2">
              <DownloadIcon className="w-4 h-4" /> Bus List
            </Button>
            <Button variant="outline" onClick={handleRumingList} disabled={!selectedResId} title="Hotel rooming list PDF" className="flex items-center gap-2">
              <DownloadIcon className="w-4 h-4" /> Ruming List
            </Button>
            <Button variant="primary" onClick={() => setIsModalOpen(true)} disabled={!selectedResId} className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> Add Passenger
            </Button>
          </div>
        }
      >
        <PageToolbar
          searchPlaceholder={tr.search}
          searchValue={search}
          onSearchChange={setSearch}
        />

      {/* Reservation selector — always visible */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Reservation</label>
        <div className="flex gap-2 max-w-2xl">
          <select
            value={selectedResId}
            onChange={e => setSelectedResId(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">— Select reservation —</option>
            {reservationList.map((r) => (
              <option key={r.id} value={r.id}>{r.customerName} — {r.packageName || 'Package'} ({r.partySize} ppl)</option>
            ))}
          </select>
          {selectedResId && (
            <Button variant="outline" onClick={() => setSelectedResId("")} title="Clear selection" className="!px-3">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {selectedResId && filteredPassengers.length > 0 && (() => {
        const totalPaid = filteredPassengers.reduce((s, p) => s + (p.paidAmount || 0), 0);
        const totalDebt = filteredPassengers.reduce((s, p) => s + (p.debtAmount || 0), 0);
        return (
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-medium uppercase text-gray-500">Passengers</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{filteredPassengers.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <p className="text-xs font-medium uppercase text-emerald-700 dark:text-emerald-300">Paid</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{totalPaid.toLocaleString()} BAM</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
              <p className="text-xs font-medium uppercase text-red-700 dark:text-red-300">Outstanding debt</p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{totalDebt.toLocaleString()} BAM</p>
            </div>
          </div>
        );
      })()}

      {!selectedResId ? (
        <EmptyState title="Select a reservation" description="Choose a reservation above to view and manage its passenger list, bus & ruming lists." />
      ) : loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredPassengers.length === 0 ? (
        <EmptyState title="No passengers" description={search ? "Try a different search" : "Add your first passenger for this reservation"} action={{ label: "Add Passenger", onClick: () => setIsModalOpen(true) }} />
      ) : (
        <DataTable data={filteredPassengers} columns={columns} />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-2xl">
        <div className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-brand-500" /> Add Passenger
          </h3>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Reservation</label>
            <select value={selectedResId} disabled className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
              <option value="">Select reservation...</option>
              {reservationList.map((r) => (
                <option key={r.id} value={r.id}>{r.customerName} — {r.packageName || ''} ({r.partySize} people)</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Change selection from the dropdown above the list.</p>
          </div>
          <input placeholder="Full name" value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Phone" value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="ID Document / Passport" value={formIdDoc} onChange={e => setFormIdDoc(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Seat number" value={formSeat} onChange={e => setFormSeat(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Amount paid" value={formPaid} onChange={e => setFormPaid(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Add</Button>
          </div>
        </div>
      </Modal>
      </PageShell>
    </>
  );
}