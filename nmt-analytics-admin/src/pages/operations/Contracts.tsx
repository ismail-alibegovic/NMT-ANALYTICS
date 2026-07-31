import { useState, useEffect } from "react";
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

export default function Contracts() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.contracts;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "signed" | "cancelled">("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchContracts = async (page = 1, q = "", status = "") => {
    setLoading(true);
    try {
      const response: ContractListResponse = await getContracts({ page, limit: ITEMS_PER_PAGE, search: q, status: (status as "draft" | "signed" | "cancelled") || undefined });
      setContracts(response.data || []);
      setTotalItems(response.total || 0);
      setCurrentPage(page);
    } catch (err: any) {
      console.error("Failed to fetch contracts:", err);
      showError(err.message || "Failed to load contracts");
      setContracts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchContracts(1, search);
    else if (!authLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (!isModalOpen) return;
    getReservations({ limit: 50 }).then(r => setReservations(r.data || [])).catch(() => setReservations([]));
  }, [isModalOpen]);

  const handleSearch = (v: string) => { setSearch(v); fetchContracts(1, v, statusFilter); };
  const handleStatusChange = (s: "" | "draft" | "signed" | "cancelled") => { setStatusFilter(s); fetchContracts(1, search, s); };
  const handlePageChange = (p: number) => { setCurrentPage(p); fetchContracts(p, search, statusFilter); };

  const handleCreate = async () => {
    if (!selectedReservation) { showError("Select a reservation first"); return; }
    setCreating(true);
    try {
      await createContract({ reservationId: selectedReservation });
      showSuccess("Contract generated");
      setIsModalOpen(false);
      setSelectedReservation("");
      fetchContracts(currentPage, search, statusFilter);
    } catch (err: any) {
      showError(err.message || "Failed to create contract");
    } finally { setCreating(false); }
  };

  const handleSign = async (c: Contract) => {
    if (!confirm(`Sign contract ${c.contractNumber}?`)) return;
    try { await signContract(c.id, { status: "signed", signedAt: new Date().toISOString() }); showSuccess("Contract signed"); fetchContracts(currentPage, search, statusFilter); }
    catch (err: any) { showError(err.message || "Failed to sign contract"); }
  };

  const handleDelete = async (c: Contract) => {
    if (!confirm(`Delete contract ${c.contractNumber}?`)) return;
    try { await deleteContract(c.id); showSuccess("Contract deleted"); fetchContracts(currentPage, search, statusFilter); }
    catch (err: any) { showError(err.message || "Failed to delete contract"); }
  };

  const handlePdf = async (c: Contract) => {
    try {
      const blob = await downloadContractPDF(c.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${c.contractNumber}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) { showError(err.message || "Failed to download PDF"); }
  };

  const statusBadge = (status: string) => {
    if (status === "signed") return <Badge color="success" variant="light">Signed</Badge>;
    if (status === "cancelled") return <Badge color="error" variant="light">Cancelled</Badge>;
    return <Badge color="warning" variant="light">Draft</Badge>;
  };

  const columns: Column<Contract>[] = [
    { key: "contractNumber", header: "No.", render: (v) => <span className="font-mono text-sm">{v as string}</span> },
    { key: "travelerName", header: "Traveler", render: (v) => <span className="font-medium text-gray-900 dark:text-white">{v as string}</span> },
    { key: "packageDescription", header: "Package", render: (v) => <span className="text-gray-600 dark:text-gray-300">{(v as string) || "—"}</span> },
    { key: "totalAmount", header: "Amount", render: (_v, c) => <span>{formatCurrency(c.totalAmount)}</span> },
    { key: "contractDate", header: "Date", render: (v) => formatDate(v as string) },
    { key: "status", header: "Status", render: (v) => statusBadge(v as string) },
    {
      key: "actions", header: "Actions",
      render: (_, c) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => handlePdf(c)} className="p-2">
            <DownloadIcon className="w-4 h-4" />
          </Button>
          {c.status === "draft" && (
            <Button size="sm" variant="outline" onClick={() => handleSign(c)} className="p-2 text-green-600">
              <CheckLineIcon className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleDelete(c)} className="p-2 text-red-600">
            <TrashBinIcon className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title="Please sign in" description="Sign in to view contracts" /></div>;

  return (
    <>
      <PageMeta title={`${t.operations.contracts.title} | Travline`} description={t.operations.contracts.description} />
      <PageToolbar
        title={t.operations.contracts.title}
        description={`${t.operations.contracts.description} · UG-YYYY-XXXX`}
        searchPlaceholder={t.operations.contracts.search}
        searchValue={search}
        onSearchChange={handleSearch}
        filters={[
          {
            key: "status",
            label: "All statuses",
            value: statusFilter,
            onChange: (v) => handleStatusChange(v as "" | "draft" | "signed" | "cancelled"),
            options: [
              { value: "draft", label: "Draft" },
              { value: "signed", label: "Signed" },
              { value: "cancelled", label: "Cancelled" },
            ],
          },
        ]}
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> {tr.add}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState title={search ? "No matching contracts" : "No contracts yet"}
         
          description={search ? "Try a different search term" : "Generate your first contract from a reservation"}
          action={!search ? { label: tr.add, onClick: () => setIsModalOpen(true) } : undefined}
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
        <div className="space-y-4 p-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a reservation. A contract will be auto-generated with the traveler's details, package, and pricing.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Reservation</label>
            <select
              value={selectedReservation}
              onChange={(e) => setSelectedReservation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">— Select —</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.customerName} — {r.packageName || "Package"} ({formatDate(r.bookingDate)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating || !selectedReservation}>
              {creating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
