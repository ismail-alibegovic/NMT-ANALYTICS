import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import {
  ArrowRightIcon,
  BoxIconLine,
  ShootingStarIcon,
  TimeIcon,
  GridIcon,
  UserCircleIcon,
} from "../../icons";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { hasAccess, UserRole } from "../../types/roles";

type Section = {
  href: string;
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  minRole?: UserRole;
  badge?: "live" | "new";
};

const sectionsFor = (
  t: ReturnType<typeof useT>["t"],
  role: string | undefined
) => {
  const all: Section[] = [
    {
      href: "/dashboard",
      icon: GridIcon,
      title: t.nav.dashboard,
      description: t.dashboard.description,
      minRole: "viewer",
      badge: "live",
    },
    {
      href: "/reservations",
      icon: BoxIconLine,
      title: t.nav.reservations,
      description: t.reservations.description,
      minRole: "viewer",
    },
    {
      href: "/customers",
      icon: UserCircleIcon,
      title: t.nav.customers,
      description: t.customers.description,
      minRole: "viewer",
    },
    {
      href: "/packages",
      icon: ShootingStarIcon,
      title: t.nav.packages,
      description: t.packages.description,
      minRole: "agent",
    },
    {
      href: "/departures",
      icon: TimeIcon,
      title: t.nav.departures,
      description: t.departures.description,
      minRole: "agent",
    },
  ];
  return all.filter((s) => !s.minRole || hasAccess(s.minRole, role));
};

export default function SalesScope() {
  const t = useT().t;
  const { userContext } = useApp();
  const role = userContext?.role;
  const sections = sectionsFor(t, role);

  return (
    <>
      <PageMeta title={`${t.hub.salesTitle} | ${t.app.name}`} description={t.hub.salesDesc} />
      <ScopeHeader
        title={t.hub.salesTitle}
        description={t.hub.salesDesc}
        accent="blue"
        icon={ShootingStarIcon}
      />
      <SectionGrid sections={sections} />
    </>
  );
}

// shared header exported below for the other scopes
export function ScopeHeader({
  title,
  description,
  accent,
  icon: Icon,
}: {
  title: string;
  description: string;
  accent: "blue" | "emerald" | "amber";
  icon: React.ComponentType<any>;
}) {
  const hub = useT().t.hub;
  const tone =
    accent === "blue"
      ? "from-blue-500/[0.08] via-white to-white dark:from-blue-500/[0.14] dark:via-gray-900 dark:to-gray-900"
      : accent === "emerald"
      ? "from-emerald-500/[0.08] via-white to-white dark:from-emerald-500/[0.14] dark:via-gray-900 dark:to-gray-900"
      : "from-amber-500/[0.08] via-white to-white dark:from-amber-500/[0.14] dark:via-gray-900 dark:to-gray-900";
  const iconTone =
    accent === "blue"
      ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
      : accent === "emerald"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
      : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400";

  return (
    <section className="mb-10">
      <div className={`relative overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-br dark:border-gray-800 p-8 ${tone}`}>
        <div className="flex items-center gap-4">
          <span className={`flex size-14 items-center justify-center rounded-2xl ${iconTone}`}>
            <Icon className="size-7" />
          </span>
          <div className="min-w-0">
            <Link to="/home" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              <span aria-hidden>←</span> {hub.backToHub}
            </Link>
            <h1 className="font-outfit text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SectionGrid({ sections }: { sections: Section[] }) {
  return (
    <section>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              to={s.href}
              className="group relative flex min-h-[180px] flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-theme-lg hover:ring-4 hover:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <Icon className="size-6" />
                </span>
                {s.badge === "live" && (
                  <span className="rounded-full bg-emerald-50 text-xs font-semibold text-emerald-600 px-2.5 py-1 dark:bg-emerald-500/10 dark:text-emerald-400">
                    live
                  </span>
                )}
              </div>
              <div className="mt-6">
                <h3 className="font-semibold text-gray-900 dark:text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
                  {s.description}
                </p>
              </div>
              <div className="mt-5 flex items-center justify-end">
                <span className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-transform group-hover:translate-x-0.5 dark:text-brand-400">
                  <ArrowRightIcon className="size-4" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
