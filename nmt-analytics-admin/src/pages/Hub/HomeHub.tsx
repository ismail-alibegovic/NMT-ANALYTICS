import { useEffect, useMemo, useRef, useState } from "react";
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
  PlusIcon,
  CalenderIcon,
  DollarLineIcon,
  TableIcon,
  BoxIconLine,
  GridIcon,
  PieChartIcon,
  UserCircleIcon,
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

/** Pure-SVG sparkline — no chart library, GPU-friendly strokes, scales to its viewBox. */
const Sparkline: React.FC<{
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}> = ({ points, width = 240, height = 56, stroke = "#465fff", fill = "rgba(70,95,255,0.10)" }) => {
  if (!points.length) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const pad = 4;
  const usableH = height - pad * 2;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((p - min) / span) * usableH;
    return [x, y] as const;
  });
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
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
    >
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mb-5 font-outfit text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
    {children}
  </h2>
);

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

  // Auto-greeting based on local hour
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return hub.good_night;
    if (h < 12) return hub.good_morning;
    if (h < 18) return hub.good_afternoon;
    return hub.good_evening;
  }, [hub.good_night, hub.good_morning, hub.good_afternoon, hub.good_evening]);

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
    () => departures.slice(0, 4).map((d) => ({
      id: d.id,
      label: d.packages?.name || d.packageName || d.destination || hub.untitledDeparture,
      destination: d.packages?.destination || d.destination || "",
      departAt: d.depart_at,
      seats: d.capacity || 0,
      booked: d.booked || 0,
    })),
    [departures, hub.untitledDeparture]
  );

  const revenuePoints = useMemo(
    () => revenue.map((p) => p.total_paid_sum || 0).filter((v) => v > 0 || true),
    [revenue]
  );
  const paidTotal = useMemo(
    () => revenue.reduce((acc, p) => acc + (p.total_paid_sum || 0), 0),
    [revenue]
  );

  const primaryStats = overview
    ? [
        { label: hub.kpiReservations, value: fmtNumber(overview.reservations_count) },
        ...(showFinance
          ? [
              { label: hub.kpiRevenue, value: fmtCurrency(overview.total_amount_sum, lang) },
              { label: hub.kpiOutstanding, value: fmtCurrency(overview.total_balance_sum, lang) },
            ]
          : []),
      ]
    : [];

  const startRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <PageMeta title={`Travline — ${hub.title}`} description={hub.subtitle} />

      <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-8 md:px-8 md:pt-10">
        {/* ── Quiet masthead ─────────────────────────────────────────────── */}
        <header className="mb-10 flex flex-col gap-5 md:mb-14 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="mb-2.5 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              {orgName || "Travline"}
            </p>
            <h1 className="font-outfit text-[1.875rem] font-semibold leading-[1.1] tracking-tight text-gray-900 dark:text-white md:text-[2.4rem]">
              {greeting}
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {hub.subtitle}
            </p>
          </div>
          <button
            ref={startRef}
            onClick={() => navigate("/reservations?new=1")}
            className="group inline-flex shrink-0 items-center gap-2 self-start rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-gray-700 active:translate-y-px dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 md:self-auto"
          >
            <PlusIcon className="size-4" />
            {hub.focusNewReservation}
          </button>
        </header>

        {/* ── Two-column working surface ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* LEFT: live operational surface */}
          <section className="min-w-0 space-y-12">
            {/* Revenue sparkline (finance only) */}
            {showFinance && (
              <div>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <SectionLabel>{hub.revenuePanel}</SectionLabel>
                  <p className="font-outfit text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    {fmtCurrency(paidTotal, lang)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
                  {revenuePoints.length > 1 ? (
                    <Sparkline points={revenuePoints} />
                  ) : loading ? (
                    <div className="h-14 w-full animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                  ) : (
                    <p className="font-outfit text-sm text-gray-400 dark:text-gray-500">
                      {hub.revenuePanelHint} · {hub.noData}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{hub.revenuePanelHint}</p>
                </div>
              </div>
            )}

            {/* Upcoming departures */}
            <div>
              <div className="mb-5 flex items-end justify-between gap-4">
                <SectionLabel>{hub.recentDepartures}</SectionLabel>
                <Link
                  to="/departures"
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  {hub.viewAll}
                  <ArrowRightIcon className="size-3" />
                </Link>
              </div>

              {loading ? (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-4 py-4" aria-hidden>
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-gray-200 dark:bg-white/[0.06]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                      </div>
                      <div className="h-6 w-12 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                    </li>
                  ))}
                </ul>
              ) : upcoming.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-5 py-12 text-center text-sm text-gray-400 dark:border-gray-800 dark:text-gray-500">
                  {hub.noDepartures}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {upcoming.map((d) => {
                    const pct = d.seats > 0 ? Math.round((d.booked / d.seats) * 100) : 0;
                    const fill = pct >= 95 ? "bg-rose-500" : pct >= 75 ? "bg-[#465fff]" : "bg-gray-400 dark:bg-gray-500";
                    return (
                      <li key={d.id}>
                        <Link to={`/departures/${d.id}`} className="group flex items-center gap-4 py-4 transition-colors">
                          <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]">
                            <span className="text-xs font-semibold leading-none tabular-nums text-gray-900 dark:text-white">
                              {new Date(d.departAt).toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { day: "2-digit" })}
                            </span>
                            <span className="mt-1 text-[0.55rem] uppercase leading-none text-gray-500 dark:text-gray-400">
                              {new Date(d.departAt).toLocaleDateString(lang === "bs" ? "bs-BA" : "en-US", { month: "short" })}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{d.label}</div>
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
                          <div className="hidden items-center gap-2 sm:flex">
                            <div className="h-1 w-14 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.05]">
                              <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(2, pct)}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">{pct}%</span>
                          </div>
                          <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-300" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Outstanding balances (finance only) */}
            {showFinance && (
              <div>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <SectionLabel>{hub.focusOutstanding}</SectionLabel>
                  <Link
                    to="/payments"
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    {hub.focusOutstandingCta}
                    <ArrowRightIcon className="size-3" />
                  </Link>
                </div>
                {watchPayments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:text-gray-500">
                    {loading ? "…" : hub.noData}
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
                    {watchPayments.map((p) => (
                      <li key={p.id}>
                        <Link to={p.href} className="group flex items-center gap-4 py-4 transition-colors">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.04]">
                            <DollarLineIcon className="size-4 text-gray-400 dark:text-gray-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{p.customerName}</div>
                            <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{p.packageName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{p.amount}</div>
                            {p.daysOpen > 0 && (
                              <div className="mt-1 text-[0.7rem] leading-none text-gray-400 dark:text-gray-500">{p.daysOpen}d</div>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* RIGHT: org glance, workspaces, shortcuts */}
          <aside className="space-y-12">
            {primaryStats.length > 0 ? (
              <div>
                <SectionLabel>{hub.kpis}</SectionLabel>
                <dl className="space-y-4">
                  {primaryStats.map((s) => (
                    <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-gray-100 pb-4 last:border-0 dark:border-gray-800/60">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">{s.label}</dt>
                      <dd className="font-outfit text-xl font-semibold tabular-nums text-gray-900 dark:text-white">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                <div className="h-6 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                <div className="h-6 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
              </div>
            )}

            <div>
              <SectionLabel>{hub.workspacesTitle}</SectionLabel>
              <nav className="flex flex-col gap-px">
                {[
                  { label: hub.salesTitle, href: "/sales", icon: GridIcon, minRole: "agent" as UserRole },
                  { label: hub.opsTitle, href: "/operations", icon: BoxIconLine, minRole: "agent" as UserRole },
                  { label: hub.finTitle, href: "/payments", icon: PieChartIcon, minRole: "manager" as UserRole },
                ]
                  .filter((s) => !s.minRole || hasAccess(s.minRole, role))
                  .map((s) => (
                    <Link key={s.href} to={s.href} className="group flex items-center gap-3 py-2.5 transition-colors">
                      <s.icon className="size-4 text-gray-400 transition-colors group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300" />
                      <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">{s.label}</span>
                      <ArrowRightIcon className="ml-auto size-3.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                    </Link>
                  ))}
              </nav>
            </div>

            <div>
              <SectionLabel>{hub.shortcutsTitle}</SectionLabel>
              <nav className="flex flex-col gap-px">
                {[
                  { label: hub.sReservations, href: "/reservations", icon: TableIcon },
                  { label: hub.sPackages, href: "/packages", icon: BoxIconLine },
                  { label: hub.sCalendar, href: "/operations/calendar", icon: CalenderIcon },
                  { label: hub.sCustomers, href: "/customers", icon: UserCircleIcon },
                  { label: hub.sReports, href: "/reports", icon: PieChartIcon, minRole: "manager" as UserRole },
                  { label: hub.sBranding, href: "/settings", icon: GridIcon, minRole: "director" as UserRole },
                ]
                  .filter((s) => !s.minRole || hasAccess(s.minRole, role))
                  .map((s) => (
                    <Link key={s.href} to={s.href} className="group flex items-center gap-3 py-2.5 transition-colors">
                      <s.icon className="size-4 text-gray-400 transition-colors group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300" />
                      <span className="text-sm text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">{s.label}</span>
                      <ArrowRightIcon className="ml-auto size-3.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                    </Link>
                  ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
};

export default HomeHub;
