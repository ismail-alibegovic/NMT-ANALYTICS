import { useState, useEffect, useCallback, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { DownloadIcon, CheckLineIcon, TrashBinIcon, PlusIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getContracts, createContract, updateContract as signContract, deleteContract, downloadContractPDF,
  Contract, ContractListResponse,
} from "../../api/contracts";
import { getReservations, Reservation } from "../../api/reservations";
import { formatDate, formatCurrency } from "../../utils/business";

const ITEMS_PER_PAGE = 10;
type ContractFormError = "reservation_required" | "create_failed" | null;

export default function Contracts() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-US" : "bs-BA";
  const tr = t.operations.contracts;

  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const loadErrorTextRef = useRef(tr.loadError);
  loadErrorTextRef.current = tr.loadError;

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "signed" | "cancelled">("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsError, setReservationsError] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const creatingLock = useRef(false);
  const [formError, setFormError] = useState<ContractFormError>(null);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchContracts = useCallback(async (page = 1, q = "", status = "") => {
    setLoading(true);
    setLoadError(false);
    try {
      const response: ContractListResponse = await getContracts({
        page,
        limit: ITEMS_PER_PAGE,
        search: q,
        status: (status as "draft" | "signed" | "cancelled") || undefined,
      });
      setContracts(response.data || []);
      setTotalItems(response.total || 0);
      setCurrentPage(page);
    } catch (err: any) {
      console.error("Failed to fetch contracts:", err);
      setLoadError(true);
      setContracts([]);
      setTotalItems(0);
      showErrorRef.current(loadErrorTextRef.current);
    } finally {
      setLoading(false);
    }
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId && !authLoading) void fetchContracts(1, search);
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, fetchContracts]);

  useEffect(() => {
    if (!isModalOpen) return;
    setReservationsError(false);
    getReservations({ limit: 50 })
      .then(r => setReservations(r.data || []))
      .catch(() => {
        setReservations([]);
        setReservationsError(true);
      });
  }, [isModalOpen]);

  const handleSearch = (v: string) => { setSearch(v); void fetchContracts(1, v, statusFilter); };
  const handleStatusChange = (s: "" | "draft" | "signed" | "cancelled") => { setStatusFilter(s); void fetchContracts(1, search, s); };
  const handlePageChange = (p: number) => { setCurrentPage(p); void fetchContracts(p, search, statusFilter); };

  const resolveFormError = (code: Exclude<ContractFormError, null>) => {
    if (code === "reservation_required") return tr.selectReservation;
    return tr.createError;
  };

  const handleCreate = async () => {
    if (creatingLock.current) return;
    setFormError(null);
    if (!selectedReservation) {
      setFormError("reservation_required");
      showError(tr.selectReservation);
      return;
    }
    creatingLock.current = true;
    setCreating(true);
    try {
      await createContract({ reservationId: selectedReservation });
      showSuccess(tr.generatedSuccess);
      setIsModalOpen(false);
      setSelectedReservation("");
      setFormError(null);
      void fetchContracts(currentPage, search, statusFilter);
    } catch {
      setFormError("create_failed");
      showError(tr.createError);
    } finally {
      creatingLock.current = false;
      setCreating(false);
    }
  };

  const handleSign = async (c: Contract) => {
    if (!confirm(tr.confirmSignPrompt.replace("{number}", c.contractNumber))) return;
    try {
      await signContract(c.id, { status: "signed", signedAt: new Date().toISOString() });
      showSuccess(tr.signedSuccess);
      void fetchContracts(currentPage, search, statusFilter);
    } catch {
      showError(tr.signError);
    }
  };

  const handleDelete = async (c: Contract) => {
    if (!confirm(tr.confirmDeletePrompt.replace("{number}", c.contractNumber))) return;
    try {
      await deleteContract(c.id);
      showSuccess(tr.deleteSuccess);
      void fetchContracts(currentPage, search, statusFilter);
    } catch {
      showError(tr.deleteError);
    }
  };

  const handlePdf = async (c: Contract) => {
    try {
      const blob = await downloadContractPDF(c.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.contractNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError(tr.downloadError);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "signed") return <Badge color="success" variant="light">{tr.signed}</Badge>;
    if (status === "cancelled") return <Badge color="error" variant="light">{tr.cancelled}</Badge>;
    return <Badge color="warning" variant="light">{tr.draft}</Badge>;
  };

  const columns: Column<Contract>[] = [
    { key: "contractNumber", header: tr.numberShort, render: (v) => <span className="font-mono text-sm">{v as string}</span> },
    { key: "travelerName", header: tr.traveler, render: (v) => <span className="font-medium text-gray-900 dark:text-white">{v as string}</span> },
    { key: "packageDescription", header: tr.package, render: (v) => <span className="text-gray-600 dark:text-gray-300">{(v as string) || "—"}</span> },
    { key: "totalAmount", header: tr.totalAmount, render: (_v, c) => <span>{formatCurrency(c.totalAmount, "BAM", locale)}</span> },
    { key: "contractDate", header: tr.contractDate, render: (v) => formatDate(v as string, locale) },
    { key: "status", header: tr.status, render: (v) => statusBadge(v as string) },
    {
      key: "actions", header: tr.actions,
      render: (_, c) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" title={tr.downloadPdfLabel} aria-label={`${tr.downloadPdfLabel} ${c.contractNumber}`} onClick={() => void handlePdf(c)} className="p-2">
            <DownloadIcon className="w-4 h-4" />
          </Button>
          {c.status === "draft" && (
            <Button size="sm" variant="outline" title={tr.signLabel} aria-label={`${tr.signLabel} ${c.contractNumber}`} onClick={() => void handleSign(c)} className="p-2 text-green-600">
              <CheckLineIcon className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" title={tr.deleteLabel} aria-label={`${tr.deleteLabel} ${c.contractNumber}`} onClick={() => void handleDelete(c)} className="p-2 text-red-600">
            <TrashBinIcon className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title={tr.signInTitle} description={tr.signInDesc} /></div>;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={`${tr.description} · UG-YYYY-XXXX`}
        searchPlaceholder={tr.search}
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            key: "status",
            label: tr.allStatuses,
            value: statusFilter,
            onChange: (v) => handleStatusChange(v as "" | "draft" | "signed" | "cancelled"),
            options: [
              { value: "draft", label: tr.draft },
              { value: "signed", label: tr.signed },
              { value: "cancelled", label: tr.cancelled },
            ],
          },
        ]}
        actions={
          <Button variant="primary" onClick={() => { setFormError(null); setIsModalOpen(true); }} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> {tr.add}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
          <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{tr.loadError}</p>
          <Button type="button" variant="outline" onClick={() => void fetchContracts(currentPage, search, statusFilter)}>{tr.retry}</Button>
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          title={search ? tr.noMatching : tr.noContracts}
          description={search ? tr.tryDifferentSearch : tr.emptyDesc}
          action={!search ? { label: tr.add, onClick: () => { setFormError(null); setIsModalOpen(true); } } : undefined}
        />
      ) : (
        <>
          <DataTable data={contracts} columns={columns} />
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={tr.modalTitle} className="max-w-md">
        <div className="space-y-4 p-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tr.modalDescription}
          </p>
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {resolveFormError(formError)}
            </div>
          )}
          {reservationsError && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{tr.reservationsLoadError}</p>
          )}
          <div>
            <label htmlFor="contract-reservation" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.reservationRef}</label>
            <select
              id="contract-reservation"
              value={selectedReservation}
              onChange={(e) => { setSelectedReservation(e.target.value); setFormError(null); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            >
              <option value="">{tr.selectPlaceholder}</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.customerName} — {r.packageName || tr.packageFallback} ({formatDate(r.bookingDate, locale)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={creating}>{tr.cancel}</Button>
            <Button variant="primary" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? tr.generating : tr.generateAction}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
