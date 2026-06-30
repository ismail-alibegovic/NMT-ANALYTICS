import { useState, useEffect } from "react";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import ImportModal from "../components/import/ImportModal";
import PaymentsModal from "../components/payments/PaymentsModal";
import PageToolbar from "../components/ui/PageToolbar";
import { DataTable, Column, Pagination } from "../components/ui/DataTable";
import { FileIcon, CloseIcon } from "../icons";
import { useToast } from "../context/ToastContext";
import { useQueryParams } from "../hooks/useQueryParams";
import { useDataInvalidation } from "../hooks/useDataInvalidation";
import { useApp } from "../context/AppContext";
import EmptyState from "../components/ui/EmptyState";
import { FormModal } from "../components/ui/FormModal";
import CreateReservationModal from "../components/reservations/CreateReservationModal";
import EditReservationModal from "../components/reservations/EditReservationModal";
import { formatCurrency, normalizeMoney } from "../utils/business";
import {
  getReservations,
  downloadVoucher,
  downloadInvoice,
  batchUpdateStatus,
  createReservation,
  updateReservation,
  deleteReservation,
  Reservation,
  ReservationListResponse,
  ReservationFilters
} from "../api/reservations";
import { getCustomers, Customer } from "../api/customers";
import { getPackages, Package } from "../api/packages";
import { getDepartures, Departure } from "../api/departures";
import { hasAccess } from "../types/roles";

const ITEMS_PER_PAGE = 10;

export default function Reservations() {
  const { error: showError, success: showSuccess } = useToast();
  const { user, userContext, loading: authLoading } = useApp();
  const role = userContext?.role ?? 'agent';
  const isAgent = !hasAccess('manager', role);
  const { getParam, setParams } = useQueryParams();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>(getParam('status', ''));
  const [dateFrom, setDateFrom] = useState<string>(getParam('from', ''));
  const [dateTo, setDateTo] = useState<string>(getParam('to', ''));
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [assignedOnly, setAssignedOnly] = useState<boolean>(getParam('my', '') === 'true');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchReservations = async (page = 1, status = '', from = '', to = '', myOnly = false) => {
    setLoading(true);
    try {
      const filters: ReservationFilters = {
        page,
        limit: ITEMS_PER_PAGE,
      };
      if (status) filters.status = status;
      if (from) filters.dateFrom = from;
      if (to) filters.dateTo = to;
      if (myOnly) filters.assignedOnly = true;

      const response: ReservationListResponse = await getReservations(filters);
      setReservations(response.data);
      setTotalItems(response.total);
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Failed to fetch reservations:', err);
      showError('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      const page = parseInt(getParam('page', '1'));
      const status = getParam('status', '');
      const from = getParam('from', '');
      const to = getParam('to', '');

      setCurrentPage(page);
      setStatusFilter(status);
      setDateFrom(from);
      setDateTo(to);

      fetchReservations(page, status, from, to, assignedOnly);
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (user && !authLoading) {
      setParams({
        page: currentPage > 1 ? currentPage : null,
        status: statusFilter || null,
        from: dateFrom || null,
        to: dateTo || null,
        my: assignedOnly ? 'true' : null,
      });
    }
  }, [currentPage, statusFilter, dateFrom, dateTo, user, authLoading, setParams]);

  useDataInvalidation('reservations', () => {
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo, assignedOnly);
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchReservations(page, statusFilter, dateFrom, dateTo, assignedOnly);
  };

  const handleDownloadVoucher = async (reservationId: string) => {
    try {
      const blob = await downloadVoucher(reservationId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voucher_${reservationId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download voucher:', err);
      showError('Failed to download voucher');
    }
  };

  const handleDownloadInvoice = async (reservationId: string) => {
    try {
      const blob = await downloadInvoice(reservationId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${reservationId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download invoice:', err);
      showError('Failed to download invoice');
    }
  };

  const handleOpenPaymentModal = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setIsPaymentModalOpen(true);
  };

  const handleEdit = (reservation: Reservation) => {
    setEditingReservation(reservation);
    setIsEditOpen(true);
  };

  const handleDelete = async (reservation: Reservation) => {
    if (!confirm(`Jeste li sigurni da želite obrisati rezervaciju za ${reservation.customerName}?`))
      return;
    try {
      await deleteReservation(reservation.id);
      showSuccess("Rezervacija obrisana");
      fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
    } catch (err: any) {
      showError(err?.message || "Greška pri brisanju rezervacije");
    }
  };

  const handleEditSuccess = () => {
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  };

  const handlePaymentCreated = () => {
    fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reservations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reservations.map(r => r.id)));
    }
  };

  const handleBatchStatus = async (status: Reservation['status']) => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const result = await batchUpdateStatus(Array.from(selectedIds), status);
      if (result.summary.failed > 0) {
        showError(`${result.summary.succeeded} updated, ${result.summary.failed} failed`);
      } else {
        showSuccess(`${result.summary.succeeded} reservations updated to ${status}`);
      }
      setSelectedIds(new Set());
      fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
    } catch (err) {
      showError('Batch update failed');
    } finally {
      setBatchLoading(false);
    }
  };

  const columns: Column<Reservation>[] = [
    {
      key: '_select',
      header: (
        <input
          type="checkbox"
          checked={reservations.length > 0 && selectedIds.size === reservations.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
        />
      ),
      render: (_, item) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
        />
      ),
      className: "w-12",
    },
    {
      key: 'customerName',
      header: 'Klijent',
      render: (_, res) => (
        <div>
          <div className="font-medium truncate" title={res.customerName}>
            {res.customerName}
          </div>
          <div className="text-xs text-gray-500 truncate" title={`ID: ${res.id}`}>
            #{res.id.substring(0, 8)}
          </div>
        </div>
      )
    },
    {
      key: 'packageName',
      header: 'Paket',
      render: (val) => (
        <div className="truncate" title={val || '-'}>
          {val || '-'}
        </div>
      )
    },
    {
      key: 'totalAmount',
      header: 'Ukupno',
      render: (val) => (
        <div className="text-right whitespace-nowrap">
          {formatCurrency(normalizeMoney(val))}
        </div>
      )
    },
    {
      key: 'paidAmount',
      header: 'Plaćeno',
      render: (val) => (
        <div className="text-right text-success-600 dark:text-success-500 font-medium whitespace-nowrap">
          {formatCurrency(normalizeMoney(val))}
        </div>
      )
    },
    {
      key: 'balanceDue',
      header: 'Saldo',
      render: (val) => {
        // Use backend-calculated balanceDue (can be negative for overpayment)
        const balance = normalizeMoney(val);
        const isOverpaid = balance < 0;
        const isPaid = balance === 0;

        return (
          <div
            className={`text-right font-medium whitespace-nowrap ${isPaid
                ? "text-success-600 dark:text-success-500"
                : isOverpaid
                  ? "text-info-600 dark:text-info-500"
                  : "text-error-600 dark:text-error-500"
              }`}
            title={isOverpaid ? "Preplaćeno (kredit)" : ""}
          >
            {formatCurrency(Math.abs(balance))}
            {isOverpaid && <span className="text-xs ml-1">(kredit)</span>}
          </div>
        );
      }
    },
    {
      key: 'paymentStatus',
      header: 'Status plaćanja',
      render: (val) => {
        // Use backend-calculated payment_status
        const status = val || 'unpaid';

        const statusConfig: Record<string, { color: any; text: string }> = {
          'unpaid': { color: 'error', text: 'Neplaćeno' },
          'partially_paid': { color: 'warning', text: 'Djelimično' },
          'paid': { color: 'success', text: 'Plaćeno' },
          'refunded': { color: 'info', text: 'Refundirano' },
        };

        const config = statusConfig[status] || statusConfig['unpaid'];

        return (
          <div className="flex justify-center">
            <Badge size="sm" color={config.color} variant="light">
              {config.text}
            </Badge>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status rezervacije',
      render: (val) => {
        // Reservation status (pending, confirmed, cancelled, completed)
        const statusConfig: Record<string, { color: any; text: string }> = {
          'pending': { color: 'warning', text: 'Na čekanju' },
          'confirmed': { color: 'success', text: 'Potvrđeno' },
          'cancelled': { color: 'error', text: 'Otkazano' },
          'completed': { color: 'info', text: 'Završeno' },
        };

        const config = statusConfig[val] || { color: 'light', text: val };

        return (
          <div className="flex justify-center">
            <Badge size="sm" color={config.color} variant="light">
              {config.text}
            </Badge>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: 'Akcije',
      render: (_, res) => (
        <div className="flex flex-wrap gap-1 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 whitespace-nowrap"
            onClick={() => handleEdit(res)}
          >
            Uredi
          </Button>
          {!isAgent && (
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white text-xs px-2 py-1 whitespace-nowrap"
            onClick={() => handleOpenPaymentModal(res)}
          >
            Plaćanja
          </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 whitespace-nowrap"
            onClick={() => handleDownloadVoucher(res.id)}
          >
            PDF
          </Button>
          {!isAgent && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs px-2 py-1 whitespace-nowrap"
              onClick={() => handleDownloadInvoice(res.id)}
            >
              Faktura
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 whitespace-nowrap text-red-600 hover:text-red-700"
            onClick={() => handleDelete(res)}
          >
            Obriši
          </Button>
        </div>
      )
    }
  ];

  const statusOptions = [
    { value: "pending", label: "Na čekanju" },
    { value: "confirmed", label: "Potvrđeno" },
    { value: "completed", label: "Završeno" },
    { value: "cancelled", label: "Otkazano" },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title="Auth Required" description="Please sign in" /></div>;

  return (
    <>
      <PageMeta title="Reservations | NMT Analytics" description="Manage reservations and payments" />

      <PageToolbar
        title="Rezervacije"
        description="Upravljanje rezervacijama i plaćanjima"
        searchValue=""
        onSearchChange={() => { }}
        searchPlaceholder="Traži rezervacije..."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2"
            >
              + Nova rezervacija
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2"
            >
              <FileIcon className="w-4 h-4" />
              Import CSV
            </Button>
          </div>
        }
      />

      {/* Date Filters Row */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="w-full sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
          >
            <option value="">Svi statusi</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {isAgent && (
          <Button
            size="sm"
            variant={assignedOnly ? 'primary' : 'outline'}
            onClick={() => {
              const next = !assignedOnly;
              setAssignedOnly(next);
              setCurrentPage(1);
              fetchReservations(1, statusFilter, dateFrom, dateTo, next);
            }}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            {assignedOnly ? 'Svi klijenti' : 'Moji klijenti'}
          </Button>
        )}
        {(statusFilter || dateFrom || dateTo || assignedOnly) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStatusFilter("");
              setDateFrom("");
              setDateTo("");
              setAssignedOnly(false);
              setCurrentPage(1);
            }}
          >
            Očisti filtere
          </Button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-brand-50 dark:bg-brand-500/10 rounded-lg border border-brand-200 dark:border-brand-500/20">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchStatus("pending")}
              disabled={batchLoading}
            >
              Na čekanju
            </Button>
            <Button
              size="sm"
              className="bg-success-500 hover:bg-success-600 text-white"
              onClick={() => handleBatchStatus("confirmed")}
              disabled={batchLoading}
            >
              Potvrdi
            </Button>
            <Button
              size="sm"
              className="bg-error-500 hover:bg-error-600 text-white"
              onClick={() => handleBatchStatus("cancelled")}
              disabled={batchLoading}
            >
              Otkaži
            </Button>
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => handleBatchStatus("completed")}
              disabled={batchLoading}
            >
              Završi
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={batchLoading}
            >
              <CloseIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : reservations.length === 0 ? (
        <EmptyState
          title="Nema rezervacija"
          description="Nije pronađena nijedna rezervacija za odabrane filtere."
          action={(statusFilter || dateFrom || dateTo) ? { label: "Očisti filtere", onClick: () => { setStatusFilter(""); setDateFrom(""); setDateTo(""); } } : undefined}
        />
      ) : (
        <>
          <DataTable data={reservations} columns={columns} />
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

      <ImportModal
        entity="reservations"
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setIsImportOpen(false);
          fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
        }}
      />

      {selectedReservation && (
        <PaymentsModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedReservation(null);
          }}
          reservationId={selectedReservation.id}
          reservationTotal={selectedReservation.totalAmount}
          reservationPaid={selectedReservation.paidAmount}
          reservationCurrency={selectedReservation.currency}
          onPaymentCreated={handlePaymentCreated}
        />
      )}

      {editingReservation && (
        <EditReservationModal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setEditingReservation(null);
          }}
          reservation={editingReservation}
          onSuccess={handleEditSuccess}
        />
      )}

      <CreateReservationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          fetchReservations(currentPage, statusFilter, dateFrom, dateTo);
        }}
      />
    </>
  );
}
