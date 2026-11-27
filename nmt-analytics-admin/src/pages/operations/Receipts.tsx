import { useState, useEffect, useCallback, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { DownloadIcon, TrashBinIcon, PlusIcon, ArrowRightIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getReceipts, createReceipt, refundReceipt, deleteReceipt, downloadReceiptPDF,
  Receipt, ReceiptListResponse,
} from "../../api/receipts";
import { getReservations, Reservation } from "../../api/reservations";
import { formatDate, formatCurrency } from "../../utils/business";

const ITEMS_PER_PAGE = 10;
type ReceiptFormError = "reservation_required" | "invalid_amount" | "create_failed" | null;

export default function Receipts() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-US" : "bs-BA";
  const tr = t.operations.receipts;

  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const loadErrorTextRef = useRef(tr.loadError);
  loadErrorTextRef.current = tr.loadError;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "advance" | "final" | "refund">("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsError, setReservationsError] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState("");
  const [receiptType, setReceiptType] = useState<"advance" | "final" | "refund">("final");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank">("cash");
  const [creating, setCreating] = useState(false);
  const creatingLock = useRef(false);
  const [formError, setFormError] = useState<ReceiptFormError>(null);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchReceipts = useCallback(async (page = 1, q = "", type = "") => {
    setLoading(true);
    setLoadError(false);
    try {
      const r: ReceiptListResponse = await getReceipts({
        page,
        limit: ITEMS_PER_PAGE,
        search: q,
        type: (type as "advance" | "final" | "refund") || undefined,
      });
      setReceipts(r.data || []);
      setTotalItems(r.total || 0);
      setCurrentPage(page);
    } catch {
      setLoadError(true);
      setReceipts([]);
      setTotalItems(0);
      showErrorRef.current(loadErrorTextRef.current);
    } finally {
      setLoading(false);
    }
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId && !authLoading) void fetchReceipts(1, search, typeFilter);
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authLoading, fetchReceipts]);

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

  const handleSearch = (v: string) => { setSearch(v); void fetchReceipts(1, v, typeFilter); };
  const handleTypeChange = (nextType: "" | "advance" | "final" | "refund") => { setTypeFilter(nextType); void fetchReceipts(1, search, nextType); };
  const handlePageChange = (p: number) => { void fetchReceipts(p, search, typeFilter); };

  const resolveFormError = (code: Exclude<ReceiptFormError, null>) => {
    if (code === "reservation_required") return tr.selectReservation;
    if (code === "invalid_amount") return tr.invalidAmount;
    return tr.issueError;
  };

  const handleCreate = async () => {
    if (creatingLock.current) return;
    setFormError(null);
    if (!selectedReservation) {
      setFormError("reservation_required");
      showError(tr.selectReservation);
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setFormError("invalid_amount");
      showError(tr.invalidAmount);
      return;
    }
    creatingLock.current = true;
    setCreating(true);
    try {
      await createReceipt({ reservationId: selectedReservation, receiptType, amount: amt, paymentMethod });
      showSuccess(tr.issuedSuccess);
      setIsModalOpen(false);
      setSelectedReservation("");
      setAmount("");
      setFormError(null);
      void fetchReceipts(currentPage, search, typeFilter);
    } catch {
      setFormError("create_failed");
      showError(tr.issueError);
    } finally {
      creatingLock.current = false;
      setCreating(false);
    }
  };

  const handleRefund = async (r: Receipt) => {
    if (!confirm(tr.confirmRefundPrompt.replace("{number}", r.receiptNumber))) return;
    try {
      await refundReceipt(r.id, { amount: r.amount, paymentMethod: r.paymentMethod || "bank" });
      showSuccess(tr.refundSuccess);
      void fetchReceipts(currentPage, search, typeFilter);
    } catch {
      showError(tr.refundError);
    }
  };

  const handleDelete = async (r: Receipt) => {
    if (!confirm(tr.confirmDeletePrompt.replace("{number}", r.receiptNumber))) return;
    try {
      await deleteReceipt(r.id);
      showSuccess(tr.deleteSuccess);
      void fetchReceipts(currentPage, search, typeFilter);
    } catch {
      showError(tr.deleteError);
    }
  };

  const handlePdf = async (r: Receipt) => {
    try {
      const blob = await downloadReceiptPDF(r.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError(tr.downloadError);
    }
  };

  const typeBadge = (type: string) => {
    if (type === "advance") return <Badge color="warning" variant="light">{tr.advance}</Badge>;
    if (type === "refund") return <Badge color="error" variant="light">{tr.refund}</Badge>;
    return <Badge color="primary" variant="light">{tr.final}</Badge>;
  };

  const formatMethod = (method: unknown) => {
    if (method === "cash") return tr.cash;
    if (method === "card") return tr.card;
    if (method === "bank") return tr.bank;
    return typeof method === "string" && method ? method : "—";
  };

  const columns: Column<Receipt>[] = [
    { key: "receiptNumber", header: tr.numberShort, render: (v) => <span className="font-mono text-sm">{v as string}</span> },
    { key: "travelerName", header: tr.traveler, render: (v) => <span className="font-medium text-gray-900 dark:text-white">{(v as string) || "—"}</span> },
    { key: "receiptType", header: tr.receiptType, render: (v) => typeBadge(v as string) },
    { key: "amount", header: tr.amount, render: (_v, r) => <span>{formatCurrency(r.amount, "BAM", locale)}</span> },
    { key: "paymentMethod", header: tr.methodShort, render: (v) => <span className="text-gray-600 dark:text-gray-300">{formatMethod(v)}</span> },
    { key: "issuedAt", header: tr.issuedShort, render: (v) => formatDate(v as string, locale) },
    {
      key: "actions", header: tr.actions,
      render: (_, r) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" title={tr.downloadPdfLabel} aria-label={`${tr.downloadPdfLabel} ${r.receiptNumber}`} onClick={() => void handlePdf(r)} className="p-2"><DownloadIcon className="w-4 h-4" /></Button>
          {r.receiptType !== "refund" && (
            <Button size="sm" variant="outline" title={tr.refundLabel} aria-label={`${tr.refundLabel} ${r.receiptNumber}`} onClick={() => void handleRefund(r)} className="p-2 text-amber-600"><ArrowRightIcon className="w-4 h-4" /></Button>
          )}
          <Button size="sm" variant="outline" title={tr.deleteLabel} aria-label={`${tr.deleteLabel} ${r.receiptNumber}`} onClick={() => void handleDelete(r)} className="p-2 text-red-600"><TrashBinIcon className="w-4 h-4" /></Button>
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
        description={`${tr.description} · PU-YYYY-XXXX`}
        searchPlaceholder={tr.search}
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            key: "type",
            label: tr.allTypes,
            value: typeFilter,
            onChange: (v) => handleTypeChange(v as "" | "advance" | "final" | "refund"),
            options: [
              { value: "advance", label: tr.advance },
              { value: "final", label: tr.finalLong },
              { value: "refund", label: tr.refund },
            ],
          },
        ]}
        actions={<Button variant="primary" onClick={() => { setFormError(null); setIsModalOpen(true); }} className="flex items-center gap-2"><PlusIcon className="w-4 h-4" /> {tr.add}</Button>}
      />

      {loading ? (
        <div className="flex items-center justify-center p-20"><div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
          <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{tr.loadError}</p>
          <Button type="button" variant="outline" onClick={() => void fetchReceipts(currentPage, search, typeFilter)}>{tr.retry}</Button>
        </div>
      ) : receipts.length === 0 ? (
        <EmptyState title={search ? tr.noMatching : tr.noReceipts} description={search ? tr.tryDifferentSearch : tr.emptyDesc}
          action={!search ? { label: tr.add, onClick: () => { setFormError(null); setIsModalOpen(true); } } : undefined}
        />
      ) : (
        <>
          <DataTable data={receipts} columns={columns} />
          {totalPages > 1 && <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} itemsPerPage={ITEMS_PER_PAGE} onPageChange={handlePageChange} />}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={tr.modalTitle} className="max-w-md">
        <div className="space-y-4 p-2">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {resolveFormError(formError)}
            </div>
          )}
          {reservationsError && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{tr.reservationsLoadError}</p>
          )}
          <div>
            <label htmlFor="receipt-reservation" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.reservation}</label>
            <select id="receipt-reservation" value={selectedReservation} onChange={(e) => { setSelectedReservation(e.target.value); setFormError(null); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <option value="">{tr.selectPlaceholder}</option>
              {reservations.map((r) => (<option key={r.id} value={r.id}>{r.customerName} — {r.packageName || tr.packageFallback}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="receipt-type" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.receiptType}</label>
              <select id="receipt-type" value={receiptType} onChange={(e) => setReceiptType(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                <option value="advance">{tr.advance}</option>
                <option value="final">{tr.finalLong}</option>
              </select>
            </div>
            <div>
              <label htmlFor="receipt-method" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.methodShort}</label>
              <select id="receipt-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                <option value="cash">{tr.cash}</option>
                <option value="card">{tr.card}</option>
                <option value="bank">{tr.bank}</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="receipt-amount" className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{tr.amountBamLabel}</label>
            <input id="receipt-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setFormError(null); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={creating}>{tr.cancel}</Button>
            <Button variant="primary" onClick={() => void handleCreate()} disabled={creating}>{creating ? tr.issuing : tr.issueAction}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
