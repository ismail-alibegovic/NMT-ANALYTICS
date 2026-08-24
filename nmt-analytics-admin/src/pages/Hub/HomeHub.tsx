import QuickStart from "../../components/hub/QuickStart";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  getAnalyticsOverviewV2,
  getRevenueSeries,
  type OverviewAnalyticsV2,
  type RevenueSeriesDataPoint,
} from "../../api/analytics";
import { generateRoomingProposal, getDeparture, getDeparturePassengers, getDepartures } from "../../api/departures";
import { getReservations, type Reservation } from "../../api/reservations";
import { getPaymentDashboard, type PaymentDashboardMetric } from "../../api/payments";
import {
  ArrowRightIcon,
  PlusIcon,
  CalenderIcon,
  DollarLineIcon,
  TableIcon,
  BoxIconLine,
  PieChartIcon,
  UserCircleIcon,
  GroupIcon,
  CheckCircleIcon,
  LockIcon,
  FileIcon,
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { hasAccess, UserRole } from "../../types/roles";
import { useT } from "../../lib/i18n/context";
import { logger } from "../../utils/logger";
import { useQuickCreate } from "../../context/QuickCreateContext";

type PaymentRow = {
  id: string;
  customerName: string;
  packageName: string;
  amount: string;
  daysOpen: number;
  href: string;
};

type TodayWorkItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "reservation" | "departure" | "occupancy" | "payment";
  urgency: "urgent" | "attention" | "normal";
};

type ReadinessAlert = {
  id: string;
  departureId: string;
  departureLabel: string;
  label: string;
  urgency: "urgent" | "attention";
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

const fmtCompact = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return "\u2014";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
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

/* ───────────────────────── Neumorphic primitives ───────────────────────── */

/**
 * Soft neumorphic elevation. The signature look: a card lifted off a
 * slightly-off-white canvas by two opposing soft shadows — a light one from
 * the top-left, a cool grey-blue one from the bottom-right — with a faint
 * inner top-left highlight for the "pressed-from-above" depth cue. No hard
 * borders. Dark mode inverts to a deeper slate canvas with velvet shadows.
 */
const neuCard =
  "relative rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";

/** Inset neumorphic well — for inputs, pressed tiles, chart wells. */
const neuInset =
  "rounded-lg bg-gray-100 dark:bg-gray-800";

/** Raised neumorphic icon tile — a small "popped" button on the canvas. */
const neuTile =
  "rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div className={`relative ${neuCard} ${className}`}>{children}</div>
);

const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <h2
    className={`text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 ${className}`}
  >
    {children}
  </h2>
);

/* ───────────────────────── Charts ───────────────────────── */

/**
 * Combo chart for the BOOKINGS panel: soft bars (gross reservation value) +
 * a smooth line on top (paid revenue). Shared y-scale so the line reads
 * against the bars without a second axis.
 */
const ComboChart: React.FC<{
  bars: number[];
  line: number[];
  height?: number;
  barColor?: string;
  lineColor?: string;
}> = ({ bars, line, height = 96, barColor = "#c7cfe0", lineColor = "#465fff" }) => {
  const width = 640;
  const n = Math.max(bars.length, line.length);
  if (!n) return null;
  const all = [...bars, ...line].filter((v) => Number.isFinite(v));
  const max = Math.max(...all, 1);
  const slot = width / n;
  const barW = Math.min(10, slot * 0.46);
  const topPad = 12;
  const usableH = height - topPad - 2;

  const lineCoords = line.map((p, i) => {
    const x = (i + 0.5) * slot;
    const y = topPad + usableH - (Number.isFinite(p) ? (p / max) * usableH : usableH);
    return [x, y] as const;
  });
  const linePath = lineCoords.reduce((acc, c, i, arr) => {
    if (i === 0) return `M${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    const p0 = arr[i - 1];
    const cp1x = p0[0] + (c[0] - p0[0]) / 2;
    return `${acc} C${cp1x.toFixed(1)},${p0[1].toFixed(1)} ${cp1x.toFixed(1)},${c[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }, "");
  const last = lineCoords[lineCoords.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Bookings trend" className="block w-full">
      <defs>
        <linearGradient id="bookLine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {bars.map((b, i) => {
        const h = Number.isFinite(b) ? Math.max(2, (b / max) * usableH) : 2;
        const x = (i + 0.5) * slot - barW / 2;
        const y = topPad + usableH - h;
        return <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width={barW} height={h.toFixed(1)} rx={3} fill={barColor} />;
      })}
      {lineCoords.length > 1 && (
        <>
          <path d={`${linePath} L${width},${height} L0,${height} Z`} fill="url(#bookLine)" stroke="none" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={last[0]} cy={last[1]} r={4.5} fill={lineColor} />
          <circle cx={last[0]} cy={last[1]} r={2} fill="#fff" />
        </>
      )}
    </svg>
  );
};

/** A slim rounded progress bar with a soft track + filled portion. */
const ProgressBar: React.FC<{ pct: number; tone?: "brand" | "warm" }> = ({
  pct,
  tone = "brand",
}) => (
  <div className={`h-1.5 w-full overflow-hidden rounded-full ${neuInset}`}>
    <div
      className={`h-full rounded-full transition-[width] duration-500 ${
        tone === "warm"
          ? "bg-amber-500"
          : "bg-brand-500"
      }`}
      style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
    />
  </div>
);

/* ───────────────────────── HomeHub ───────────────────────── */

const HomeHub: React.FC = () => {
  const { userContext } = useApp();
  const { t, lang } = useT();
  const hub = t.hub;
  const { openQuickCreate } = useQuickCreate();

  const [overview, setOverview] = useState<OverviewAnalyticsV2 | null>(null);
  const [departures, setDepartures] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<RevenueSeriesDataPoint[]>([]);
  const [watchPayments, setWatchPayments] = useState<PaymentRow[]>([]);
  const [pendingReservations, setPendingReservations] = useState(0);
  const [pendingReservationRows, setPendingReservationRows] = useState<Reservation[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueReservations, setOverdueReservations] = useState<PaymentDashboardMetric[]>([]);
  const [readinessAlerts, setReadinessAlerts] = useState<ReadinessAlert[]>([]);
  const [queueError, setQueueError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookingsTab, setBookingsTab] = useState<"upcoming" | "past">("upcoming");

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

        const [ov, deps, rev, paymentsDashboard, pending] = await Promise.allSettled([
          getAnalyticsOverviewV2({ from: fortnightAgo, to: todayISO }),
          getDepartures({ status: "active", dateFrom: todayISO, limit: 12 }),
          getRevenueSeries({ from: fortnightAgo, to: todayISO, bucket: "daily" }),
          showFinance ? getPaymentDashboard() : Promise.resolve(null),
          getReservations({ status: "pending", limit: 3 }),
        ]);

        if (!active) return;
        if (ov.status === "fulfilled") setOverview(ov.value);
        if (deps.status === "fulfilled") setDepartures((deps.value as any)?.data || []);
        if (deps.status === "fulfilled") {
          const departureRows = ((deps.value as any)?.data || []) as any[];
          const nearDepartureRows = departureRows
            .filter((departure) => {
              const departureTime = new Date(departure.depart_at).getTime();
              const nowTime = Date.now();
              return departureTime >= nowTime - 86_400_000 && departureTime <= nowTime + 7 * 86_400_000;
            })
            .slice(0, 6);

          const readinessResults = await Promise.all(
            nearDepartureRows.map(async (departure) => {
              try {
                const detail = await getDeparture(departure.id);
                const alerts: ReadinessAlert[] = [];
                const departureLabel =
                  detail.packages?.name || detail.packageName || detail.destination || hub.untitledDeparture;

                if (detail.capabilities?.hasFlight && !detail.capabilities?.flightConfigured) {
                  alerts.push({
                    id: `flight-${detail.id}`,
                    departureId: detail.id,
                    departureLabel,
                    label: hub.alertFlightMissing,
                    urgency: "urgent",
                  });
                }

                if (detail.capabilities?.needTravelDocuments) {
                  // ponytail: reuses the /passengers endpoint's server-side readiness
                  // summary instead of duplicating the calculation client-side.
                  try {
                    const manifest = await getDeparturePassengers(detail.id);
                    const attentionCount = manifest.documentReadiness?.missing || 0;
                    if (attentionCount > 0) {
                      alerts.push({
                        id: `documents-${detail.id}`,
                        departureId: detail.id,
                        departureLabel,
                        label: hub.alertDocumentsAttention.replace("{count}", String(attentionCount)),
                        urgency: "urgent",
                      });
                    }
                  } catch {
                    // manifest unavailable - skip documents alert rather than block other alerts
                  }
                }

                if (detail.capabilities?.hasAccommodation && showFinance) {
                  // ponytail: proposal endpoint is manager-gated - agent/viewer roles
                  // silently get no rooming alerts; upgrade path is a readiness summary
                  // endpoint readable by all roles.
                  const roomingSignals = new Set<string>();
                  if ((detail.accommodationBuildings?.length || 0) === 0) {
                    // No buildings configured at all - that IS the unconfigured signal;
                    // the proposal engine can't distinguish it from "configured but
                    // nothing placeable".
                    roomingSignals.add(hub.alertRoomingMissingConfig);
                  } else {
                    try {
                      const proposal = await generateRoomingProposal(detail.id);
                      const groupIssues = proposal.groupResults.filter(
                        (group) => group.status === "split" || group.status === "partial"
                      ).length;
                      if (groupIssues > 0) {
                        roomingSignals.add(
                          hub.alertGroupSplit.replace("{count}", String(groupIssues))
                        );
                      }
                      const unplacedCount = proposal.unplaced?.length || 0;
                      if (unplacedCount > 0) {
                        roomingSignals.add(
                          hub.alertRoomingUnassigned.replace("{count}", String(unplacedCount))
                        );
                      }
                    } catch {
                      // manager-gated endpoint - non-manager roles simply get no rooming alerts
                    }
                  }

                  roomingSignals.forEach((label) => {
                    alerts.push({
                      id: `${detail.id}-${label}`,
                      departureId: detail.id,
                      departureLabel,
                      label,
                      urgency: "attention",
                    });
                  });
                }

                return alerts;
              } catch (error) {
                logger.error("[HomeHub] readiness detail failed", error);
                return [];
              }
            })
          );

          if (active) {
            setReadinessAlerts(readinessResults.flat().slice(0, 4));
          }
        }
        if (rev.status === "fulfilled") setRevenue(rev.value || []);
        if (pending.status === "fulfilled") {
          setPendingReservations(pending.value.total);
          setPendingReservationRows(pending.value.data || []);
        }
        setQueueError(
          deps.status === "rejected" ||
          pending.status === "rejected" ||
          (showFinance && paymentsDashboard.status === "rejected")
        );
        [ov, deps, rev, paymentsDashboard, pending].forEach((result) => {
          if (result.status === "rejected") logger.error("[HomeHub] partial load failed", result.reason);
        });
        if (paymentsDashboard.status === "fulfilled" && paymentsDashboard.value) {
          setOverdueCount(paymentsDashboard.value.metrics.overdueCount || 0);
          setOverdueReservations(paymentsDashboard.value.overdueReservations || []);
          const rows = (paymentsDashboard.value.overdueReservations || [])
            .slice(0, 4)
            .map((r) => {
              const departureDate = new Date(r.departureDate);
              const daysOpen = Number.isNaN(departureDate.getTime())
                ? 0
                : Math.max(0, Math.round((Date.now() - departureDate.getTime()) / 86_400_000));
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

  const allDepartures = useMemo(
    () =>
      departures.map((d) => ({
        id: d.id,
        label: d.packages?.name || d.packageName || d.destination || hub.untitledDeparture,
        destination: d.packages?.destination || d.destination || "",
        departAt: d.depart_at,
        seats: d.capacity || 0,
        booked: d.booked || 0,
      })),
    [departures, hub.untitledDeparture]
  );

  const upcoming = useMemo(
    () => allDepartures.filter((d) => new Date(d.departAt).getTime() >= now.getTime() - 86_400_000).slice(0, 4),
    [allDepartures, now]
  );
  const past = useMemo(
    () => allDepartures.filter((d) => new Date(d.departAt).getTime() < now.getTime() - 86_400_000).slice(0, 4),
    [allDepartures, now]
  );

  const revenuePoints = useMemo(() => revenue.map((p) => p.total_paid_sum || 0), [revenue]);
  const grossPoints = useMemo(() => revenue.map((p) => p.total_amount_sum || 0), [revenue]);
  const openBalance = overview?.total_balance_sum || 0;
  const activeCount = overview?.reservations_count || 0;
  const paidCount = overview?.paid_count || 0;

  const workspaces = [
    { label: hub.finTitle, href: "/payments", icon: PieChartIcon, minRole: "manager" as UserRole },
    { label: hub.sysTitle, href: "/admin/audit-logs", icon: LockIcon, minRole: "director" as UserRole },
  ].filter((s) => hasAccess(s.minRole, role));

  const shortcuts = [
    { label: hub.sReservations, href: "/reservations", icon: TableIcon },
    { label: hub.sPackages, href: "/packages", icon: BoxIconLine },
    { label: hub.sCalendar, href: "/operations/calendar", icon: CalenderIcon },
    { label: hub.sCustomers, href: "/customers", icon: GroupIcon },
    { label: hub.sReports, href: "/reports", icon: PieChartIcon, minRole: "manager" as UserRole },
    { label: hub.sBranding, href: "/settings", icon: UserCircleIcon, minRole: "director" as UserRole },
  ].filter((s) => !s.minRole || hasAccess(s.minRole, role));

  const bookingsList = bookingsTab === "upcoming" ? upcoming : past;
  const nearDepartures = useMemo(
    () =>
      allDepartures.filter((departure) => {
        const departureTime = new Date(departure.departAt).getTime();
        const nowTime = Date.now();
        return departureTime >= nowTime - 86_400_000 && departureTime <= nowTime + 7 * 86_400_000;
      }),
    [allDepartures]
  );

  const todayWork = useMemo<TodayWorkItem[]>(() => {
    if (loading) return [];
    const items: TodayWorkItem[] = [];
    pendingReservationRows.slice(0, 2).forEach((reservation) => {
      items.push({
        id: `pending-${reservation.id}`,
        title: reservation.customerName,
        detail: reservation.packageName || hub.todayPendingReservations,
        href: `/reservations/${reservation.id}`,
        kind: "reservation",
        urgency: "urgent",
      });
    });
    if (showFinance) {
      overdueReservations.slice(0, 2).forEach((reservation) => {
        items.push({
          id: `overdue-${reservation.id}`,
          title: reservation.customerName,
          detail: `${reservation.packageName} · ${fmtCurrency(reservation.balanceDue, lang)}`,
          href: `/reservations/${reservation.id}`,
          kind: "payment",
          urgency: "attention",
        });
      });
    }
    readinessAlerts.forEach((alert) => {
      items.push({
        id: alert.id,
        title: alert.departureLabel,
        detail: alert.label,
        href: `/departures/${alert.departureId}`,
        kind: "departure",
        urgency: alert.urgency,
      });
    });
    if (readinessAlerts.length === 0) {
      nearDepartures.slice(0, 2).forEach((departure) => {
        items.push({
          id: `departure-${departure.id}`,
          title: departure.label,
          detail: relativeDayLabel(departure.departAt, lang),
          href: `/departures/${departure.id}`,
          kind: "departure",
          urgency: "normal",
        });
      });
    }
    return items.slice(0, 6);
  }, [hub.todayPendingReservations, lang, loading, nearDepartures, overdueReservations, pendingReservationRows, readinessAlerts, showFinance]);
  const isNewOrg = !loading && overview?.reservations_count === 0 && departures.length === 0;
  return (
    <>
      <PageMeta title={`Travline — ${hub.title}`} description={hub.subtitle} />

      <div className="mx-auto flex min-h-[calc(100dvh-65px)] w-full max-w-[1380px] flex-col px-4 py-5 md:px-6 md:py-6 lg:h-[calc(100dvh-130px)] lg:min-h-0 lg:overflow-hidden">
          {/* ── Masthead ─────────────────────────────────────────────── */}
          <header className="mb-5 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className={`relative inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white`}
                
              >
                {(orgName || "T").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-2xl font-semibold leading-tight tracking-tight text-gray-800 dark:text-white sm:text-[1.7rem]">
                  <span>
                    {greeting}
                    <span className="text-brand-500">.</span>
                  </span>
                  <span className="text-[0.82rem] font-normal capitalize text-gray-400 dark:text-gray-500">
                    {dateLine}
                  </span>
                </h1>
                <p className="mt-0.5 truncate text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:text-gray-500">
                  {orgName || "Travline"} · {hub.title}
                </p>
              </div>
            </div>
            <button
              onClick={openQuickCreate}
              aria-label={hub.focusNewReservation}
              className="group inline-flex size-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:translate-y-px sm:h-auto sm:w-auto sm:px-5 sm:py-3"
            >
              <span className="text-xl leading-none sm:hidden">+</span>
              <PlusIcon className="hidden size-4 sm:block" />
              <span className="hidden sm:inline">{hub.focusNewReservation}</span>
              <ArrowRightIcon className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </button>
          </header>

          {/* ── Single-viewport 3-column grid ───────────────────────── */}
          {isNewOrg ? <QuickStart /> : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.05fr)_300px] lg:overflow-hidden">
            {/* ════ COL 1 — Today's work + Departures ════ */}
            <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
              <Panel className="flex shrink-0 flex-col overflow-hidden p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>{hub.needsAttentionTitle || hub.todayQueueTitle}</SectionLabel>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hub.needsAttentionSubtitle || hub.todayQueueSubtitle}</p>
                  </div>
                  {!loading && !queueError && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      {todayWork.length}
                    </span>
                  )}
                </div>
                {!loading && !queueError && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Link to="/reservations?status=pending" className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      {hub.todayPendingReservations}: {fmtNumber(pendingReservations, lang)}
                    </Link>
                    {showFinance && (
                      <Link to="/payments" className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                        {hub.attentionOutstanding}: {fmtNumber(overdueCount, lang)}
                      </Link>
                    )}
                    <Link to="/operations/calendar" className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      {hub.todayNearDepartures}: {fmtNumber(nearDepartures.length, lang)}
                    </Link>
                  </div>
                )}
                {loading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.04]" />)}
                  </div>
                ) : queueError ? (
                  <div className="flex min-h-[116px] items-center rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                    {hub.needsAttentionError || hub.todayQueueError}
                  </div>
                ) : todayWork.length === 0 ? (
                  <div className="flex min-h-[116px] items-center gap-3 rounded-lg bg-emerald-50 px-4 dark:bg-emerald-500/10">
                    <CheckCircleIcon className="size-5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{hub.needsAttentionClear || hub.todayQueueClear}</p>
                      <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">{hub.needsAttentionClearDetail || hub.todayQueueClearDetail}</p>
                    </div>
                  </div>
                ) : (
                  <ul className="-mx-2 max-h-[196px] overflow-y-auto">
                    {todayWork.map((item) => {
                      const Icon = item.kind === "reservation" ? TableIcon : item.kind === "departure" ? CalenderIcon : item.kind === "payment" ? DollarLineIcon : BoxIconLine;
                      const tone = item.urgency === "urgent" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : item.urgency === "attention" ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400";
                      return (
                        <li key={item.id}>
                          <Link to={item.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white">{item.title}</span>
                              <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{item.detail}</span>
                            </span>
                            <ArrowRightIcon className="size-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              {/* Bookings panel */}
              <Panel className="flex min-h-0 flex-1 flex-col p-5">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
                  <SectionLabel>{hub.recentDepartures}</SectionLabel>
                  <div className={`flex items-center gap-1 p-1 ${neuInset}`}>
                    {(["upcoming", "past"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setBookingsTab(tab)}
                        className={`rounded-md px-3 py-1 text-[0.72rem] font-semibold capitalize transition-all ${
                          bookingsTab === tab
                            ? "bg-brand-500 text-white"
                            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        }`}
                      >
                        {tab === "upcoming" ? hub.recentDepartures.split(" ")[0] : "Past"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Combo chart */}
                <div className="mb-3 shrink-0 overflow-hidden rounded-lg">
                  {loading ? (
                    <div className={`h-[96px] w-full animate-pulse ${neuInset}`} />
                  ) : grossPoints.length >= 2 ? (
                    <ComboChart bars={grossPoints} line={revenuePoints} height={96} />
                  ) : (
                    <div className={`flex h-[96px] items-end px-4 ${neuInset}`}>
                      <p className="mb-2.5 text-xs text-gray-400 dark:text-gray-500">{hub.quietPeriod}</p>
                    </div>
                  )}
                </div>

                {/* Booking list */}
                {loading ? (
                  <ul className="space-y-2.5">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="flex items-center gap-3.5">
                        <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                          <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : bookingsList.length === 0 ? (
                  <div className="flex flex-1 items-center">
                    <div className={`flex w-full items-center gap-2.5 px-4 py-4 ${neuInset}`}>
                      <CalenderIcon className="size-4 text-gray-300 dark:text-gray-600" />
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {bookingsTab === "upcoming" ? hub.noDepartures : hub.noDepartures}
                      </span>
                    </div>
                  </div>
                ) : (
                  <ul className="-mx-1 flex-1 overflow-y-auto">
                    {bookingsList.map((d) => {
                      const pct = d.seats > 0 ? Math.min(100, Math.round((d.booked / d.seats) * 100)) : 0;
                      const tone = pct >= 70 ? "warm" : "brand";
                      const dt = new Date(d.departAt);
                      return (
                        <li key={d.id}>
                          <Link
                            to={`/departures/${d.id}`}
                            className="group flex items-center gap-3.5 rounded-lg px-2 py-2.5 transition-all hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div
                              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center ${neuTile}`}
                            >
                              <span className="text-sm font-semibold leading-none tabular-nums text-gray-800 dark:text-white">
                                {String(dt.getDate()).padStart(2, "0")}
                              </span>
                              <span className="mt-0.5 text-[0.5rem] uppercase leading-none text-gray-500 dark:text-gray-400">
                                {fmtMonthShort(dt, lang)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-800 dark:text-white">
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
                              <div className="mt-2 max-w-[160px]">
                                <ProgressBar pct={pct} tone={tone} />
                              </div>
                            </div>
                            <div className="hidden shrink-0 items-center gap-2 sm:flex">
                              <span className="w-10 text-right text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                                {pct}%
                              </span>
                              <ArrowRightIcon className="size-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            {/* ════ COL 2 — Active reservations + mini cards + outstanding ════ */}
            <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
              {/* Active reservations hero */}
              <Panel className="flex shrink-0 items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <SectionLabel>{hub.kpiReservations}</SectionLabel>
                  <span className="mt-2 block text-[2.6rem] font-semibold leading-none tabular-nums tracking-tight text-gray-800 dark:text-white">
                    {loading ? (
                      <span className="block h-12 w-16 animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06]" />
                    ) : (
                      fmtNumber(activeCount, lang)
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col gap-2 text-right">
                  <div className={`rounded-lg px-3 py-2 ${neuInset}`}>
                    <span className="block text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {hub.psPaid}
                    </span>
                    <span className="block text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                      {loading ? "—" : fmtNumber(paidCount, lang)}
                    </span>
                  </div>
                  <div className={`rounded-lg px-3 py-2 ${neuInset}`}>
                    <span className="block text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {hub.recent}
                    </span>
                    <span className="block text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                      {loading ? "—" : fmtNumber(upcoming.length, lang)}
                    </span>
                  </div>
                </div>
              </Panel>

              {/* Mini cards row — Revenue + Open balance */}
              {showFinance && (
                <div className="grid shrink-0 grid-cols-2 gap-5">
                  <Panel className="p-4">
                    <SectionLabel>{hub.kpiRevenue}</SectionLabel>
                    <div className="mt-2 flex items-center gap-2">
                      <DollarLineIcon className="size-4 text-brand-500" />
                      <span className="text-xl font-semibold tabular-nums tracking-tight text-gray-800 dark:text-white">
                        {loading ? "—" : fmtCompact(overview?.total_paid_sum)}
                      </span>
                    </div>
                  </Panel>
                  <Panel className="p-4">
                    <SectionLabel className={openBalance > 0 ? "text-amber-500 dark:text-amber-400" : ""}>
                      {hub.kpiOutstanding}
                    </SectionLabel>
                    <div className="mt-2 flex items-center gap-2">
                      <BoxIconLine className={`size-4 ${openBalance > 0 ? "text-amber-500" : "text-gray-400"}`} />
                      <span className="text-xl font-semibold tabular-nums tracking-tight text-gray-800 dark:text-white">
                        {loading ? "—" : fmtCompact(openBalance)}
                      </span>
                    </div>
                  </Panel>
                </div>
              )}

              {/* Outstanding balances */}
              {showFinance && (
                <Panel className="flex min-h-0 flex-1 flex-col p-5">
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
                    <SectionLabel>{hub.focusOutstanding}</SectionLabel>
                    <Link
                      to="/payments"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:text-brand-400"
                    >
                      {hub.viewAll}
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </div>

                  {/* Column header */}
                  <div className="mb-1 flex shrink-0 items-center px-2 text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    <span className="flex-1">{t.reservations.customer}</span>
                    <span className="w-20 text-right">{common_amount(lang)}</span>
                  </div>

                  {loading ? (
                    <ul className="space-y-2.5">
                      {[0, 1].map((i) => (
                        <li key={i} className="flex items-center gap-3 px-2">
                          <div className="size-9 shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]" />
                            <div className="h-2.5 w-1/4 animate-pulse rounded bg-gray-100 dark:bg-white/[0.04]" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : watchPayments.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
                      <span
                        className="flex size-12 items-center justify-center rounded-full text-emerald-500 dark:text-emerald-400"
                        
                      >
                        <CheckCircleIcon className="size-6" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{hub.allSettled}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{hub.paymentsPanel}</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="-mx-1 flex-1 overflow-y-auto">
                      {watchPayments.slice(0, 4).map((p) => (
                        <li key={p.id}>
                          <Link
                            to={p.href}
                            className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-all hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                          >
                            <div
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-amber-500 dark:text-amber-400"
                              
                            >
                              <DollarLineIcon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-800 dark:text-white">
                                {p.customerName}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {p.packageName}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white">
                                {p.amount}
                              </div>
                              {p.daysOpen > 0 && (
                                <div className="mt-0.5 text-[0.66rem] leading-none text-amber-500 dark:text-amber-400">
                                  {p.daysOpen}d
                                </div>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {/* Current pay cycle — green check */}
              {showFinance && (
                <Panel className="flex shrink-0 items-center gap-3.5 p-4">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                  >
                    <CheckCircleIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">
                      {openBalance > 0 ? fmtCurrency(openBalance, lang) : hub.allSettled}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{hub.paymentsPanel}</p>
                  </div>
                </Panel>
              )}
            </div>

            {/* ════ COL 3 — Workspaces + Shortcuts ════ */}
            <aside className="flex min-w-0 flex-col gap-5 lg:min-h-0">
              <Panel className="shrink-0 p-5 pb-4">
                <SectionLabel>{hub.workspacesTitle}</SectionLabel>
                <nav className="mt-3.5 flex flex-col gap-2">
                  {workspaces.map((s) => (
                    <Link
                      key={s.href}
                      to={s.href}
                      className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-all"
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center ${neuTile} text-gray-400 transition-colors group-hover:text-brand-500 dark:text-gray-500`}
                      >
                        <s.icon className="size-[17px]" />
                      </span>
                      <span className="flex-1 text-[0.88rem] font-medium text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
                        {s.label}
                      </span>
                      <ArrowRightIcon className="size-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                    </Link>
                  ))}
                </nav>
              </Panel>

              <Panel className="flex min-h-0 flex-1 flex-col p-5">
                <SectionLabel>{hub.shortcutsTitle}</SectionLabel>
                <nav className="mt-3.5 grid grid-cols-2 gap-3">
                  {shortcuts.map((s) => (
                    <Link
                      key={s.href}
                      to={s.href}
                      className={`group flex flex-col gap-2.5 rounded-lg border border-gray-200 bg-white p-3.5 transition-colors hover:border-brand-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-white/[0.04]`}
                    >
                      <s.icon className="size-5 text-gray-400 transition-colors group-hover:text-brand-500 dark:text-gray-500" />
                      <span className="text-xs font-medium leading-tight text-gray-600 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
                        {s.label}
                      </span>
                    </Link>
                  ))}
                </nav>
              </Panel>
            </aside>
          </div>


          )}
          {/* Footer */}
          <footer className="mt-4 shrink-0 px-1">
            <p className="text-[0.66rem] text-gray-400 dark:text-gray-600">
              Footer © {new Date().getFullYear()} {(orgName || "NMT Analytics")} — {hub.subtitle}
            </p>
          </footer>
        </div>
    </>
  );
};

/** Local helper for the outstanding-balance amount column header. */
function common_amount(lang: Lang): string {
  return lang === "bs" ? "Iznos" : "Amount";
}

export default HomeHub;
