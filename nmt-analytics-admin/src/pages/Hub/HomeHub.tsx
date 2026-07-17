import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { getAnalyticsOverview, AnalyticsOverview } from "../../api/analytics";
import {
  ArrowRightIcon,
  BoxIconLine,
  DollarLineIcon,
  ShootingStarIcon,
  CalenderIcon,
  FileIcon,
  PieChartIcon,
  LockIcon,
  GridIcon,
  UserCircleIcon,
  GroupIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { hasAccess, UserRole } from "../../types/roles";
import { useT } from "../../lib/i18n/context";

type AccentKey = "brand" | "emerald" | "amber";

type FocusAction = {
  title: string;
  description: string;
  href: string;
  cta: string;
  accent: AccentKey;
  icon: React.ComponentType<any>;
  minRole?: UserRole;
};

type Workspace = {
  title: string;
  description: string;
  href: string;
  accent: AccentKey;
  icon: React.ComponentType<any>;
  locked?: boolean;
};

type QuickLinkDef = {
  icon: React.ComponentType<any>;
  label: string;
  href: string;
  minRole?: string;
};

const ACCENT: Record<
  AccentKey,
  {
    iconBg: string;
    icon: string;
    ring: string;
    hover: string;
    btn: string;
    soft: string;
    glyph: string;
  }
> = {
  brand: {
    iconBg: "bg-indigo-50 dark:bg-indigo-500/10",
    icon: "text-indigo-600 dark:text-indigo-400",
    ring: "border-gray-200 dark:border-gray-800",
    hover: "hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700/60",
    btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
    soft: "bg-white dark:bg-white/[0.03]",
    glyph: "text-indigo-500 dark:text-indigo-400",
  },
  emerald: {
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "border-gray-200 dark:border-gray-800",
    hover: "hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700/60",
    btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    soft: "bg-white dark:bg-white/[0.03]",
    glyph: "text-emerald-500 dark:text-emerald-400",
  },
  amber: {
    iconBg: "bg-amber-50 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "border-gray-200 dark:border-gray-800",
    hover: "hover:border-amber-300 hover:shadow-sm dark:hover:border-amber-700/60",
    btn: "bg-amber-600 hover:bg-amber-700 text-white",
    soft: "bg-white dark:bg-white/[0.03]",
    glyph: "text-amber-500 dark:text-amber-400",
  },
};

function formatCurrency(value: number | undefined | null): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `KM ${v.toLocaleString("bs-BA")}`;
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Dobro jutro";
  if (h < 18) return "Dobar dan";
  return "Dobra večer";
}

export default function HomeHub() {
  const { t } = useT();
  const hub = t.hub;
  const { userContext } = useApp();
  const now = useMemo(() => new Date(), []);
  const role = userContext?.role ?? "agent";
  const isManagerPlus = hasAccess("manager", role);
  const navigate = useNavigate();

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    getAnalyticsOverview(from, to)
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = greetingFor(now);
  const todayLabel = now.toLocaleDateString("bs-BA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const kpis: {
    label: string;
    value: string;
    delta?: number;
    icon: React.ComponentType<any>;
    accent: AccentKey;
    visible: boolean;
  }[] = [
    {
      label: t.dashboard.totalRevenue,
      value: formatCurrency(overview?.totalRevenue),
      delta: overview?.revenueChangePct,
      icon: DollarLineIcon,
      accent: "brand",
      visible: isManagerPlus,
    },
    {
      label: t.dashboard.totalBookings,
      value: `${(overview?.totalBookings ?? 0).toLocaleString("bs-BA")}`,
      delta: overview?.bookingsChangePct,
      icon: BoxIconLine,
      accent: "emerald",
      visible: true,
    },
    {
      label: t.dashboard.totalCustomers,
      value: `${(overview?.totalCustomers ?? 0).toLocaleString("bs-BA")}`,
      delta: overview?.customersChangePct,
      icon: GroupIcon,
      accent: "amber",
      visible: true,
    },
    {
      label: t.dashboard.cancelRate,
      value: `${(overview?.cancellationRate ?? 0).toFixed(1)}%`,
      delta: undefined,
      icon: ArrowDownIcon,
      accent: "brand",
      visible: true,
    },
  ];

  const focusActions: FocusAction[] = (
    [
      {
        title: hub.focusNewReservation,
        description: hub.focusNewReservationDesc,
        href: "/reservations",
        cta: hub.focusNewReservationCta,
        accent: "brand",
        icon: PlusIcon,
      },
      {
        title: hub.focusDepartures,
        description: hub.focusDeparturesDesc,
        href: "/departures",
        cta: hub.focusDeparturesCta,
        accent: "emerald",
        icon: CalenderIcon,
      },
      {
        title: hub.focusOutstanding,
        description: hub.focusOutstandingDesc,
        href: "/payments",
        cta: hub.focusOutstandingCta,
        accent: "amber",
        icon: DollarLineIcon,
        minRole: "manager",
      },
    ] as FocusAction[]
  ).filter((a) => !a.minRole || hasAccess(a.minRole as UserRole, role));

  const workspaces: Workspace[] = [
    {
      title: hub.salesTitle,
      description: hub.salesDesc,
      href: "/sales",
      accent: "brand",
      icon: ShootingStarIcon,
    },
    {
      title: hub.opsTitle,
      description: hub.opsDesc,
      href: "/operations",
      accent: "emerald",
      icon: CalenderIcon,
      locked: !isManagerPlus,
    },
    {
      title: hub.finTitle,
      description: hub.finDesc,
      href: "/finance",
      accent: "amber",
      icon: DollarLineIcon,
      locked: !isManagerPlus,
    },
  ];

  const quickLinks: QuickLinkDef[] = [
    { icon: GridIcon, label: t.nav.dashboard, href: "/dashboard" },
    { icon: UserCircleIcon, label: t.nav.customers, href: "/customers" },
    { icon: FileIcon, label: t.nav.contracts, href: "/operations/contracts" },
    { icon: PieChartIcon, label: t.nav.reports, href: "/reports", minRole: "manager" },
  ];

  return (
    <>
      <PageMeta title={`${hub.title} | Travline`} description={hub.subtitle} />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Greeting header */}
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {greeting} · {todayLabel}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            {hub.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {hub.subtitle}
          </p>
        </header>

        {/* KPI row */}
        <section
          aria-label={hub.kpis}
          className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {kpis
            .filter((kpi) => kpi.visible)
            .map((kpi) => {
              const s = ACCENT[kpi.accent];
              const showDelta =
                !loading &&
                typeof kpi.delta === "number" &&
                Number.isFinite(kpi.delta);
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-gray-200 bg-white p-5 transition-all dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.iconBg}`}
                    >
                      <kpi.icon className={`size-5 ${s.icon}`} />
                    </div>
                    {showDelta && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.iconBg} ${s.icon}`}
                      >
                        {kpi.delta! >= 0 ? (
                          <ArrowUpIcon className="size-3" />
                        ) : (
                          <ArrowDownIcon className="size-3" />
                        )}
                        {Math.abs(kpi.delta!)}%
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {kpi.label}
                    </span>
                    <h4 className="mt-1 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                      {loading ? (
                        <div className="h-7 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                      ) : (
                        kpi.value
                      )}
                    </h4>
                  </div>
                </div>
              );
            })}
        </section>

        {/* Today's focus — primary actions */}
        <section aria-label={hub.focusTitle} className="mb-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {hub.focusTitle}
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {hub.focusSubtitle}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {focusActions.map((action) => {
              const s = ACCENT[action.accent];
              return (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className={`group relative flex flex-col rounded-2xl border ${s.ring} bg-white p-5 text-left transition-all duration-200 dark:bg-white/[0.03] ${s.hover}`}
                >
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${s.iconBg}`}>
                    <action.icon className={`size-5 ${s.icon}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {action.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {action.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-medium">
                    <span className={s.glyph}>{action.cta}</span>
                    <ArrowRightIcon
                      className={`size-3.5 ${s.glyph} transition-transform group-hover:translate-x-1`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Workspaces — secondary, quiet row */}
        <section aria-label={hub.scopeSubtitle} className="mb-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {hub.workspacesTitle}
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {hub.scopeSubtitle}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {workspaces.map((ws) => {
              const s = ACCENT[ws.accent];
              return (
                <Link
                  key={ws.href}
                  to={ws.locked ? "#" : ws.href}
                  onClick={(e: React.MouseEvent) => {
                    if (ws.locked) e.preventDefault();
                  }}
                  className={`group flex items-center justify-between rounded-xl border ${s.ring} ${
                    ws.locked ? "" : s.hover
                  } bg-white p-4 transition-all duration-200 dark:bg-white/[0.03] ${
                    ws.locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.iconBg}`}>
                      <ws.icon className={`size-[18px] ${s.icon}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {ws.title}
                        </h3>
                        {ws.locked && (
                          <LockIcon className="size-3 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">
                        {ws.description}
                      </p>
                    </div>
                  </div>
                  {!ws.locked && (
                    <ArrowRightIcon
                      className={`size-4 shrink-0 ${s.glyph} opacity-0 transition-opacity group-hover:opacity-100`}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Quick links */}
        <section aria-label={hub.quickStats} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickLinks.map((ql) => {
            const visible = !ql.minRole || hasAccess(ql.minRole as UserRole, role);
            if (!visible) return null;
            return (
              <button
                key={ql.href}
                onClick={() => navigate(ql.href)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/5"
              >
                <ql.icon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
                <span>{ql.label}</span>
              </button>
            );
          })}
        </section>
      </div>
    </>
  );
}
