import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { getPayments, Payment, PaymentFilters } from "../../api/payments";

const ITEMS_PER_PAGE = 10;

export default function Payments() {
    const { error: showError } = useToast();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const fetchPayments = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const filters: PaymentFilters = {
                page,
                limit: ITEMS_PER_PAGE,
                from: dateFrom || undefined,
                to: dateTo || undefined,
            };

            const response = await getPayments(filters);
            setPayments(response.data);
            setTotalItems(response.pagination.total);
            setCurrentPage(page);
        } catch (err: any) {
            console.error('Failed to fetch payments:', err);
            showError('Failed to load payments');
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, showError]);

    useEffect(() => {
        fetchPayments(1);
    }, [fetchPayments]);

    const handlePageChange = (page: number) => {
        fetchPayments(page);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('bs-BA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('bs-BA', {
            style: 'currency',
            currency: currency || 'BAM',
        }).format(amount);
    };

    const columns: Column<Payment>[] = [
        {
            key: 'paymentDate',
            header: 'Datum',
            render: (_, payment) => formatDate(payment.paymentDate || payment.createdAt)
        },
        {
            key: 'amount',
            header: 'Iznos',
            render: (val, payment) => (
                <span className="font-bold text-gray-800 dark:text-white/90">
                    {formatCurrency(val as number, payment.currency)}
                </span>
            )
        },
        {
            key: 'reservation',
            header: 'Rezervacija / Putnik',
            render: (_, payment) => (
                <div>
                    <div className="font-medium">{payment.reservation?.customerName || '-'}</div>
                    {payment.reservationId && (
                        <div className="text-gray-500 text-xs text-mono">ID: {payment.reservationId.split('-')[0]}</div>
                    )}
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (val) => (
                <span className={`text-xs px-2 py-1 rounded-full ${val === 'succeeded' ? 'bg-success-100 text-success-700' :
                        val === 'failed' ? 'bg-error-100 text-error-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                    {String(val).toUpperCase()}
                </span>
            )
        },
    ];

    return (
        <>
            <PageMeta title="Payments | NMT Analytics" description="Track all payments" />
            <PageToolbar
                title="Uplate"
                description="Pregled svih uplata po rezervacijama"
                searchValue=""
                onSearchChange={() => { }}
                searchPlaceholder="Traži uplate..."
            />

            {/* Filters */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-white/[0.03] p-4 rounded-xl border border-gray-200 dark:border-white/[0.05]">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Od datuma</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Do datuma</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-20">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : payments.length === 0 ? (
                <EmptyState
                    title="Nema uplata"
                    description="Nije pronađena nijedna uplata za odabrane filtere."
                />
            ) : (
                <>
                    <DataTable data={payments} columns={columns} />
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
        </>
    );
}
