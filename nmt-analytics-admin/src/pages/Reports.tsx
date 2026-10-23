import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { get } from '../api/client';
import { useT } from '../lib/i18n/context';
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
    const { t, lang } = useT();
    const locale = lang === 'bs' ? 'bs-BA' : 'en-GB';
    const requestVersion = useRef(0);
    const filterId = useId();
    const [loadError, setLoadError] = useState(false);
    const [refresh, setRefresh] = useState(0);
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
    const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
    const availableCurrencies = useMemo(() => overview?.availableCurrencies || [], [overview]);
    const hasMixedCurrencies = Boolean(overview?.multiCurrency || availableCurrencies.length > 1);
    const effectiveCurrency = selectedCurrency || overview?.currency || (availableCurrencies.length === 1 ? availableCurrencies[0] : null);
    const reportCurrency = effectiveCurrency || "BAM";
    const needsCurrencySelection = hasMixedCurrencies && !selectedCurrency;
    const money = (value: number | null | undefined) => value === null || value === undefined || needsCurrencySelection ? t.reports.selectCurrency : formatCurrency(value, reportCurrency, locale);

    // Fetch analytics data
    const fetchAnalytics = async () => {
        const version = ++requestVersion.current;
        setLoading(true); setLoadError(false);
        try {
            const filters: AnalyticsFilters = {
                from: dateRange.from,
                to: dateRange.to,
                ...(selectedCurrency ? { currency: selectedCurrency } : {})
            };

            const [overviewData, packagesData, seriesData] = await Promise.all([
                getAnalyticsOverviewV2(filters),
                getPackageAnalyticsV2(filters),
                getRevenueSeries({ ...filters, bucket })
            ]);

            if (version !== requestVersion.current) return;
            setOverview(overviewData);
            setPackages(packagesData);
            setRevenueSeries(seriesData);
        } catch {
            if (version !== requestVersion.current) return;
            setOverview(null); setPackages([]); setRevenueSeries([]); setLoadError(true);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    };

    useEffect(() => {
        if (user && !authLoading) {
            fetchAnalytics();
        } else if (!authLoading) {
            setLoading(false);
        }
        const version = requestVersion;
        return () => { version.current++; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading, dateRange, bucket, selectedCurrency, refresh]);

    // Use the same authenticated client and API base as the on-screen report.
    const exportCSV = async (path: string, name: string) => {
        try {
            const { data } = await get<Blob>(path, { params: { from: dateRange.from, to: dateRange.to, ...(selectedCurrency ? { currency: selectedCurrency } : {}) }, responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url; link.download = `${name}-${dateRange.from || 'all'}-to-${dateRange.to || 'all'}.csv`;
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        } catch { showError(t.reports.exportError); }
    };
    const exportOverviewCSV = () => exportCSV('/analytics/overview.csv', 'overview');
    const exportPackageCSV = () => exportCSV('/analytics/by-package.csv', 'by-package');

    // Package table columns
    const packageColumns: Column<PackageAnalyticsV2>[] = [
        {
            key: 'package_name',
            header: t.reports.packageName,
            render: (val) => (
                <div className="font-medium text-gray-900 dark:text-white">
                    {val || t.reports.unknownPackage}
                </div>
            )
        },
        {
            key: 'reservations_count',
            header: t.reports.reservationsCount,
            render: (val) => (
                <div className="text-center font-medium">
                    {val}
                </div>
            )
        },
        {
            key: 'total_amount_sum',
            header: t.reports.totalRevenueColumn,
            render: (val, row) => (
                <div className="text-right font-semibold text-brand-600 dark:text-brand-400">
                    {formatCurrency(val, row.currency || reportCurrency, locale)}
                </div>
            )
        },
        {
            key: 'total_paid_sum',
            header: t.reports.paidColumn,
            render: (val, row) => (
                <div className="text-right text-success-600 dark:text-success-400 font-medium">
                    {formatCurrency(val, row.currency || reportCurrency, locale)}
                </div>
            )
        },
        {
            key: 'total_balance_sum',
            header: t.reports.balanceColumn,
            render: (val, row) => (
                <div className={`text-right font-medium ${val > 0
                    ? 'text-error-600 dark:text-error-400'
                    : 'text-success-600 dark:text-success-400'
                    }`}>
                    {formatCurrency(val, row.currency || reportCurrency, locale)}
                </div>
            )
        },
    ];

    if (!authLoading && !user) {
        return (
            <div className="p-6">
                <EmptyState
                    title={t.reports.authRequired}
                    description={t.reports.pleaseSignIn}
                />
            </div>
        );
    }

    return (
        <>
            <PageMeta
                title={`${t.reports.title} | Travline`}
                description={t.reports.description}
            />

            <div className="w-full max-w-full text-gray-900 dark:text-gray-100">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">{t.reports.title}</h1>
                    <p className="text-gray-500 dark:text-gray-400">{t.reports.description}</p>
                </div>

                {/* Date Range Controls */}
                <div className="mb-6 flex flex-wrap gap-4 items-center">
                    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none">
                        <label htmlFor={`${filterId}-from`} className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{t.reports.from}:</label>
                        <input
                            type="date"
                            id={`${filterId}-from`}
                            value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800 [color-scheme:light] dark:[color-scheme:dark]"
                        />
                    </div>
                    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none">
                        <label htmlFor={`${filterId}-to`} className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{t.reports.to}:</label>
                        <input
                            type="date"
                            id={`${filterId}-to`}
                            value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="h-11 min-w-0 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800 [color-scheme:light] dark:[color-scheme:dark]"
                        />
                    </div>
                    <button
                        onClick={() => setDateRange(getDefaultDateRange())}
                        className="text-sm text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                    >
                        {t.reports.last30Days}
                    </button>
                    {availableCurrencies.length > 1 && (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-1 dark:border-gray-800">
                            {availableCurrencies.map((currency) => (
                                <button
                                    key={currency}
                                    onClick={() => setSelectedCurrency(currency)}
                                    className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                                        selectedCurrency === currency
                                            ? 'bg-brand-500 text-white'
                                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {currency}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        disabled={loading || loadError || !overview}
                        onClick={exportOverviewCSV}
                        className="disabled:cursor-not-allowed disabled:opacity-50 ml-auto px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {t.reports.exportOverview}
                    </button>
                </div>

                {loadError && <div role="alert" className="mb-6 rounded-lg border border-error-300 p-4 text-error-700 dark:text-error-400"><p>{t.reports.loadError}</p><button className="mt-2 rounded-lg border px-4 py-2" onClick={() => setRefresh(value => value + 1)}>{t.reports.retry}</button></div>}
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    <KPICard
                        title={t.reports.totalRevenue}
                        value={overview ? money(overview.total_amount_sum) : '-'}
                        subtitle={`${overview?.reservations_count || 0} ${t.reports.reservationsCount}`}
                        color="primary"
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title={t.reports.totalPaid}
                        value={overview ? money(overview.total_paid_sum) : '-'}
                        subtitle={`${overview?.payments_count || 0} ${t.payments.title}`}
                        color="success"
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title={t.reports.balance}
                        value={overview ? money(overview.total_balance_sum) : '-'}
                        subtitle={t.reports.unpaidCount}
                        color={overview && (overview.total_balance_sum || 0) > 0 ? 'error' : 'success'}
                        loading={loading}
                        icon={
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                        }
                    />

                    <KPICard
                        title={t.reports.averageValue}
                        value={overview ? money(overview.avg_reservation_value) : '-'}
                        subtitle={t.reports.perReservation}
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
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t.reports.paidCount}</p>
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
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t.reports.partiallyPaidCount}</p>
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
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{t.reports.unpaidCount}</p>
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
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.reports.revenueOverTime}</h2>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => setBucket('daily')}
                                className={`px-3 py-1 text-sm rounded-lg transition-colors ${bucket === 'daily' ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >{t.reports.perDay}</button>
                            <button
                                onClick={() => setBucket('weekly')}
                                className={`px-3 py-1 text-sm rounded-lg transition-colors ${bucket === 'weekly' ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >{t.reports.perWeek}</button>
                        </div>
                    </div>
                    {needsCurrencySelection ? (
                        <EmptyState title={t.reports.mixedCurrencies} description={t.reports.selectForChart} />
                    ) : (
                        <RevenueChart data={revenueSeries} loading={loading} currency={reportCurrency} />
                    )}
                </div>

                {/* Package Analytics Table */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.reports.byPackage}</h2>
                        <button
                            disabled={loading || loadError || !overview}
                            onClick={exportPackageCSV}
                            className="disabled:cursor-not-allowed disabled:opacity-50 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center gap-2 shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {t.reports.exportPackage}
                        </button>
                    </div>

                    {needsCurrencySelection ? (
                        <EmptyState title={t.reports.mixedCurrencies} description={t.reports.selectForRanking} />
                    ) : loading ? (
                        <div className="flex items-center justify-center p-20">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : packages.length === 0 ? (
                        <EmptyState title={t.reports.noData} description={t.reports.noReservations} />
                    ) : (
                        <DataTable data={packages} columns={packageColumns} />
                    )}
                </div>
            </div>
        </>
    );
}
