import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../components/common/PageMeta";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import PaymentsModal from "../components/payments/PaymentsModal";
import PageToolbar from "../components/ui/PageToolbar";
import { DataTable, Column, Pagination } from "../components/ui/DataTable";
import { CloseIcon } from "../icons";
import { useToast } from "../context/ToastContext";
import { useQueryParams } from "../hooks/useQueryParams";
import { useDataInvalidation } from "../hooks/useDataInvalidation";
import { useApp } from "../context/AppContext";
import { useT } from "../lib/i18n/context";
import EmptyState from "../components/ui/EmptyState";
import NewSaleWizard from "../components/reservations/NewSaleWizard";
import EditReservationModal from "../components/reservations/EditReservationModal";
import { formatCurrency, normalizeMoney, PAYMENT_STATUS_COLORS } from "../utils/business";
import {
  getReservations,
  downloadVoucher,
  downloadInvoice,
  batchUpdateStatus,
  updateReservationStatus,
  deleteReservation,
  Reservation,
  ReservationListResponse,
  ReservationFilters
} from "../api/reservations";
import { hasAccess } from "../types/roles";
import { getDeparture, type Departure } from "../api/departures";

const ITEMS_PER_PAGE = 10;

export default function Reservations() {
  const { error: showError, success: showSuccess } = useToast();
  const { t, lang } = useT();
  const w = t.reservationList;
  const copyRef = useRef(w);
  useEffect(() => { copyRef.current = w; }, [w]);
  const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
  const money = (amount: number, currency: string) => formatCurrency(amount, currency, lang === 'bs' ? 'bs-BA' : 'en-GB');
  const statusLabel = (status: string) => ({ pending: w.pending, confirmed: w.confirmed, cancelled: w.cancelled, completed: w.completed } as Record<string, string>)[status] || status;
  const navigate = useNavigate();
  const { user, userContext, loading: authLoading } = useApp();
  const role = userContext?.role ?? 'agent';
  const isAgent = !hasAccess('manager', role);
  const { getParam, setParams } = useQueryParams();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const currentPage = Math.max(1, parseInt(getParam('page', '1'), 10) || 1);
  const setCurrentPage = (page: number) => setParams({ page: page > 1 ? page : null });
  const statusFilter = getParam('status', '');
  const setStatusFilter = (status: string) => setParams({ status: status || null, page: null });
  const dateFrom = getParam('from', '');
  const setDateFrom = (from: string) => setParams({ from: from || null, page: null });
  const dateTo = getParam('to', '');
  const setDateTo = (to: string) => setParams({ to: to || null, page: null });
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const assignedOnly = getParam('my', '') === 'true';
  const setAssignedOnly = (assigned: boolean) => setParams({ my: assigned ? 'true' : null, page: null });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const departureFilter = getParam('departureId', '');
  const [contextDeparture, setContextDeparture] = useState<Departure | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const authReady = Boolean(user) && !authLoading;
  const orgId = userContext?.org?.id || '';
  const queryKey = JSON.stringify([user?.id, orgId, currentPage, statusFilter, dateFrom, dateTo, assignedOnly, searchQuery, departureFilter]);
  const requestSerial = useRef(0);
  const mounted = useRef(true);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const loadFailed = failedQuery === queryKey;
  const pending = !authReady || loading || (!loadFailed && loadedQuery !== queryKey);
  const fetchReservations = useCallback(async () => {
    if (!authReady || !mounted.current) return;
    const request = ++requestSerial.current;
    setLoading(true);
    setFailedQuery(null);
    setSelectedIds(new Set());
    const filters: ReservationFilters = { page: currentPage, limit: ITEMS_PER_PAGE };
    if (statusFilter) filters.status = statusFilter;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (assignedOnly) filters.assignedOnly = true;
    if (searchQuery) filters.search = searchQuery;
    if (departureFilter) filters.departureId = departureFilter;
    try {
      const response: ReservationListResponse = await getReservations(filters);
      if (request !== requestSerial.current) return;
      setReservations(response.data);
      setTotalItems(response.total);
      setLoadedQuery(queryKey);
    } catch {
      if (request !== requestSerial.current) return;
      setFailedQuery(queryKey);
    } finally {
      if (request === requestSerial.current) setLoading(false);
    }
  }, [authReady, queryKey, currentPage, statusFilter, dateFrom, dateTo, assignedOnly, searchQuery, departureFilter]);

  const latestFetch = useRef(fetchReservations);
  useEffect(() => { latestFetch.current = fetchReservations; }, [fetchReservations]);
  const refreshCurrent = () => latestFetch.current();

  const invalidateRequests = useCallback(() => {
    mounted.current = false;
    requestSerial.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (authReady) void fetchReservations();
    else setLoading(false);
    return invalidateRequests;
  }, [authReady, fetchReservations, invalidateRequests]);

  const createRequested = getParam('new', '') === '1';
  useEffect(() => {
    if (!authReady || !createRequested) return;
    setIsCreateOpen(true);
    setParams({ new: null });
  }, [authReady, createRequested, setParams]);

  useEffect(() => {
    let active = true;
    setContextDeparture(null);
    if (!departureFilter || !authReady) return;
    getDeparture(departureFilter).then(departure => {
      if (active) setContextDeparture(departure);
    }).catch(() => {
      if (active) showError(copyRef.current.errorDeparture);
    });
    return () => { active = false; };
  }, [departureFilter, orgId, authReady, showError]);

  useDataInvalidation('reservations', () => { void fetchReservations(); });

  const clearFilters = () => {
    setSearchQuery('');
    setParams({ page: null, status: null, from: null, to: null, my: null });
  };
  const handlePageChange = (page: number) => setCurrentPage(page);

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
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if (status === 403) {
        showError(w.voucherForbidden);
      } else if (status === 404) {
        showError(w.voucherMissing);
      } else {
        showError(w.errorVoucher);
      }
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
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if (status === 403) {
        showError(w.invoiceForbidden);
      } else if (status === 404) {
        showError(w.invoiceMissing);
      } else {
        showError(w.errorInvoice);
      }
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
    if (!confirm(fill(w.deletePrompt, { name: reservation.customerName })))
      return;
    try {
      await deleteReservation(reservation.id);
      showSuccess(w.deleted);
      refreshCurrent();
    } catch {
      showError(w.errorDelete);
    }
  };

  const handleEditSuccess = () => {
    refreshCurrent();
  };

  const handlePaymentCreated = () => {
    refreshCurrent();
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
    if (selectedIds.size === 0 || pending || loadFailed) return;
    setBatchLoading(true);
    try {
      const result = await batchUpdateStatus(Array.from(selectedIds), status);
      if (result.summary.failed > 0) {
        showError(fill(w.batchFailure, { succeeded: result.summary.succeeded, failed: result.summary.failed }));
      } else {
        showSuccess(fill(w.batchSuccess, { count: result.summary.succeeded, status: statusLabel(status) }));
      }
      setSelectedIds(new Set());
      refreshCurrent();
    } catch {
      showError(w.errorBatch);
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
          aria-label={w.selectAll}
          checked={reservations.length > 0 && selectedIds.size === reservations.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
        />
      ),
      render: (_, item) => (
        <input
          type="checkbox"
          aria-label={fill(w.selectRow, { name: item.customerName })}
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
        />
      ),
      className: "w-12",
    },
    {
      key: 'customerName',
      header: w.client,
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
      header: w.package,
      render: (val) => (
        <div className="truncate" title={val || '-'}>
          {val || '-'}
        </div>
      )
    },
    {
      key: 'totalAmount',
      header: w.total,
      render: (val, res) => (
        <div className="text-right whitespace-nowrap">
          {money(normalizeMoney(val), res.currency)}
        </div>
      )
    },
    {
      key: 'paidAmount',
      header: w.paid,
      render: (val, res) => (
        <div className="text-right text-success-600 dark:text-success-500 font-medium whitespace-nowrap">
          {money(normalizeMoney(val), res.currency)}
        </div>
      )
    },
    {
      key: 'balanceDue',
      header: w.balance,
      render: (val, res) => {
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
            title={isOverpaid ? w.creditTitle : ""}
          >
            {money(Math.abs(balance), res.currency)}
            {isOverpaid && <span className="text-xs ml-1">{w.credit}</span>}
          </div>
        );
      }
    },
    {
      key: 'paymentStatus',
      header: t.reservations.paymentStatus,
      render: (val) => {
        const status = (val as string) || 'unpaid';
        const statusMap: Record<string, string> = {
          partially_paid: 'partiallyPaid',
        };
        const key = statusMap[status] || status;
        const color = PAYMENT_STATUS_COLORS[key] || 'error';

        return (
          <div className="flex justify-center">
            <Badge size="sm" color={color as any} variant="light">
              {t.reservations[key] || t.reservations.unpaid}
            </Badge>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: w.status,
      render: (val, res) => {
        const statusConfig: Record<string, { color: any; text: string }> = {
          'pending': { color: 'warning', text: w.pending },
          'confirmed': { color: 'success', text: w.confirmed },
          'cancelled': { color: 'error', text: w.cancelled },
          'completed': { color: 'info', text: w.completed },
        };
        const config = statusConfig[val] || { color: 'light', text: val };
        return (
          <div className="flex flex-col items-center gap-1">
            <Badge size="sm" color={config.color} variant="light">
              {config.text}
            </Badge>
            {res.status !== 'completed' && res.status !== 'cancelled' && (
              <div className="flex gap-1">
                {res.status !== 'confirmed' && (
                  <button
                    onClick={async () => {
                      try {
                        await updateReservationStatus(res.id, 'confirmed');
                        showSuccess(w.confirmedNotice);
                        refreshCurrent();
                      } catch {
                        showError(w.errorStatus);
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-300 whitespace-nowrap"
                    title={w.confirm}
                  >
                    {w.confirmAction}
                  </button>
                )}
                {(res.status as string) !== 'cancelled' && (
                  <button
                    onClick={async () => {
                      if (!confirm(fill(w.cancelPrompt, { name: res.customerName }))) return;
                      try {
                        await updateReservationStatus(res.id, 'cancelled');
                        showSuccess(w.cancelledNotice);
                        refreshCurrent();
                      } catch {
                        showError(w.errorStatus);
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-error-50 text-error-700 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-300 whitespace-nowrap"
                    title={w.cancel}
                  >
                    {w.cancelAction}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: w.actions,
      render: (_, res) => (
        <div className="flex flex-wrap gap-1 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 whitespace-nowrap"
            onClick={() => handleEdit(res)}
          >
            {w.edit}
          </Button>
          {!isAgent && (
          <Button
            size="sm"
            className="bg-brand-500 hover:bg-brand-600 text-white text-xs px-2 py-1 whitespace-nowrap"
            onClick={() => handleOpenPaymentModal(res)}
          >
            {w.payments}
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
              {w.invoice}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 whitespace-nowrap text-red-600 hover:text-red-700"
            onClick={() => handleDelete(res)}
          >
            {w.delete}
          </Button>
        </div>
      )
    }
  ];

  const statusOptions = [
    { value: "pending", label: w.pending },
    { value: "confirmed", label: w.confirmed },
    { value: "completed", label: w.completed },
    { value: "cancelled", label: w.cancelled },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title={w.authRequired} description={w.authHint} /></div>;

  return (
    <>
      <PageMeta title={w.metaTitle} description={w.metaDescription} />

      <PageToolbar
        title={contextDeparture ? `${w.title} · ${contextDeparture.packageName}` : w.title}
        description={contextDeparture ? w.contextDescription : w.allDescription}
        searchValue={searchQuery}
        onSearchChange={(val: string) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder={w.search}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => setIsCreateOpen(true)}
              disabled={Boolean(departureFilter && (!contextDeparture || contextDeparture.status !== 'active'))}
              title={contextDeparture && contextDeparture.status !== 'active' ? w.activeOnly : undefined}
              className="flex items-center gap-2"
            >
              {departureFilter && !contextDeparture ? w.loadingDeparture : contextDeparture && contextDeparture.status !== 'active' ? w.inactiveDeparture : w.newReservation}
            </Button>
          </div>
        }
      />

      {departureFilter && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/20 dark:bg-brand-500/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-brand-900 dark:text-brand-100">
              {contextDeparture?.packageName || w.contextTitle}
            </div>
            <div className="mt-0.5 text-xs text-brand-700 dark:text-brand-300">
              {w.contextHint}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="outline" onClick={() => navigate(`/departures/${departureFilter}`)}>
              {w.backToTrip}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/reservations')}>
              {w.allReservations}
            </Button>
          </div>
        </div>
      )}

      {/* Date Filters Row */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="w-full sm:w-48">
          <select
            aria-label={w.status}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
          >
            <option value="">{w.allStatuses}</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
            aria-label={w.from}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
            aria-label={w.to}
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
            }}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            {assignedOnly ? w.allClients : w.myClients}
          </Button>
        )}
        {(statusFilter || dateFrom || dateTo || assignedOnly || searchQuery) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clearFilters();
            }}
          >
            {w.clearFilters}
          </Button>
        )}
      </div>

      {selectedIds.size > 0 && !pending && !loadFailed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-brand-50 dark:bg-brand-500/10 rounded-lg border border-brand-200 dark:border-brand-500/20">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {fill(w.selected, { count: selectedIds.size })}
          </span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchStatus("pending")}
              disabled={batchLoading}
            >
              {w.pending}
            </Button>
            <Button
              size="sm"
              className="bg-success-500 hover:bg-success-600 text-white"
              onClick={() => handleBatchStatus("confirmed")}
              disabled={batchLoading}
            >
              {w.confirm}
            </Button>
            <Button
              size="sm"
              className="bg-error-500 hover:bg-error-600 text-white"
              onClick={() => handleBatchStatus("cancelled")}
              disabled={batchLoading}
            >
              {w.cancel}
            </Button>
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => handleBatchStatus("completed")}
              disabled={batchLoading}
            >
              {w.complete}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={batchLoading}
            >
              <CloseIcon className="w-4 h-4" />
              <span className="sr-only">{w.clearSelection}</span>
            </Button>
          </div>
        </div>
      )}

      {pending ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : loadFailed ? (
        <div role="alert" className="rounded-xl border border-error-200 p-5 dark:border-error-500/30">
          <p className="mb-3 text-sm text-error-600 dark:text-error-400">{w.errorLoad}</p>
          <Button size="sm" variant="outline" onClick={() => { void fetchReservations(); }}>{w.retry}</Button>
        </div>
      ) : reservations.length === 0 ? (
        <EmptyState
          title={w.noReservations}
          description={w.noReservationsHint}
          action={(statusFilter || dateFrom || dateTo || assignedOnly || searchQuery) ? { label: w.clearFilters, onClick: clearFilters } : undefined}
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

      {selectedReservation && (
        <PaymentsModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedReservation(null);
          }}
          reservationId={selectedReservation.id}
          reservationTotal={selectedReservation.totalAmount}
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
          reservationId={editingReservation.id}
          onSuccess={handleEditSuccess}
        />
      )}

      <NewSaleWizard
        isOpen={isCreateOpen}
        initialPackageId={contextDeparture?.package_id}
        initialDepartureId={contextDeparture?.id}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          refreshCurrent();
        }}
      />
    </>
  );
}
