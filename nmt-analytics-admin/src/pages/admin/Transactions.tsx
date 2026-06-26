import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { getTransactions, Transaction, TransactionFilters } from "../../api/transactions";
import Button from "../../components/ui/button/Button";
import ImportModal from "../../components/import/ImportModal";
import { FileIcon } from "../../icons";
import Badge from "../../components/ui/badge/Badge";

const ITEMS_PER_PAGE = 10;

export default function Transactions() {
    const { error: showError } = useToast();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isImportOpen, setIsImportOpen] = useState(false);

    // Filter states
    const [type, setType] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const fetchTransactions = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const filters: TransactionFilters = {
                page,
                limit: ITEMS_PER_PAGE,
                type: type || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            };

            const response = await getTransactions(filters);
            setTransactions(response.data);
            setTotalItems(response.total);
            setCurrentPage(page);
        } catch (err: any) {
            console.error('Failed to fetch transactions:', err);
            showError('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    }, [type, dateFrom, dateTo, showError]);

    useEffect(() => {
        fetchTransactions(1);
    }, [fetchTransactions]);

    const handlePageChange = (page: number) => {
        fetchTransactions(page);
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

    const getTypeBadgeColor = (type: string) => {
        switch (type) {
            case 'payment': return 'success';
            case 'refund': return 'error';
            case 'deposit': return 'info';
            case 'withdrawal': return 'warning';
            default: return 'light';
        }
    };

    const columns: Column<Transaction>[] = [
        {
            key: 'occurred_at',
            header: 'Datum',
            render: (val) => formatDate(val as string)
        },
        {
            key: 'type',
            header: 'Tip',
            render: (val) => (
                <Badge size="sm" color={getTypeBadgeColor(val as string)} variant="light">
                    {String(val).charAt(0).toUpperCase() + String(val).slice(1)}
                </Badge>
            )
        },
        {
            key: 'amount',
            header: 'Iznos',
            render: (val, tx) => (
                <span className="font-bold text-gray-800 dark:text-white/90">
                    {formatCurrency(val as number, tx.currency)}
                </span>
            )
        },
        {
            key: 'note',
            header: 'Referenca / Napomena',
            render: (_, tx) => (
                <div>
                    <div>{tx.note || '-'}</div>
                    {tx.reservation_id && (
                        <div className="text-xs text-gray-400">Rez: {tx.reservation_id.split('-')[0]}</div>
                    )}
                </div>
            )
        },
    ];

    return (
        <>
            <PageMeta title="Transactions | NMT Analytics" description="Track all accounts and transactions" />
            <PageToolbar
                title="Transakcije"
                description="Pregled svih finansijskih transakcija"
                searchValue=""
                onSearchChange={() => { }}
                searchPlaceholder="Traži transakcije..."
                actions={
                    <Button
                        variant="outline"
                        onClick={() => setIsImportOpen(true)}
                        className="flex items-center gap-2"
                    >
                        <FileIcon className="w-4 h-4" />
                        Import CSV
                    </Button>
                }
            />

            {/* Filters */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-white/[0.03] p-4 rounded-xl border border-gray-200 dark:border-white/[0.05]">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tip</label>
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
                    >
                        <option value="">Svi tipovi</option>
                        <option value="payment">Uplata</option>
                        <option value="refund">Povrat</option>
                        <option value="deposit">Depozit</option>
                        <option value="withdrawal">Isplata</option>
                    </select>
                </div>
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
            ) : transactions.length === 0 ? (
                <EmptyState
                    title="Nema transakcija"
                    description="Nije pronađena nijedna transakcija za odabrane filtere."
                />
            ) : (
                <>
                    <DataTable data={transactions} columns={columns} />
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
                entity="transactions"
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                onSuccess={() => {
                    setIsImportOpen(false);
                    fetchTransactions(currentPage);
                }}
            />
        </>
    );
}
