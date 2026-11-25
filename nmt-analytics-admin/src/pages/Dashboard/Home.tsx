import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import OnboardingChecklist from "../../components/common/OnboardingChecklist";
import { getRevenueSeries, getBookingsSeries, DataPoint } from "../../api/metrics";
import { getAnalyticsOverview, AnalyticsOverview, getDashboardStats, DashboardStats } from "../../api/analytics";
import { downloadAllData } from "../../api/export";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import AnalyticsChart from "../../components/charts/AnalyticsChart";
import DateRangeFilter, { DateRange } from "../../components/common/DateRangeFilter";
import { ArrowDownIcon, ArrowUpIcon, BoxIconLine, DollarLineIcon, CalenderIcon, DownloadIcon, GroupIcon, ShootingStarIcon, LockIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { hasAccess } from "../../types/roles";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { formatCurrency } from "../../utils/business";

export default function Home() {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-GB" : "bs-BA";
  const toast = useToast();
  const toastErrorRef = useRef(toast.error);
  toastErrorRef.current = toast.error;
  const errorMessageRef = useRef(t.common.error);
  errorMessageRef.current = t.common.error;
  const navigate = useNavigate();
  const { userContext } = useApp();
  const role = userContext?.role ?? 'agent';
  const isAgentViewer = !hasAccess('manager', role);
  const isManagerPlus = hasAccess('manager', role);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<DataPoint[]>([]);
  const [bookingsSeries, setBookingsSeries] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentRange, setCurrentRange] = useState<DateRange | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchDashboardData = useCallback(async (range: DateRange, currency?: string | null) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setChartLoading(true);
    setLoadError(false);
    setUpgradeRequired(false);
    try {
      const [ov, ds, rev, book] = await Promise.all([
        getAnalyticsOverview(range.from, range.to, currency || undefined),
        getDashboardStats({ from: range.from, to: range.to, currency: currency || undefined }),
        getRevenueSeries(range.from, range.to, range.granularity, currency || undefined),
        getBookingsSeries(range.from, range.to, range.granularity)
      ]);
      if (requestId !== requestIdRef.current) return;

      setOverview(ov || null);
      setDashboardStats(ds || null);
      setRevenueSeries(Array.isArray(rev?.data) ? rev.data : []);
      setBookingsSeries(Array.isArray(book) ? book : []);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      console.error("Dashboard fetch error:", err);

      setOverview(null);
      setDashboardStats(null);
      setRevenueSeries([]);
      setBookingsSeries([]);

      if (err?.status === 402 || err?.status === 403 || err?.code === "MODULE_NOT_ENTITLED" || err?.code === "MODULE_DISABLED") {
        setUpgradeRequired(true);
      } else {
        setLoadError(true);
        toastErrorRef.current(errorMessageRef.current);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setChartLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (currentRange) {
      fetchDashboardData(currentRange, selectedCurrency);
    }
  }, [currentRange, selectedCurrency, fetchDashboardData]);

  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    overview?.availableCurrencies?.forEach((currency) => currencies.add(currency));
    dashboardStats?.availableCurrencies?.forEach((currency) => currencies.add(currency));
    revenueSeries.forEach((point) => {
      if (point.currency) currencies.add(point.currency);
    });
    return Array.from(currencies).sort();
  }, [overview, dashboardStats, revenueSeries]);

  const orgCurrency = userContext?.org?.currency || "BAM";
  const hasMixedCurrencies = Boolean((overview?.multiCurrency || dashboardStats?.multiCurrency || availableCurrencies.length > 1) && !selectedCurrency);
  const displayCurrency = selectedCurrency || dashboardStats?.currency || overview?.currency || (availableCurrencies.length === 1 ? availableCurrencies[0] : orgCurrency);
  const moneyLabel = (value: number | null | undefined) => {
    if (loadError || upgradeRequired) return "—";
    if (value === null || value === undefined || hasMixedCurrencies || !displayCurrency) return t.reports.selectCurrency;
    return formatCurrency(value, displayCurrency, locale);
  };

  // Transform revenue_by_month for the chart if standard series is empty
  const chartRevenueData = useMemo(() => {
    // Defensive check
    if (hasMixedCurrencies) return [];
    if (Array.isArray(revenueSeries) && revenueSeries.length > 0) return revenueSeries;

    // Check if revenue_by_month is an array before mapping
    if (dashboardStats?.revenue_by_month && Array.isArray(dashboardStats.revenue_by_month)) {
      return dashboardStats.revenue_by_month.filter((m) => m.amount !== null && m.amount !== undefined).map(m => ({
        date: m.month,
        value: Number(m.amount)
      }));
    }
    return [];
  }, [revenueSeries, dashboardStats, hasMixedCurrencies]);

  const MetricCard = ({ title, value, change, icon: Icon, suffix = "", formatter }: any) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 transition-all hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
          <Icon className="text-indigo-600 dark:text-indigo-400 size-6" />
        </div>
        {change !== undefined && !loading && (
          <Badge color={change >= 0 ? "success" : "error"} variant="light">
            {change >= 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            <span className="ml-1 font-medium">{Math.abs(change)}%</span>
          </Badge>
        )}
      </div>

      <div className="mt-5">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <h4 className="mt-1 font-bold text-gray-900 text-2xl dark:text-white/90">
          {loading ? (
            <div className="h-8 w-24 animate-pulse bg-gray-100 rounded dark:bg-gray-800" />
        ) : (
            formatter ? formatter(value) : `${Number(value || 0).toLocaleString(locale)}${suffix}`
          )}
        </h4>
      </div>
    </div>
  );

  const isEmpty = !loading && !loadError && !upgradeRequired && (
    isAgentViewer
      ? (!overview || overview.totalBookings === 0)
      : (!overview || (overview.totalRevenue === 0 && overview.totalBookings === 0))
  );

  return (
    <>
      <PageMeta title={`${t.dashboard.title} | Travline`} description={t.dashboard.description} />

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white/90 font-outfit">{t.dashboard.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.dashboard.description}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <DateRangeFilter onRangeChange={setCurrentRange} />
          {isManagerPlus && (
            <Button
              size="sm"
              variant="outline"
              className="h-11 px-4"
              onClick={downloadAllData}
            >
              <DownloadIcon className="w-4 h-4 mr-2" />
              {t.dashboard.exportData}
            </Button>
          )}
        </div>
      </div>

      {isManagerPlus && availableCurrencies.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.common.currency}</span>
          {availableCurrencies.map((currency) => (
            <button
              key={currency}
              type="button"
              onClick={() => setSelectedCurrency(currency)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                selectedCurrency === currency
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-200"
                  : "border-gray-200 text-gray-600 hover:border-indigo-300 dark:border-gray-800 dark:text-gray-300"
              }`}
            >
              {currency}
            </button>
          ))}
        </div>
      )}

      <OnboardingChecklist />

      {upgradeRequired ? (
        <div className="mb-8 rounded-2xl border border-amber-200 bg-white p-8 text-center dark:border-amber-800/40 dark:bg-white/[0.03]">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <LockIcon className="size-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t.dashboard.upgradeRequiredTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">{t.dashboard.upgradeRequiredDesc}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/home" className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
              {t.common.backToHome}
            </Link>
          </div>
        </div>
      ) : loadError ? (
        <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/70 p-6 dark:border-rose-800/40 dark:bg-rose-950/20">
          <p role="alert" className="text-sm font-medium text-rose-800 dark:text-rose-200">{t.dashboard.loadError}</p>
          {currentRange && (
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => void fetchDashboardData(currentRange, selectedCurrency)}
            >
              {t.common.tryAgain}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 md:gap-6 mb-8">
            {isManagerPlus && (
              <MetricCard
                title={t.dashboard.totalRevenue}
                value={dashboardStats?.revenue ?? overview?.totalRevenue ?? 0}
                change={overview?.revenueChangePct}
                icon={DollarLineIcon}
                formatter={moneyLabel}
              />
            )}
            <MetricCard
              title={t.dashboard.totalBookings}
              value={dashboardStats?.bookings_count ?? overview?.totalBookings ?? 0}
              change={overview?.bookingsChangePct}
              icon={BoxIconLine}
            />
            <MetricCard
              title={t.dashboard.totalCustomers}
              value={overview?.totalCustomers ?? 0}
              change={overview?.customersChangePct}
              icon={GroupIcon}
            />
            {isManagerPlus && (
              <MetricCard
                title={t.dashboard.avgBooking}
                value={dashboardStats?.average_booking_value ?? 0}
                icon={ShootingStarIcon}
                formatter={moneyLabel}
              />
            )}
            <MetricCard
              title={t.dashboard.cancelRate}
              value={overview?.cancellationRate ?? 0}
              icon={ArrowDownIcon}
              suffix="%"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 mb-8">
            {isManagerPlus && (
              <AnalyticsChart
                title={t.dashboard.revenueTrend}
                subtitle={t.dashboard.revenueGenerated}
                data={chartRevenueData}
                prefix={!hasMixedCurrencies && displayCurrency ? `${displayCurrency} ` : ""}
                loading={chartLoading}
                onPointClick={(date) => navigate(`/reports?from=${date}&to=${date}`)}
              />
            )}
            <AnalyticsChart
              title={isManagerPlus ? t.dashboard.bookingsTrend : t.dashboard.yourBookings}
              subtitle={isManagerPlus ? t.dashboard.bookingsOverTime : t.dashboard.reservationsOverview}
              data={bookingsSeries}
              color="#10B981"
              loading={chartLoading}
              onPointClick={(date) => navigate(`/reports?from=${date}&to=${date}`)}
            />
          </div>

          {!loading && !hasMixedCurrencies && dashboardStats?.top_packages && Array.isArray(dashboardStats.top_packages) && dashboardStats.top_packages.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t.dashboard.topPackages}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dashboardStats.top_packages.map((pkg, idx) => (
                  <div key={idx} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{pkg?.name || t.dashboard.unknownPackage}</h4>
                      <Badge color="info">{pkg?.bookings || 0} {t.dashboard.bookings}</Badge>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {pkg?.revenue === null || pkg?.revenue === undefined || !(pkg.currency || displayCurrency)
                          ? t.reports.selectCurrency
                          : formatCurrency(pkg.revenue, pkg.currency || displayCurrency!, locale)}
                      </span>
                      <span className="text-xs text-gray-500">{t.dashboard.revenue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isEmpty && (
        <div className="mt-12 py-12 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.01] text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <CalenderIcon className="text-gray-400 size-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {isAgentViewer ? t.dashboard.noBookings : t.dashboard.noData}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 px-4">
              {isAgentViewer
                ? t.dashboard.noBookingsDesc
                : t.dashboard.noDataDesc
              }
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              {isManagerPlus ? (
                <>
                  <Button onClick={() => navigate('/packages')}>
                    {t.dashboard.createPackage}
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/reservations')}>
                    {t.dashboard.viewReservations}
                  </Button>
                </>
              ) : (
                <Button onClick={() => navigate('/reservations')}>
                  {t.dashboard.createReservation}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
