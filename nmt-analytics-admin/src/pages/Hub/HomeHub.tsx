import { useEffect, useState } from "react";
import type React from "react";
import { Link } from "react-router";
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
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { hasAccess, UserRole } from "../../types/roles";
import { useT } from "../../lib/i18n/context";
import { useNavigate } from "react-router";

type Tile = {
  title: string;
  description: string;
  stat: string;
  href: string;
  accent: "blue" | "emerald" | "amber";
  icon: React.ComponentType<any>;
  locked?: boolean;
};

export default function HomeHub() {
  const t = useT().t;
  const hub = t.hub;
  const { userContext } = useApp();
  const role = userContext?.role ?? "agent";
  const isManagerPlus = hasAccess("manager", role);

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    getAnalyticsOverview(from, to)
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tiles: Tile[] = [
    {
      title: hub.salesTitle,
      description: hub.salesDesc,
      stat: hub.salesStat,
      href: "/sales",
      accent: "blue",
      icon: ShootingStarIcon,
    },
    {
      title: hub.opsTitle,
      description: hub.opsDesc,
      stat: hub.opsStat,
      href: "/operations",
      accent: "emerald",
      icon: CalenderIcon,
      locked: !isManagerPlus,
    },
    {
      title: hub.finTitle,
      description: hub.finDesc,
      stat: hub.finStat,
      href: "/finance",
      accent: "amber",
      icon: DollarLineIcon,
      locked: !isManagerPlus,
    },
  ];

  return (
    <>
      <PageMeta title={`${hub.title} | Travline`} description={hub.subtitle} />

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white font-outfit">
          {hub.title}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-lg">
          {hub.subtitle}
        </p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
              <BoxIconLine className="text-indigo-600 dark:text-indigo-400 size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {loading ? "—" : hub.salesTitle}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : `${overview?.totalBookings ?? 0} ${t.dashboard.totalBookings.toLowerCase()}`}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10">
              <CalenderIcon className="text-green-600 dark:text-green-400 size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {loading ? "—" : hub.opsTitle}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : `${overview?.totalCustomers ?? 0} ${t.dashboard.totalCustomers.toLowerCase()}`}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10">
              <DollarLineIcon className="text-amber-600 dark:text-amber-400 size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {loading ? "—" : hub.finTitle}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {loading ? "..." : `${overview?.totalRevenue ? `KM ${overview.totalRevenue.toLocaleString()}` : "KM 0"}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Three main tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiles.map((tile) => {
          const accentMap: Record<string, { bg: string; border: string; iconBg: string; icon: string; hover: string; btn: string }> = {
            blue: {
              bg: "bg-indigo-50 dark:bg-indigo-500/[0.07]",
              border: "border-indigo-200 dark:border-indigo-800/40",
              iconBg: "bg-indigo-100 dark:bg-indigo-500/20",
              icon: "text-indigo-600 dark:text-indigo-400",
              hover: "hover:border-indigo-300 dark:hover:border-indigo-700",
              btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
            },
            emerald: {
              bg: "bg-emerald-50 dark:bg-emerald-500/[0.07]",
              border: "border-emerald-200 dark:border-emerald-800/40",
              iconBg: "bg-emerald-100 dark:bg-emerald-500/20",
              icon: "text-emerald-600 dark:text-emerald-400",
              hover: "hover:border-emerald-300 dark:hover:border-emerald-700",
              btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
            },
            amber: {
              bg: "bg-amber-50 dark:bg-amber-500/[0.07]",
              border: "border-amber-200 dark:border-amber-800/40",
              iconBg: "bg-amber-100 dark:bg-amber-500/20",
              icon: "text-amber-600 dark:text-amber-400",
              hover: "hover:border-amber-300 dark:hover:border-amber-700",
              btn: "bg-amber-600 hover:bg-amber-700 text-white",
            },
          };
          const s = accentMap[tile.accent];

          return (
            <Link
              key={tile.href}
              to={tile.locked ? "#" : tile.href}
              onClick={(e: React.MouseEvent) => { if (tile.locked) e.preventDefault(); }}
              className={`relative group block rounded-2xl border-2 ${s.border} ${s.bg} ${tile.locked ? "" : s.hover} p-8 transition-all duration-200 ${tile.locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {tile.locked && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-gray-200/60 dark:bg-gray-700/60 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <LockIcon className="size-3" />
                  {hub.locked}
                </div>
              )}
              <div className={`w-14 h-14 rounded-2xl ${s.iconBg} flex items-center justify-center mb-5`}>
                <tile.icon className={`size-7 ${s.icon}`} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {tile.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                {tile.description}
              </p>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${s.icon}`}>
                  {tile.stat}
                </span>
                {!tile.locked && (
                  <span className={`flex items-center gap-1 text-sm font-medium ${s.icon} opacity-0 group-hover:opacity-100 transition-opacity`}>
                    {hub.openSection}
                    <ArrowRightIcon className="size-4" />
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom: quick links to key pages */}
      <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickLink icon={GridIcon} label={t.nav.dashboard} href="/dashboard" />
        <QuickLink icon={UserCircleIcon} label={t.nav.customers} href="/customers" />
        <QuickLink icon={FileIcon} label={t.nav.contracts} href="/operations/contracts" />
        <QuickLink icon={PieChartIcon} label={t.nav.reports} href="/reports" minRole="manager" />
      </div>
    </>
  );
}

function QuickLink({
  icon: Icon,
  label,
  href,
  minRole,
}: {
  icon: React.ComponentType<any>;
  label: string;
  href: string;
  minRole?: string;
}) {
  const { userContext } = useApp();
  const role = userContext?.role;
  const visible = !minRole || hasAccess(minRole as UserRole, role);
  if (!visible) return null;

  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
    >
      <Icon className="size-5 text-gray-400 shrink-0" />
      <span>{label}</span>
    </button>
  );
}