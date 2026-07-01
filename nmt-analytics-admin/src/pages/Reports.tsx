import { useState, useEffect } from 'react';
import PageMeta from '../components/common/PageMeta';
import KPICard from '../components/analytics/KPICard';
import RevenueChart from '../components/analytics/RevenueChart';
import { DataTable, Column } from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/business';
import {
    getAnalyticsOverviewV2,
    getPackageAnalyticsV2,
    getRevenueSeries,
    OverviewAnalyticsV2,
    PackageAnalyticsV2,
    RevenueSeriesDataPoint,
    AnalyticsFilters
} from '../api/analytics';

export default function Reports() {
    const { error: showError } = useToast();
    const { user, loading: authLoading } = useApp();

    // Date range state (default: last 30 days)
    const getDefaultDateRange = () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);

        return {
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0]
        };
    };

    const [dateRange, setDateRange] = useState(getDefaultDateRange());
    const [overview, setOverview] = useState<OverviewAnalyticsV2 | null>(null);
    const [packages, setPackages] = useState<PackageAnalyticsV2[]>([]);
    const [revenueSeries, setRevenueSeries] = useState<RevenueSeriesDataPoint[]>([]);
    const [bucket, setBucket] = useState<'daily' | 'weekly'>('daily');
    const [loading, setLoading] = useState(true);

    // Fetch analytics data
    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const filters: AnalyticsFilters = {
                from: dateRange.from,
                to: dateRange.to
            };

            const [overviewData, packagesData, seriesData] = await Promise.all([
                getAnalyticsOverviewV2(filters),
                getPackageAnalyticsV2(filters),
                getRevenueSeries({ ...filters, bucket })
            ]);

            setOverview(overviewData);
            setPackages(packagesData);
            setRevenueSeries(seriesData);
        } catch (err: any) {
            console.error('Failed to fetch analytics:', err);
            showError(err.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && !authLoading) {
            fetchAnalytics();
        } else if (!authLoading) {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading, dateRange, bucket]);

    // Export functions
    const exportOverviewCSV = async () => {
        try {
            const params = new URLSearchParams();
            if (dateRange.from) params.append('from', dateRange.from);
            if (dateRange.to) params.append('to', dateRange.to);

            const token = localStorage.getItem('travline_auth_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/analytics/overview.csv?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `overview-${dateRange.from || 'all'}-to-${dateRange.to || 'all'}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            showError('Failed to export CSV');
        }
    };

    const exportPackageCSV = async () => {
        try {
            const params = new URLSearchParams();
            if (dateRange.from) params.append('from', dateRange.from);
            if (dateRange.to) params.append('to', dateRange.to);

            const token = localStorage.getItem('travline_auth_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/analytics/by-package.csv?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `by-package-${dateRange.from || 'all'}-to-${dateRange.to || 'all'}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            showError('Failed to export CSV');
        }
    };

    // Package table columns
    const packageColumns: Column<PackageAnalyticsV2>[] = [
        {
            key: 'package_name',
            header: 'Paket',
            render: (val) => (
                <div className="font-medium text-gray-900 dark:text-white">
                    {val || 'Unknown Package'}
                </div>
            )
        },
        {
            key: 'reservations_count',
            header: 'Rezervacije',
            render: (val) => (
                <div className="text-center font-medium">
                    {val}
                </div>
            )
        },
        {
            key: 'total_amount_sum',
            header: 'Ukupan prihod',
            render: (val) => (
                <div className="text-right font-semibold text-brand-600 dark:text-brand-400">
                    {formatCurrency(val)}
                </div>
            )
        },
        {
            key: 'total_paid_sum',
            header: 'Plaćeno',
            render: (val) => (
                <div className="text-right text-success-600 dark:text-success-400 font-medium">
                    {formatCurrency(val)}
                </div>
            )
        },
        {
            key: 'total_balance_sum',
            header: 'Saldo',
            render: (val) => (
                <div className={`text-right font-medium ${val > 0
                    ? 'text-error-600 dark:text-error-400'
                    : 'text-success-600 dark:text-success-400'
                    }`}>
                    {formatCurrency(val)}
                </div>
            )
        },
    ];

    if (!authLoading && !user) {
        return (
            <div className="p-6">
                <EmptyState
                    title="Autentifikacija potrebna"
                    description="Molimo prijavite se"
                />
            </div>
        );
    }

    return (
        <>
            <PageMeta
                title="Izvještaji | Travline"
                description="Finansijski izvještaji i analitika"
            />

            <div className="w-full max-w-full">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">Izvještaji</h1>
                    <p className="text-gray-500 dark:text-gray-400">Finansijski pregled i analitika po paketima</p>
                </div>

                {/* Date Range Controls */}
                <div className="mb-6 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Od:</label>
                        <input
                            type="date"
                            value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">Do:</label>
                        <input
                            type="date"
                            value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
                        />
                    </div>
                    <button
                        onClick={() => setDateRange(getDefaultDateRange())}
                        className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                    >
                        Zadnjih 30 dana
                    </button>
                    <button
                        onClick={exportOverviewCSV}
                        className="ml-auto px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Overview CSV
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    <KPICard
                        title="Ukupan prihod"
                        value={overview ? formatCurrency(overview.total_amount_sum) : '-'}
                        subtitle={`${overview?.reservations_count || 0} rezervacija`}
                        color="primary"
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title="Plaćeno"
                        value={overview ? formatCurrency(overview.total_paid_sum) : '-'}
                        subtitle={`${overview?.payments_count || 0} plaćanja`}
                        color="success"
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title="Saldo"
                        value={overview ? formatCurrency(overview.total_balance_sum) : '-'}
                        subtitle="Neplaćeno"
                        color={overview && overview.total_balance_sum > 0 ? 'error' : 'success'}
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title="Prosječna vrijednost"
                        value={overview ? formatCurrency(overview.avg_reservation_value) : '-'}
                        subtitle="Po rezervaciji"
                        color="info"
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        }
                    />
                </div>

                {/* Payment Status Breakdown */}
                {overview && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Plaćeno</p>
                                    <p className="text-2xl font-bold text-success-600 dark:text-success-400">{overview.paid_count}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-success-50 dark:bg-success-950/20 flex items-center justify-center shrink-0">
                                    <svg className="w-6 h-6 text-success-600 dark:text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Djelimično plaćeno</p>
                                    <p className="text-2xl font-bold text-warning-600 dark:text-warning-400">{overview.partially_paid_count}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-warning-50 dark:bg-warning-950/20 flex items-center justify-center shrink-0">
                                    <svg className="w-6 h-6 text-warning-600 dark:text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Neplaćeno</p>
                                    <p className="text-2xl font-bold text-error-600 dark:text-error-400">{overview.unpaid_count}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-error-50 dark:bg-error-950/20 flex items-center justify-center shrink-0">
                                    <svg className="w-6 h-6 text-error-600 dark:text-error-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Revenue Chart */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Prihod tokom vremena</h2>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => setBucket('daily')}
                                className={`px-3 py-1 text-sm rounded-lg transition-colors ${bucket === 'daily' ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >Dnevno</button>
                            <button
                                onClick={() => setBucket('weekly')}
                                className={`px-3 py-1 text-sm rounded-lg transition-colors ${bucket === 'weekly' ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >Sedmično</button>
                        </div>
                    </div>
                    <RevenueChart data={revenueSeries} loading={loading} />
                </div>

                {/* Package Analytics Table */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Analitika po paketima</h2>
                        <button
                            onClick={exportPackageCSV}
                            className="px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export CSV
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center p-20">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : packages.length === 0 ? (
                        <EmptyState title="Nema podataka" description="Nema rezervacija za odabrani period." />
                    ) : (
                        <DataTable data={packages} columns={packageColumns} />
                    )}
                </div>
            </div>
        </>
    );
}
