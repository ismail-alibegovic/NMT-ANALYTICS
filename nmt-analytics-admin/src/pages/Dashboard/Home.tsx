import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { getRevenueSeries, getBookingsSeries, DataPoint } from "../../api/metrics";
import { getAnalyticsOverview, AnalyticsOverview, getDashboardStats, DashboardStats } from "../../api/analytics";
import { downloadAllData } from "../../api/export";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import AnalyticsChart from "../../components/charts/AnalyticsChart";
import DateRangeFilter, { DateRange } from "../../components/common/DateRangeFilter";
import { ArrowDownIcon, ArrowUpIcon, BoxIconLine, DollarLineIcon, CalenderIcon, DownloadIcon, GroupIcon, ShootingStarIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { hasAccess } from "../../types/roles";
import { useApp } from "../../context/AppContext";

export default function Home() {
  const toast = useToast();
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
  const [currentRange, setCurrentRange] = useState<DateRange | null>(null);

  const fetchDashboardData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setChartLoading(true);
    try {
      const [ov, ds, rev, book] = await Promise.all([
        getAnalyticsOverview(range.from, range.to),
        getDashboardStats({ from: range.from, to: range.to }),
        getRevenueSeries(range.from, range.to, range.granularity),
        getBookingsSeries(range.from, range.to, range.granularity)
      ]);

      setOverview(ov || null);
      setDashboardStats(ds || null);
      setRevenueSeries(Array.isArray(rev) ? rev : []);
      setBookingsSeries(Array.isArray(book) ? book : []);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      toast.error("Failed to load dashboard data. Please try again.");

      // Safe fallback on error
      setOverview(null);
      setDashboardStats(null);
      setRevenueSeries([]);
      setBookingsSeries([]);
    } finally {
      setLoading(false);
      setChartLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (currentRange) {
      fetchDashboardData(currentRange);
    }
  }, [currentRange, fetchDashboardData]);

  // Transform revenue_by_month for the chart if standard series is empty
  const chartRevenueData = useMemo(() => {
    // Defensive check
    if (Array.isArray(revenueSeries) && revenueSeries.length > 0) return revenueSeries;

    // Check if revenue_by_month is an array before mapping
    if (dashboardStats?.revenue_by_month && Array.isArray(dashboardStats.revenue_by_month)) {
      return dashboardStats.revenue_by_month.map(m => ({
        date: m.month,
        value: m.amount
      }));
    }
    return [];
  }, [revenueSeries, dashboardStats]);

  const MetricCard = ({ title, value, change, icon: Icon, prefix = "", suffix = "" }: any) => (
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
            `${prefix}${value.toLocaleString()}${suffix}`
          )}
        </h4>
      </div>
    </div>
  );

  const isEmpty = !loading && (
    isAgentViewer
      ? (!overview || overview.totalBookings === 0)
      : (!overview || (overview.totalRevenue === 0 && overview.totalBookings === 0))
  );

  return (
    <>
      <PageMeta title="Dashboard | Travline" description="Travline Dashboard Overview" />

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white/90 font-outfit">Dashboard Overview</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track your business performance and metrics</p>
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
              Export Data
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 md:gap-6 mb-8">
        {isManagerPlus && (
          <MetricCard
            title="Total Revenue"
            value={dashboardStats?.revenue ?? overview?.totalRevenue ?? 0}
            change={overview?.revenueChangePct}
            icon={DollarLineIcon}
            prefix="$"
          />
        )}
        <MetricCard
          title="Total Bookings"
          value={dashboardStats?.bookings_count ?? overview?.totalBookings ?? 0}
          change={overview?.bookingsChangePct}
          icon={BoxIconLine}
        />
        <MetricCard
          title="Total Customers"
          value={overview?.totalCustomers ?? 0}
          change={overview?.customersChangePct}
          icon={GroupIcon}
        />
        {isManagerPlus && (
          <MetricCard
            title="Avg Booking"
            value={dashboardStats?.average_booking_value ?? 0}
            icon={ShootingStarIcon}
            prefix="$"
          />
        )}
        <MetricCard
          title="Cancel Rate"
          value={overview?.cancellationRate ?? 0}
          icon={ArrowDownIcon}
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8">
        {isManagerPlus && (
          <AnalyticsChart
            title="Revenue Trend"
            subtitle="Revenue generated over time"
            data={chartRevenueData}
            prefix="$"
            loading={chartLoading}
            onPointClick={(date) => navigate(`/reports?from=${date}&to=${date}`)}
          />
        )}
        <AnalyticsChart
          title={isManagerPlus ? "Bookings Trend" : "Your Bookings"}
          subtitle={isManagerPlus ? "Number of reservations over time" : "Reservations overview"}
          data={bookingsSeries}
          color="#10B981"
          loading={chartLoading}
          onPointClick={(date) => navigate(`/reports?from=${date}&to=${date}`)}
        />
      </div>

      {!loading && dashboardStats?.top_packages && Array.isArray(dashboardStats.top_packages) && dashboardStats.top_packages.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Top Packages</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardStats.top_packages.map((pkg, idx) => (
              <div key={idx} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{pkg?.name || 'Unknown Package'}</h4>
                  <Badge color="info">{pkg?.bookings || 0} bookings</Badge>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${(pkg?.revenue || 0).toLocaleString()}</span>
                  <span className="text-xs text-gray-500">revenue</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="mt-12 py-12 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.01] text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <CalenderIcon className="text-gray-400 size-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {isAgentViewer ? "No Recent Bookings" : "No Data Found for this Period"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 px-4">
              {isAgentViewer
                ? "You don't have any reservations yet. Start by creating a new reservation for a customer."
                : "We couldn't find any transactions or reservations within the selected date range. Try adjusting your filters or create new data."
              }
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              {isManagerPlus ? (
                <>
                  <Button onClick={() => window.location.href = '/packages'}>
                    Create Package
                  </Button>
                  <Button variant="outline" onClick={() => window.location.href = '/reservations'}>
                    View Reservations
                  </Button>
                </>
              ) : (
                <Button onClick={() => window.location.href = '/reservations'}>
                  Create Reservation
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
