import { useState, useEffect } from "react";
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

export default function Receipts() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.receipts;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "advance" | "final" | "refund">("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedReservation, setSelectedReservation] = useState("");
  const [receiptType, setReceiptType] = useState<"advance" | "final" | "refund">("final");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank">("cash");
  const [creating, setCreating] = useState(false);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchReceipts = async (page = 1, q = "", type = "") => {
    setLoading(true);
    try {
      const r: ReceiptListResponse = await getReceipts({ page, limit: ITEMS_PER_PAGE, search: q, type: (type as "advance" | "final" | "refund") || undefined });
      setReceipts(r.data || []); setTotalItems(r.total || 0); setCurrentPage(page);
    } catch (err: any) { showError(err.message || "Failed to load receipts"); setReceipts([]); setTotalItems(0); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (user && !authLoading) fetchReceipts(1, search, typeFilter);
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (!isModalOpen) return;
    getReservations({ limit: 50 }).then(r => setReservations(r.data || [])).catch(() => setReservations([]));
  }, [isModalOpen]);

  const handleSearch = (v: string) => { setSearch(v); fetchReceipts(1, v, typeFilter); };
  const handleTypeChange = (t: "" | "advance" | "final" | "refund") => { setTypeFilter(t); fetchReceipts(1, search, t); };
  const handlePageChange = (p: number) => { fetchReceipts(p, search, typeFilter); };

  const handleCreate = async () => {
    if (!selectedReservation) { showError("Select a reservation first"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { showError("Enter a valid amount"); return; }
    setCreating(true);
    try {
      await createReceipt({ reservationId: selectedReservation, receiptType, amount: amt, paymentMethod });
      showSuccess("Receipt issued");
      setIsModalOpen(false); setSelectedReservation(""); setAmount("");
      fetchReceipts(currentPage, search, typeFilter);
    } catch (err: any) { showError(err.message || "Failed to issue receipt"); }
    finally { setCreating(false); }
  };

  const handleRefund = async (r: Receipt) => {
    if (!confirm(`Issue refund for ${r.receiptNumber}?`)) return;
    try { await refundReceipt(r.id, { amount: r.amount, paymentMethod: r.paymentMethod || "bank" }); showSuccess("Refund issued"); fetchReceipts(currentPage, search, typeFilter); }
    catch (err: any) { showError(err.message || "Failed to issue refund"); }
  };

  const handleDelete = async (r: Receipt) => {
    if (!confirm(`Delete receipt ${r.receiptNumber}?`)) return;
    try { await deleteReceipt(r.id); showSuccess("Receipt deleted"); fetchReceipts(currentPage, search, typeFilter); }
    catch (err: any) { showError(err.message || "Failed to delete receipt"); }
  };

  const handlePdf = async (r: Receipt) => {
    try {
      const blob = await downloadReceiptPDF(r.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${r.receiptNumber}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) { showError(err.message || "Failed to download PDF"); }
  };

  const typeBadge = (t: string) => {
    if (t === "advance") return <Badge color="warning" variant="light">Advance</Badge>;
    if (t === "refund") return <Badge color="error" variant="light">Refund</Badge>;
    return <Badge color="primary" variant="light">Fiscal</Badge>;
  };

  const columns: Column<Receipt>[] = [
    { key: "receiptNumber", header: "No.", render: (v) => <span className="font-mono text-sm">{v as string}</span> },
    { key: "travelerName", header: "Client", render: (v) => <span className="font-medium text-gray-900 dark:text-white">{(v as string) || "—"}</span> },
    { key: "receiptType", header: "Type", render: (v) => typeBadge(v as string) },
    { key: "amount", header: "Amount", render: (_v, r) => <span>{formatCurrency(r.amount)}</span> },
    { key: "paymentMethod", header: "Method", render: (v) => <span className="text-gray-600 capitalize dark:text-gray-300">{(v as string) || "—"}</span> },
    { key: "issuedAt", header: "Issued", render: (v) => formatDate(v as string) },
    {
      key: "actions", header: "Actions",
      render: (_, r) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => handlePdf(r)} className="p-2"><DownloadIcon className="w-4 h-4" /></Button>
          {r.receiptType !== "refund" && (
            <Button size="sm" variant="outline" onClick={() => handleRefund(r)} className="p-2 text-amber-600"><ArrowRightIcon className="w-4 h-4" /></Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleDelete(r)} className="p-2 text-red-600"><TrashBinIcon className="w-4 h-4" /></Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title="Please sign in" description="Sign in to manage receipts" /></div>;

  return (
    <>
      <PageMeta title={`${t.operations.receipts.title} | Travline`} description={t.operations.receipts.description} />
      <PageToolbar
        title={t.operations.receipts.title}
        description={`${t.operations.receipts.description} · FR-YYYY-XXXX`}
        searchPlaceholder={t.operations.receipts.search}
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            key: "type",
            label: "All types",
            value: typeFilter,
            onChange: (v) => handleTypeChange(v as "" | "advance" | "final" | "refund"),
            options: [
              { value: "advance", label: "Advance" },
              { value: "final", label: "Fiscal (Final)" },
              { value: "refund", label: "Refund" },
            ],
          },
        ]}
        actions={<Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2"><PlusIcon className="w-4 h-4" /> {tr.add}</Button>}
      />

      {loading ? (
        <div className="flex items-center justify-center p-20"><div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : receipts.length === 0 ? (
        <EmptyState title={search ? "No matching receipts" : "No receipts yet"} description={search ? "Try a different search term" : "Issue your first receipt for a reservation"}
          action={!search ? { label: tr.add, onClick: () => setIsModalOpen(true) } : undefined}
        />
      ) : (
        <>
          <DataTable data={receipts} columns={columns} />
          {totalPages > 1 && <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} itemsPerPage={ITEMS_PER_PAGE} onPageChange={handlePageChange} />}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
        <div className="space-y-4 p-2">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Reservation</label>
            <select value={selectedReservation} onChange={(e) => setSelectedReservation(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
              <option value="">— Select —</option>
              {reservations.map((r) => (<option key={r.id} value={r.id}>{r.customerName} — {r.packageName || "Package"}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Type</label>
              <select value={receiptType} onChange={(e) => setReceiptType(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option value="advance">Advance</option>
                <option value="final">Fiscal (Final)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Amount (BAM)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating || !selectedReservation}>{creating ? "Issuing..." : "Issue"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
