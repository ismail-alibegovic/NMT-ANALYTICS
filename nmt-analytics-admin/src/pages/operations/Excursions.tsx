import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { DownloadIcon, TrashBinIcon, PlusIcon, UserIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { formatCurrency } from "../../utils/business";
import {
  getExcursionPassengers, createExcursionPassenger, deleteExcursionPassenger,
  downloadBusListPDF, downloadRumingListPDF,
  ExcursionPassenger,
} from "../../api/operations";
import { getReservations, Reservation } from "../../api/reservations";

export default function Excursions() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t, lang } = useT();
  const tr = t.operations.excursions;
  const locale = lang === "bs" ? "bs-BA" : "en-GB";
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const trRef = useRef(tr);
  trRef.current = tr;
  const requestVersion = useRef(0);
  const [passengers, setPassengers] = useState<ExcursionPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState("");
  const [reservationList, setReservationList] = useState<Reservation[]>([]);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formIdDoc, setFormIdDoc] = useState("");
  const [formSeat, setFormSeat] = useState(1);
  const [formPaid, setFormPaid] = useState(0);
  const [search, setSearch] = useState("");
  const userId = user?.id;

  const fetchData = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!selectedResId) {
      setPassengers([]);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getExcursionPassengers(selectedResId);
      if (version === requestVersion.current) {
        setPassengers(Array.isArray(data) ? data : []);
      }
    } catch {
      if (version === requestVersion.current) {
        setLoadError(true);
        showErrorRef.current(trRef.current.loadError);
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
      }
    }
  }, [selectedResId]);

  useEffect(() => {
    if (userId && !authLoading) {
      getReservations({ limit: 200 })
        .then((r) => setReservationList(r.data || []))
        .catch(() => setReservationList([]));
    }
  }, [userId, authLoading]);

  useEffect(() => {
    void fetchData();
    return () => {
      requestVersion.current += 1;
    };
  }, [fetchData]);

  const handleCreate = async () => {
    if (!selectedResId) { showError(tr.selectReservationError); return; }
    try {
      await createExcursionPassenger({
        reservationId: selectedResId, fullName: formName, phone: formPhone,
        idDocument: formIdDoc, seatNumber: formSeat, paidAmount: formPaid,
      });
      showSuccess(tr.addSuccess);
      setIsModalOpen(false);
      void fetchData();
    } catch {
      showError(tr.addError);
    }
  };

  const handleDelete = async (id: string) => {
    try { await deleteExcursionPassenger(id); showSuccess(tr.deleteSuccess); void fetchData(); }
    catch { showError(tr.deleteError); }
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
    } catch { showError(tr.busListError); }
  };

  const handleRumingList = async () => {
    try {
      // Ruming list is per departure; we try the first passenger's reservation
      if (passengers.length === 0) { showError(tr.rumingListEmptyError); return; }
      const blob = await downloadRumingListPDF(selectedResId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "ruming_list.pdf";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { showError(tr.rumingListError); }
  };

  const columns: Column<ExcursionPassenger>[] = [
    { key: "fullName", header: tr.fullName },
    { key: "phone", header: tr.phone },
    { key: "idDocument", header: tr.idDocument },
    { key: "seatNumber", header: tr.seat },
    { key: "paidAmount", header: tr.paid, render: (_v, p) => <span>{formatCurrency(p.paidAmount, "BAM", locale)}</span> },
    { key: "debtAmount", header: tr.debt, render: (_v, p) => <span className={p.debtAmount > 0 ? "text-red-600 font-bold" : ""}>{formatCurrency(p.debtAmount, "BAM", locale)}</span> },
    {
      key: "actions", header: "",
      render: (_, p) => (
        <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)} title={tr.removePassenger} aria-label={tr.removePassenger} className="p-2 text-red-600">
          <TrashBinIcon className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        searchPlaceholder={tr.search}
        searchValue={search}
        onSearchChange={setSearch}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/waivers" className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">{tr.passengerConsent}</Link>
            <Button variant="outline" onClick={handleBusList} disabled={!selectedResId} title={tr.busListTooltip} className="flex items-center gap-2">
              <DownloadIcon className="w-4 h-4" /> {tr.busList}
            </Button>
            <Button variant="outline" onClick={handleRumingList} disabled={!selectedResId} title={tr.rumingListTooltip} className="flex items-center gap-2">
              <DownloadIcon className="w-4 h-4" /> {tr.rumingList}
            </Button>
            <Button variant="primary" onClick={() => setIsModalOpen(true)} disabled={!selectedResId} className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> {tr.add}
            </Button>
          </div>
        }
      />

      {/* Reservation selector — always visible */}
      <div className="mb-6 min-w-0">
        <label htmlFor="excursion-reservation-select" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.selectReservation}</label>
        <div className="flex min-w-0 w-full max-w-2xl gap-2">
          <select
            id="excursion-reservation-select"
            value={selectedResId}
            onChange={e => setSelectedResId(e.target.value)}
            className="min-w-0 w-full max-w-full flex-1 truncate rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">{tr.selectReservationPlaceholder}</option>
            {reservationList.map((r) => (
              <option key={r.id} value={r.id}>{r.customerName} — {r.packageName || t.departures.package} ({tr.peopleShort.replace("{count}", String(r.partySize))})</option>
            ))}
          </select>
          {selectedResId && (
            <Button variant="outline" onClick={() => setSelectedResId("")} title={tr.clearSelection} className="!px-3">
              {t.common.clear}
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {selectedResId && !loadError && filteredPassengers.length > 0 && (() => {
        const totalPaid = filteredPassengers.reduce((s, p) => s + (p.paidAmount || 0), 0);
        const totalDebt = filteredPassengers.reduce((s, p) => s + (p.debtAmount || 0), 0);
        return (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-medium uppercase text-gray-500">{tr.summaryPassengers}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{filteredPassengers.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <p className="text-xs font-medium uppercase text-emerald-700 dark:text-emerald-300">{tr.summaryPaid}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(totalPaid, "BAM", locale)}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
              <p className="text-xs font-medium uppercase text-red-700 dark:text-red-300">{tr.summaryDebt}</p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(totalDebt, "BAM", locale)}</p>
            </div>
          </div>
        );
      })()}

      {!selectedResId ? (
        <EmptyState title={tr.selectReservationTitle} description={tr.selectReservationDesc} />
      ) : loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-500/30 dark:bg-error-500/10">
          <p role="alert" className="mb-4 text-sm text-error-700 dark:text-error-300">{tr.loadError}</p>
          <Button variant="outline" onClick={() => void fetchData()}>{tr.retryLoad}</Button>
        </div>
      ) : filteredPassengers.length === 0 ? (
        <EmptyState title={tr.noPassengers} description={search ? tr.tryDifferentSearch : tr.addFirst} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : (
        <DataTable data={filteredPassengers} columns={columns} />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-2xl" title={tr.add}>
        <div className="space-y-4 p-6">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-brand-500" /> {tr.add}
          </h3>
          <div>
            <label htmlFor="excursion-modal-reservation" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.selectReservation}</label>
            <select id="excursion-modal-reservation" value={selectedResId} disabled className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
              <option value="">{tr.selectReservationPlaceholder}</option>
              {reservationList.map((r) => (
                <option key={r.id} value={r.id}>{r.customerName} — {r.packageName || ''} ({tr.peopleShort.replace("{count}", String(r.partySize))})</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tr.changeReservationHint}</p>
          </div>
          <input aria-label={tr.fullName} placeholder={tr.fullName} value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input aria-label={tr.phone} placeholder={tr.phone} value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input aria-label={tr.idDocument} placeholder={tr.idDocument} value={formIdDoc} onChange={e => setFormIdDoc(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input aria-label={tr.seatPlaceholder} type="number" placeholder={tr.seatPlaceholder} value={formSeat} onChange={e => setFormSeat(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input aria-label={tr.paidPlaceholder} type="number" placeholder={tr.paidPlaceholder} value={formPaid} onChange={e => setFormPaid(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t.common.cancel}</Button>
            <Button variant="primary" onClick={handleCreate}>{t.common.add}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}