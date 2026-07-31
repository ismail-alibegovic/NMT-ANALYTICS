import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { Panel, SectionLabel } from "../../components/common/PageShell";
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
  PlusIcon,
  CalenderIcon,
  DollarLineIcon,
  TableIcon,
  BoxIconLine,
  GridIcon,
  PieChartIcon,
  UserCircleIcon,
  GroupIcon,
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

const fmtCurrency = (n: number | null | undefined, lang: "bs" | "en" = "bs") => {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(lang === "bs" ? "bs-BA" : "en-US", {
      style: "currency",
      currency: "BAM",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString()} KM`;
  }
};

const fmtNumber = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("bs-BA").format(n);
};

const relativeDayLabel = (iso: string, lang: "bs" | "en") => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return lang === "bs" ? "Danas" : "Today";
  if (diff === 1) return lang === "bs" ? "Sutra" : "Tomorrow";
  if (diff === -1) return lang === "bs" ? "Jučer" : "Yesterday";
  if (diff > 1 && diff < 7)
    return date.toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { weekday: "long" });
  return date.toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { day: "2-digit", month: "short" });
};

/** Pure-SVG area chart — gradient fill, unique gradient id per instance, scales to viewBox. */
const AreaChart: React.FC<{
  points: number[];
  height?: number;
  stroke?: string;
  gradientId?: string;
}> = ({ points, height = 148, stroke = "#465fff", gradientId = "rev" }) => {
  const width = 640;
  if (!points.length) return null;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 1);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const pad = 10;
  const usableH = height - pad * 2;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((p - min) / span) * usableH;
    return [x, y] as const;
  });
  // Smooth path via Catmull-Rom → cubic bezier for a premium, non-jagged curve.
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
      className="overflow-visible"
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

/** Compact inline sparkline for KPI cards. */
const MiniSpark: React.FC<{ points: number[]; stroke?: string }> = ({ points, stroke = "#465fff" }) => {
  const width = 88;
  const height = 26;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.9} />
    </svg>
  );
};

type Kpi = {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  spark?: number[];
  icon: React.FC<{ className?: string }>;
};

const KpiCard: React.FC<{ kpi: Kpi; loading: boolean }> = ({ kpi, loading }) => {
  const Icon = kpi.icon;
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
        kpi.accent
          ? "border-brand-500/30 bg-brand-500 text-white shadow-lg shadow-brand-500/20 dark:border-brand-500/40"
          : "border-gray-200/70 bg-white shadow-sm shadow-gray-200/50 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none dark:hover:border-white/[0.14]"
      }`}
    >
      {kpi.accent && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/10 blur-2xl"
        />
      )}
      <div className="relative flex items-center justify-between">
        <span
          className={`flex size-9 items-center justify-center rounded-xl ${
            kpi.accent
              ? "bg-white/15 text-white"
              : "bg-gray-100 text-gray-400 group-hover:bg-brand-500/10 group-hover:text-brand-500 dark:bg-white/[0.05] dark:text-gray-500"
          } transition-colors`}
        >
          <Icon className="size-[18px]" />
        </span>
        {kpi.spark && kpi.spark.length > 1 && !loading && (
          <MiniSpark points={kpi.spark} stroke={kpi.accent ? "rgba(255,255,255,0.75)" : "#465fff"} />
        )}
      </div>
      {loading ? (
        <div className="relative mt-5 space-y-2">
          <div className={`h-8 w-24 animate-pulse rounded ${kpi.accent ? "bg-white/20" : "bg-gray-200 dark:bg-white/[0.06]"}`} />
          <div className={`h-3 w-20 animate-pulse rounded ${kpi.accent ? "bg-white/10" : "bg-gray-100 dark:bg-white/[0.04]"}`} />
        </div>
      ) : (
        <div className="relative mt-5">
          <p
            className={`text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${
              kpi.accent ? "text-white" : "text-gray-900 dark:text-white"
            }`}
          >
            {kpi.value}
          </p>
          <p className={`mt-2.5 text-[0.82rem] font-medium ${kpi.accent ? "text-white/85" : "text-gray-600 dark:text-gray-300"}`}>
            {kpi.label}
          </p>
          {kpi.hint && (
            <p className={`mt-0.5 text-[0.7rem] ${kpi.accent ? "text-white/55" : "text-gray-400 dark:text-gray-500"}`}>
              {kpi.hint}
            </p>
          )}
        </div>
      )}
    </div>
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

  const dateLine = now.toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const today = new Date();
        const todayISO = today.toISOString().split("T")[0];
        const fortnightAgo = new Date(today.getTime() - 14 * 86_400_000).toISOString().split("T")[0];

        const [ov, deps, rev, pays] = await Promise.allSettled([
          getAnalyticsOverviewV2({ from: fortnightAgo, to: todayISO }),
          getDepartures({ status: "active", dateFrom: todayISO, limit: 5 }),
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

  const kpis: Kpi[] = useMemo(() => {
    if (!overview) return [];
    const list: Kpi[] = [
      {
        label: hub.kpiReservations,
        value: fmtNumber(overview.reservations_count),
        hint: hub.kpiReservationsHint,
        icon: TableIcon,
      },
    ];
    if (showFinance) {
      list.push(
        {
          label: hub.revenuePanel,
          value: fmtCurrency(overview.total_paid_sum, lang),
          hint: hub.revenuePanelHint,
          accent: true,
          spark: revenuePoints,
          icon: DollarLineIcon,
        },
        {
          label: hub.kpiRevenue,
          value: fmtCurrency(overview.total_amount_sum, lang),
          hint: hub.kpiRevenueHint,
          icon: PieChartIcon,
        },
        {
          label: hub.kpiOutstanding,
          value: fmtCurrency(overview.total_balance_sum, lang),
          hint: hub.kpiOutstandingHint,
          icon: BoxIconLine,
        }
      );
    } else {
      list.push({
        label: hub.recentDepartures,
        value: fmtNumber(upcoming.length),
        hint: hub.revenuePanelHint,
        icon: CalenderIcon,
      });
    }
    return list;
  }, [overview, showFinance, lang, revenuePoints, upcoming.length, hub]);

  const startRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <PageMeta title={`Travline — ${hub.title}`} description={hub.subtitle} />

      {/* Ambient accent glow anchored to the masthead — gives the page depth without a hero image */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-brand-500/[0.07] via-brand-500/[0.02] to-transparent dark:from-brand-500/[0.12] dark:via-brand-500/[0.03]"
        />

        <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-9 md:px-8 md:pt-12">
          {/* ── Masthead ─────────────────────────────────────────────────── */}
          <header className="mb-9 flex flex-col gap-6 md:mb-11 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-brand-500 text-[0.7rem] font-bold text-white shadow-sm shadow-brand-500/30">
                  {(orgName || "T").charAt(0).toUpperCase()}
                </span>
                <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                  {orgName || "Travline"}
                </p>
              </div>
              <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-tight text-gray-900 dark:text-white md:text-[2.75rem]">
                {greeting}
                <span className="text-brand-500">.</span>
              </h1>
              <p className="mt-2.5 text-sm capitalize text-gray-500 dark:text-gray-400">{dateLine}</p>
            </div>
            <button
              ref={startRef}
              onClick={() => navigate("/reservations?new=1")}
              className="group inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-600 hover:shadow-brand-500/35 active:translate-y-px md:self-auto"
            >
              <PlusIcon className="size-4" />
              {hub.focusNewReservation}
              <ArrowRightIcon className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </button>
          </header>

          {/* ── KPI row ───────────────────────────────────────────────────── */}
          <div className="mb-8 grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
            {(kpis.length > 0 ? kpis : Array.from({ length: showFinance ? 4 : 2 })).map((k, i) =>
              kpis.length > 0 ? (
                <KpiCard key={(k as Kpi).label} kpi={k as Kpi} loading={loading} />
              ) : (
                <div
                  key={i}
                  className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm shadow-gray-200/40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none"
                >
                  <div className="size-9 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]" />
                  <div className="mt-5 h-8 w-24 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                  <div className="mt-2.5 h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                </div>
              )
            )}
          </div>

          {/* ── Working surface ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_352px]">
            {/* LEFT */}
            <section className="min-w-0 space-y-5">
              {/* Revenue trend */}
              {showFinance && (
                <Panel>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <SectionLabel>{hub.revenuePanel}</SectionLabel>
                      <p className="mt-2.5 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {fmtCurrency(paidTotal, lang)}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[0.68rem] font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                      {hub.revenuePanelHint}
                    </span>
                  </div>
                  <div className="mt-5">
                    {revenuePoints.length > 1 ? (
                      <AreaChart points={revenuePoints} gradientId="hub-rev" />
                    ) : loading ? (
                      <div className="h-[148px] w-full animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />
                    ) : (
                      <div className="flex h-[148px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 text-center dark:border-white/[0.08]">
                        <DollarLineIcon className="size-5 text-gray-300 dark:text-gray-600" />
                        <span className="text-sm text-gray-400 dark:text-gray-500">{hub.noData}</span>
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              {/* Upcoming departures */}
              <Panel>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <SectionLabel>{hub.recentDepartures}</SectionLabel>
                  <Link
                    to="/departures"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                  >
                    {hub.viewAll}
                    <ArrowRightIcon className="size-3" />
                  </Link>
                </div>

                {loading ? (
                  <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="flex items-center gap-4 py-3.5" aria-hidden>
                        <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-white/[0.06]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                          <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                        </div>
                        <div className="h-6 w-12 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                      </li>
                    ))}
                  </ul>
                ) : upcoming.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 px-5 py-12 text-center dark:border-white/[0.08]">
                    <CalenderIcon className="size-6 text-gray-300 dark:text-gray-600" />
                    <span className="text-sm text-gray-400 dark:text-gray-500">{hub.noDepartures}</span>
                  </div>
                ) : (
                  <ul className="-mx-2 space-y-0.5">
                    {upcoming.map((d) => {
                      const pct = d.seats > 0 ? Math.round((d.booked / d.seats) * 100) : 0;
                      const fill = pct >= 95 ? "bg-rose-500" : pct >= 75 ? "bg-brand-500" : "bg-emerald-500";
                      const pctText =
                        pct >= 95 ? "text-rose-500" : pct >= 75 ? "text-brand-500" : "text-emerald-500";
                      return (
                        <li key={d.id}>
                          <Link
                            to={`/departures/${d.id}`}
                            className="group flex items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 transition-colors group-hover:border-brand-500/30 group-hover:bg-brand-500/[0.06] dark:border-white/[0.08] dark:bg-white/[0.03]">
                              <span className="text-sm font-semibold leading-none tabular-nums text-gray-900 dark:text-white">
                                {new Date(d.departAt).toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { day: "2-digit" })}
                              </span>
                              <span className="mt-1 text-[0.55rem] uppercase leading-none text-gray-500 dark:text-gray-400">
                                {new Date(d.departAt).toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { month: "short" })}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{d.label}</div>
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
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
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                                <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(3, pct)}%` }} />
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
            </section>

            {/* RIGHT */}
            <aside className="space-y-5">
              {/* Outstanding balances */}
              {showFinance && (
                <Panel>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <SectionLabel>{hub.focusOutstanding}</SectionLabel>
                    <Link
                      to="/payments"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                    >
                      {hub.focusOutstandingCta}
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </div>
                  {watchPayments.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 px-5 py-10 text-center dark:border-white/[0.08]">
                      {loading ? (
                        <span className="text-sm text-gray-400 dark:text-gray-500">…</span>
                      ) : (
                        <>
                          <BoxIconLine className="size-5 text-gray-300 dark:text-gray-600" />
                          <span className="text-sm text-gray-400 dark:text-gray-500">{hub.noData}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <ul className="-mx-2 space-y-0.5">
                      {watchPayments.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={p.href}
                            className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/70 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/[0.08] dark:text-amber-400">
                              <DollarLineIcon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{p.customerName}</div>
                              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{p.packageName}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{p.amount}</div>
                              {p.daysOpen > 0 && (
                                <div className="mt-0.5 text-[0.7rem] leading-none text-amber-500 dark:text-amber-400">{p.daysOpen}d</div>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {/* Workspaces */}
              <Panel>
                <SectionLabel>{hub.workspacesTitle}</SectionLabel>
                <nav className="mt-3 flex flex-col gap-1">
                  {[
                    { label: hub.salesTitle, href: "/sales", icon: GridIcon, minRole: "agent" as UserRole },
                    { label: hub.opsTitle, href: "/operations", icon: BoxIconLine, minRole: "agent" as UserRole },
                    { label: hub.finTitle, href: "/payments", icon: PieChartIcon, minRole: "manager" as UserRole },
                  ]
                    .filter((s) => !s.minRole || hasAccess(s.minRole, role))
                    .map((s) => (
                      <Link
                        key={s.href}
                        to={s.href}
                        className="group flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 transition-all hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.03]"
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-gray-100 text-gray-400 transition-colors group-hover:bg-brand-500 group-hover:text-white dark:bg-white/[0.05] dark:text-gray-500">
                          <s.icon className="size-[18px]" />
                        </span>
                        <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
                          {s.label}
                        </span>
                        <ArrowRightIcon className="ml-auto size-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                      </Link>
                    ))}
                </nav>
              </Panel>

              {/* Shortcuts */}
              <Panel>
                <SectionLabel>{hub.shortcutsTitle}</SectionLabel>
                <nav className="mt-3 grid grid-cols-2 gap-2.5">
                  {[
                    { label: hub.sReservations, href: "/reservations", icon: TableIcon },
                    { label: hub.sPackages, href: "/packages", icon: BoxIconLine },
                    { label: hub.sCalendar, href: "/operations/calendar", icon: CalenderIcon },
                    { label: hub.sCustomers, href: "/customers", icon: GroupIcon },
                    { label: hub.sReports, href: "/reports", icon: PieChartIcon, minRole: "manager" as UserRole },
                    { label: hub.sBranding, href: "/settings", icon: UserCircleIcon, minRole: "director" as UserRole },
                  ]
                    .filter((s) => !s.minRole || hasAccess(s.minRole, role))
                    .map((s) => (
                      <Link
                        key={s.href}
                        to={s.href}
                        className="group flex flex-col gap-2.5 rounded-xl border border-gray-100 p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-500/30 hover:bg-brand-500/[0.04] hover:shadow-sm dark:border-white/[0.05] dark:hover:border-brand-500/25"
                      >
                        <s.icon className="size-[18px] text-gray-400 transition-colors group-hover:text-brand-500 dark:text-gray-500" />
                        <span className="text-xs font-medium text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
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
