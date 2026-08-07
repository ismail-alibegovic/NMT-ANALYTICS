import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  getAnalyticsOverviewV2,
  getRevenueSeries,
  type OverviewAnalyticsV2,
  type RevenueSeriesDataPoint,
} from "../../api/analytics";
import { getDepartures } from "../../api/departures";
import { getReservations } from "../../api/reservations";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  CalenderIcon,
  DollarLineIcon,
  TableIcon,
  BoxIconLine,
  GridIcon,
  PieChartIcon,
  UserCircleIcon,
  GroupIcon,
  CheckCircleIcon,
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { hasAccess, UserRole } from "../../types/roles";
import { useT } from "../../lib/i18n/context";
import { logger } from "../../utils/logger";

type PaymentRow = {
  id: string;
  customerName: string;
  packageName: string;
  amount: string;
  daysOpen: number;
  href: string;
};

/**
 * V8 in Chrome ships no ICU data for `bs-BA`, so `toLocaleDateString("bs-BA")`
 * degrades to strings like "M07 31, Fri" and `Intl.NumberFormat` renders
 * "BAM 1,234" with English grouping. Bosnian month/day names and BiH number
 * grouping are therefore handled explicitly here.
 */
type Lang = "bs" | "en";

const BS_MONTHS = [
  "januar", "februar", "mart", "april", "maj", "juni",
  "juli", "august", "septembar", "oktobar", "novembar", "decembar",
];
const BS_MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const BS_DAYS = ["nedjelja", "ponedjeljak", "utorak", "srijeda", "\u010detvrtak", "petak", "subota"];

/** 12345 -> "12.345" (bs) / "12,345" (en) */
const groupInt = (n: number, lang: Lang) => {
  const sep = lang === "bs" ? "." : ",";
  const body = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return n < 0 ? `-${body}` : body;
};

const fmtCurrency = (n: number | null | undefined, lang: Lang = "bs") => {
  if (n == null || Number.isNaN(n)) return "\u2014";
  return lang === "bs" ? `${groupInt(n, "bs")} KM` : `KM ${groupInt(n, "en")}`;
};

const fmtNumber = (n: number | null | undefined, lang: Lang = "bs") => {
  if (n == null || Number.isNaN(n)) return "\u2014";
  return groupInt(n, lang);
};

/** "petak, 31. juli" / "Friday, 31 July" */
const fmtDateLine = (d: Date, lang: Lang) =>
  lang === "bs"
    ? `${BS_DAYS[d.getDay()]}, ${d.getDate()}. ${BS_MONTHS[d.getMonth()]}`
    : d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

const fmtMonthShort = (d: Date, lang: Lang) =>
  lang === "bs" ? BS_MONTHS_SHORT[d.getMonth()] : d.toLocaleDateString("en-US", { month: "short" });

const relativeDayLabel = (iso: string, lang: Lang) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return lang === "bs" ? "Danas" : "Today";
  if (diff === 1) return lang === "bs" ? "Sutra" : "Tomorrow";
  if (diff === -1) return lang === "bs" ? "Ju\u010der" : "Yesterday";
  if (diff > 1 && diff < 7) {
    return lang === "bs" ? BS_DAYS[date.getDay()] : date.toLocaleDateString("en-US", { weekday: "long" });
  }
  return lang === "bs"
    ? `${date.getDate()}. ${BS_MONTHS_SHORT[date.getMonth()]}`
    : date.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
};

/**
 * Pure-SVG area chart. Bleeds edge-to-edge inside its container: the baseline
 * sits exactly on the container's bottom, so it can meet the panel border with
 * no dead strip underneath.
 */
const AreaChart: React.FC<{
  points: number[];
  height?: number;
  stroke?: string;
  gradientId?: string;
}> = ({ points, height = 84, stroke = "#465fff", gradientId = "rev" }) => {
  const width = 640;
  if (!points.length) return null;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const topPad = 12;
  const usableH = height - topPad;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = topPad + usableH - ((p - min) / span) * usableH;
    return [x, y] as const;
  });
  const linePath = coords.reduce((acc, c, i, arr) => {
    if (i === 0) return `M${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    const p0 = arr[i - 1];
    const cp1x = p0[0] + (c[0] - p0[0]) / 2;
    return `${acc} C${cp1x.toFixed(1)},${p0[1].toFixed(1)} ${cp1x.toFixed(1)},${c[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }, "");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Revenue trend"
      className="block w-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={9} fill={stroke} opacity={0.16} />
      <circle cx={last[0]} cy={last[1]} r={4} fill={stroke} />
      <circle cx={last[0]} cy={last[1]} r={2} fill="#fff" />
    </svg>
  );
};

/** Chart slot with nothing to plot: a flat baseline sitting on the panel edge. */
const FlatBaseline: React.FC<{ label: string; height?: number }> = ({ label, height = 84 }) => (
  <div className="flex w-full flex-col justify-end px-5" style={{ height }}>
    <p className="mb-2.5 text-xs text-gray-400 dark:text-gray-500">{label}</p>
    <div className="h-px w-full border-t border-dashed border-gray-200 dark:border-white/[0.10]" />
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
    {children}
  </h2>
);

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div
    className={`rounded-2xl border border-gray-200/70 bg-white shadow-sm shadow-gray-200/40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none ${className}`}
  >
    {children}
  </div>
);

/** Muted inline empty row — short, never a tall dashed slab. */
const EmptyLine: React.FC<{ icon: React.FC<{ className?: string }>; label: string }> = ({
  icon: Icon,
  label,
}) => (
  <div className="flex items-center gap-2.5 py-3">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-300 dark:bg-white/[0.04] dark:text-gray-600">
      <Icon className="size-4" />
    </span>
    <span className="text-sm text-gray-400 dark:text-gray-500">{label}</span>
  </div>
);

type Metric = {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  href: string;
  tone?: "default" | "warn";
};

/**
 * One row of the KPI ledger. Stacked vertically; tightened padding for the
 * compact single-viewport hub.
 */
const MetricRow: React.FC<{ metric: Metric; loading: boolean }> = ({ metric, loading }) => {
  const Icon = metric.icon;
  return (
    <Link
      to={metric.href}
      className="group flex flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          metric.tone === "warn"
            ? "border border-amber-200/70 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/[0.08] dark:text-amber-400"
            : "bg-gray-100 text-gray-400 group-hover:bg-brand-500/10 group-hover:text-brand-500 dark:bg-white/[0.05] dark:text-gray-500"
        }`}
      >
        <Icon className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
          {metric.label}
        </span>
        {loading ? (
          <span className="mt-1.5 block h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
        ) : (
          <span className="mt-0.5 block truncate text-[1rem] font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
            {metric.value}
          </span>
        )}
      </span>
      <ArrowRightIcon className="size-3.5 shrink-0 text-gray-200 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-700" />
    </Link>
  );
};

const HomeHub: React.FC = () => {
  const { userContext } = useApp();
  const navigate = useNavigate();
  const { t, lang } = useT();
  const hub = t.hub;

  const [overview, setOverview] = useState<OverviewAnalyticsV2 | null>(null);
  const [departures, setDepartures] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<RevenueSeriesDataPoint[]>([]);
  const [watchPayments, setWatchPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const role = userContext?.role;
  const orgName = userContext?.org?.name;
  const showFinance = hasAccess("manager", role);

  const now = new Date();
  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 5) return hub.good_night;
    if (h < 12) return hub.good_morning;
    if (h < 18) return hub.good_afternoon;
    return hub.good_evening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.good_night, hub.good_morning, hub.good_afternoon, hub.good_evening]);

  const dateLine = fmtDateLine(now, lang);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const today = new Date();
        const todayISO = today.toISOString().split("T")[0];
        const fortnightAgo = new Date(today.getTime() - 14 * 86_400_000).toISOString().split("T")[0];

        const [ov, deps, rev, pays] = await Promise.allSettled([
          getAnalyticsOverviewV2({ from: fortnightAgo, to: todayISO }),
          getDepartures({ status: "active", dateFrom: todayISO, limit: 6 }),
          getRevenueSeries({ from: fortnightAgo, to: todayISO, bucket: "daily" }),
          showFinance ? getReservations({ status: "confirmed", limit: 12 }) : Promise.resolve(null),
        ]);

        if (!active) return;
        if (ov.status === "fulfilled") setOverview(ov.value);
        if (deps.status === "fulfilled") setDepartures((deps.value as any)?.data || []);
        if (rev.status === "fulfilled") setRevenue(rev.value || []);
        if (pays.status === "fulfilled" && pays.value) {
          const rows = (pays.value.data || [])
            .filter((r) => r.balanceDue > 0)
            .slice(0, 4)
            .map((r) => {
              const created = new Date(r.bookingDate || r.createdAt);
              const daysOpen = Math.max(0, Math.round((Date.now() - created.getTime()) / 86_400_000));
              return {
                id: r.id,
                customerName: r.customerName,
                packageName: r.packageName,
                amount: fmtCurrency(r.balanceDue, lang),
                daysOpen,
                href: `/reservations/${r.id}`,
              } as PaymentRow;
            });
          setWatchPayments(rows);
        }
      } catch (err) {
        logger.error("[HomeHub] load failed", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showFinance, lang]);

  const upcoming = useMemo(
    () =>
      departures.slice(0, 4).map((d) => ({
        id: d.id,
        label: d.packages?.name || d.packageName || d.destination || hub.untitledDeparture,
        destination: d.packages?.destination || d.destination || "",
        departAt: d.depart_at,
        seats: d.capacity || 0,
        booked: d.booked || 0,
      })),
    [departures, hub.untitledDeparture]
  );

  const revenuePoints = useMemo(() => revenue.map((p) => p.total_paid_sum || 0), [revenue]);
  const paidTotal = useMemo(
    () => revenue.reduce((acc, p) => acc + (p.total_paid_sum || 0), 0),
    [revenue]
  );

  /** Second-half vs first-half of the 14-day series — a real, explainable delta. */
  const trendPct = useMemo(() => {
    if (revenuePoints.length < 4) return null;
    const mid = Math.floor(revenuePoints.length / 2);
    const prev = revenuePoints.slice(0, mid).reduce((a, b) => a + b, 0);
    const curr = revenuePoints.slice(mid).reduce((a, b) => a + b, 0);
    if (prev <= 0) return curr > 0 ? 100 : null;
    return Math.round(((curr - prev) / prev) * 100);
  }, [revenuePoints]);

  const metrics: Metric[] = useMemo(() => {
    const list: Metric[] = [
      {
        label: hub.kpiReservations,
        value: fmtNumber(overview?.reservations_count, lang),
        icon: TableIcon,
        href: "/reservations",
      },
    ];
    if (showFinance) {
      list.push(
        {
          label: hub.kpiRevenue,
          value: fmtCurrency(overview?.total_amount_sum, lang),
          icon: PieChartIcon,
          href: "/reports",
        },
        {
          label: hub.kpiOutstanding,
          value: fmtCurrency(overview?.total_balance_sum, lang),
          icon: BoxIconLine,
          href: "/payments",
          tone: (overview?.total_balance_sum || 0) > 0 ? "warn" : "default",
        }
      );
    } else {
      list.push(
        {
          label: hub.recentDepartures,
          value: fmtNumber(upcoming.length, lang),
          icon: CalenderIcon,
          href: "/departures",
        },
        {
          label: hub.psPaid,
          value: fmtNumber(overview?.paid_count, lang),
          icon: CheckCircleIcon,
          href: "/reservations",
        }
      );
    }
    return list;
  }, [overview, showFinance, lang, upcoming.length, hub]);

  const workspaces = [
    { label: hub.salesTitle, href: "/sales", icon: GridIcon, minRole: "agent" as UserRole },
    { label: hub.opsTitle, href: "/operations", icon: BoxIconLine, minRole: "agent" as UserRole },
    { label: hub.finTitle, href: "/payments", icon: PieChartIcon, minRole: "manager" as UserRole },
  ].filter((s) => hasAccess(s.minRole, role));

  const shortcuts = [
    { label: hub.sReservations, href: "/reservations", icon: TableIcon },
    { label: hub.sPackages, href: "/packages", icon: BoxIconLine },
    { label: hub.sCalendar, href: "/operations/calendar", icon: CalenderIcon },
    { label: hub.sCustomers, href: "/customers", icon: GroupIcon },
    { label: hub.sReports, href: "/reports", icon: PieChartIcon, minRole: "manager" as UserRole },
    { label: hub.sBranding, href: "/settings", icon: UserCircleIcon, minRole: "director" as UserRole },
  ].filter((s) => !s.minRole || hasAccess(s.minRole, role));

  const heroLabel = showFinance ? hub.revenuePanel : hub.recentDepartures;
  const heroValue = showFinance ? fmtCurrency(paidTotal, lang) : fmtNumber(upcoming.length, lang);

  return (
    <>
      <PageMeta title={`Travline — ${hub.title}`} description={hub.subtitle} />

      {/* Ambient accent glow anchored to the masthead — depth without a hero image */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44 bg-gradient-to-b from-brand-500/[0.07] via-brand-500/[0.02] to-transparent dark:from-brand-500/[0.12] dark:via-brand-500/[0.03]"
        />

        <div className="mx-auto flex h-[calc(100dvh-130px)] w-full max-w-[1360px] flex-col overflow-hidden px-4 py-4 md:px-6 md:py-5">
          {/* ── Masthead — slim, one row ─────────────────────────────────── */}
          <header className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-[0.78rem] font-bold text-white shadow-sm shadow-brand-500/30">
                {(orgName || "T").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xl font-semibold leading-tight tracking-tight text-gray-900 dark:text-white sm:text-2xl">
                  <span>
                    {greeting}
                    <span className="text-brand-500">.</span>
                  </span>
                  <span className="text-xs font-normal capitalize text-gray-400 dark:text-gray-500">
                    {dateLine}
                  </span>
                </h1>
                <p className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                  {orgName || "Travline"}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/reservations?new=1")}
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600 hover:shadow-brand-500/35 active:translate-y-px"
            >
              <PlusIcon className="size-4" />
              <span className="hidden sm:inline">{hub.focusNewReservation}</span>
              <ArrowRightIcon className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </button>
          </header>

          {/* ── Single-viewport grid: everything visible, no page scroll ── */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_288px]">
            {/* COL 1 — Revenue hero + Upcoming departures */}
            <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              {/* Revenue hero (compact) */}
              <Panel className="flex shrink-0 flex-col overflow-hidden">
                <div className="p-5 pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <SectionLabel>{heroLabel}</SectionLabel>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-[1.85rem] font-semibold leading-none tabular-nums tracking-tight text-gray-900 dark:text-white">
                          {loading ? (
                            <span className="block h-8 w-32 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
                          ) : (
                            heroValue
                          )}
                        </span>
                        {showFinance && trendPct != null && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-semibold tabular-nums ${
                              trendPct >= 0
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400"
                                : "bg-rose-50 text-rose-600 dark:bg-rose-500/[0.12] dark:text-rose-400"
                            }`}
                          >
                            {trendPct >= 0 ? (
                              <ArrowUpIcon className="size-3" />
                            ) : (
                              <ArrowDownIcon className="size-3" />
                            )}
                            {Math.abs(trendPct)}%
                            <span className="ml-0.5 font-normal text-gray-400 dark:text-gray-500">
                              {hub.trendVsPrev}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    {showFinance && (
                      <Link
                        to="/reports"
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                      >
                        {hub.viewAll}
                        <ArrowRightIcon className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-auto">
                  {loading ? (
                    <div className="mx-5 mb-5 h-[84px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />
                  ) : revenuePoints.length >= 4 ? (
                    <AreaChart points={revenuePoints} height={84} />
                  ) : (
                    <FlatBaseline label={hub.quietPeriod} height={84} />
                  )}
                </div>
              </Panel>

              {/* Upcoming departures — fills the column's remaining height */}
              <Panel className="flex min-h-0 flex-1 flex-col p-5">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-4">
                  <SectionLabel>{hub.upcomingTitle}</SectionLabel>
                  <Link
                    to="/departures"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                  >
                    {hub.viewAll}
                    <ArrowRightIcon className="size-3" />
                  </Link>
                </div>
                {loading ? (
                  <ul className="space-y-2.5 py-1">
                    {[0, 1, 2, 3].map((i) => (
                      <li key={i} className="flex items-center gap-3.5" aria-hidden>
                        <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-white/[0.06]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                          <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : upcoming.length === 0 ? (
                  <EmptyLine icon={CalenderIcon} label={hub.quietDepartures} />
                ) : (
                  <ul className="-mx-2 flex-1 overflow-y-auto">
                    {upcoming.map((d) => {
                      const pct =
                        d.seats > 0 ? Math.min(100, Math.round((d.booked / d.seats) * 100)) : 0;
                      const fill =
                        pct >= 90
                          ? "bg-rose-400 dark:bg-rose-500"
                          : pct >= 60
                            ? "bg-amber-400 dark:bg-amber-500"
                            : "bg-brand-500";
                      const pctText =
                        pct >= 90
                          ? "text-rose-500 dark:text-rose-400"
                          : pct >= 60
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-gray-700 dark:text-gray-300";
                      const dt = new Date(d.departAt);
                      return (
                        <li key={d.id}>
                          <Link
                            to={`/departures/${d.id}`}
                            className="group flex items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 transition-colors group-hover:border-brand-500/30 group-hover:bg-brand-500/[0.06] dark:border-white/[0.08] dark:bg-white/[0.03]">
                              <span className="text-sm font-semibold leading-none tabular-nums text-gray-900 dark:text-white">
                                {String(dt.getDate()).padStart(2, "0")}
                              </span>
                              <span className="mt-1 text-[0.5rem] uppercase leading-none text-gray-500 dark:text-gray-400">
                                {fmtMonthShort(dt, lang)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {d.label}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className="tabular-nums">{relativeDayLabel(d.departAt, lang)}</span>
                                {d.destination && (
                                  <>
                                    <span className="text-gray-300 dark:text-gray-700">·</span>
                                    <span className="truncate">{d.destination}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="hidden items-center gap-2.5 sm:flex">
                              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                                <div
                                  className={`h-full rounded-full ${fill}`}
                                  style={{ width: `${Math.max(3, pct)}%` }}
                                />
                              </div>
                              <span className={`w-9 text-right text-xs font-semibold tabular-nums ${pctText}`}>
                                {pct}%
                              </span>
                            </div>
                            <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            {/* COL 2 — KPI ledger + Outstanding payments */}
            <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              <Panel
                className={`flex flex-col divide-y divide-gray-100 dark:divide-white/[0.05] ${
                  showFinance ? "shrink-0" : "flex-1"
                }`}
              >
                {metrics.map((m) => (
                  <MetricRow key={m.href} metric={m} loading={loading} />
                ))}
              </Panel>

              {showFinance && (
                <Panel className="flex min-h-0 flex-1 flex-col p-5">
                  <div className="mb-2 flex shrink-0 items-center justify-between gap-4">
                    <SectionLabel>{hub.focusOutstanding}</SectionLabel>
                    <Link
                      to="/payments"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                    >
                      {hub.viewAll}
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </div>
                  {loading ? (
                    <ul className="space-y-2.5 py-1">
                      {[0, 1].map((i) => (
                        <li key={i} className="flex items-center gap-3" aria-hidden>
                          <div className="size-9 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-white/[0.06]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                            <div className="h-2.5 w-1/4 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : watchPayments.length === 0 ? (
                    <EmptyLine icon={CheckCircleIcon} label={hub.allSettled} />
                  ) : (
                    <ul className="-mx-2 flex-1 overflow-y-auto">
                      {watchPayments.slice(0, 3).map((p) => (
                        <li key={p.id}>
                          <Link
                            to={p.href}
                            className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/70 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/[0.08] dark:text-amber-400">
                              <DollarLineIcon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {p.customerName}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {p.packageName}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                                {p.amount}
                              </div>
                              {p.daysOpen > 0 && (
                                <div className="mt-0.5 text-[0.68rem] leading-none text-amber-500 dark:text-amber-400">
                                  {p.daysOpen}d
                                </div>
                              )}
                            </div>
                            <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
            </div>

            {/* COL 3 — Workspaces + Shortcuts (right rail) */}
            <aside className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              <Panel className="shrink-0 p-5 pb-4">
                <SectionLabel>{hub.workspacesTitle}</SectionLabel>
                <nav className="mt-3 flex flex-col gap-1">
                  {workspaces.map((s) => (
                    <Link
                      key={s.href}
                      to={s.href}
                      className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"
                    >
                      <span className="flex size-8 items-center justify-center rounded-lg bg-gray-100 text-gray-400 transition-colors group-hover:bg-brand-500 group-hover:text-white dark:bg-white/[0.05] dark:text-gray-500">
                        <s.icon className="size-4" />
                      </span>
                      <span className="text-[0.85rem] font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
                        {s.label}
                      </span>
                      <ArrowRightIcon className="ml-auto size-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                    </Link>
                  ))}
                </nav>
              </Panel>

              <Panel className="flex min-h-0 flex-1 flex-col p-5">
                <SectionLabel>{hub.shortcutsTitle}</SectionLabel>
                <nav className="mt-3 grid grid-cols-2 gap-2">
                  {shortcuts.map((s) => (
                    <Link
                      key={s.href}
                      to={s.href}
                      className="group flex flex-col gap-2 rounded-xl border border-gray-100 p-3 transition-all hover:-translate-y-0.5 hover:border-brand-500/30 hover:bg-brand-500/[0.04] hover:shadow-sm dark:border-white/[0.05] dark:hover:border-brand-500/25"
                    >
                      <s.icon className="size-[18px] text-gray-400 transition-colors group-hover:text-brand-500 dark:text-gray-500" />
                      <span className="text-xs font-medium leading-tight text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
                        {s.label}
                      </span>
                    </Link>
                  ))}
                </nav>
              </Panel>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};

export default HomeHub;
