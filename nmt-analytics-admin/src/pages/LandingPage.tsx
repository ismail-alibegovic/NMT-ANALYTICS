import { Link } from "react-router";
import { useT } from "../lib/i18n/context";
import PageMeta from "../components/common/PageMeta";
import ThemeTogglerTwo from "../components/common/ThemeTogglerTwo";
import {
  ArrowRightIcon,
  BoxIconLine,
  CalenderIcon,
  CheckCircleIcon,
  DollarLineIcon,
  LockIcon,
  TableIcon,
} from "../icons";

export default function LandingPage() {
  const { t, lang, setLang } = useT();
  const l = t.landing;

  const features = [
    {
      title: l.f1Title,
      desc: l.f1Desc,
      icon: TableIcon,
      color: "from-blue-500/10 to-indigo-500/10 text-brand-600 dark:text-brand-400 border-blue-500/20",
    },
    {
      title: l.f2Title,
      desc: l.f2Desc,
      icon: CalenderIcon,
      color: "from-sky-500/10 to-blue-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    },
    {
      title: l.f3Title,
      desc: l.f3Desc,
      icon: BoxIconLine,
      color: "from-indigo-500/10 to-purple-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    },
    {
      title: l.f4Title,
      desc: l.f4Desc,
      icon: DollarLineIcon,
      color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    {
      title: l.f5Title,
      desc: l.f5Desc,
      icon: CheckCircleIcon,
      color: "from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    {
      title: l.f6Title,
      desc: l.f6Desc,
      icon: LockIcon,
      color: "from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    },
  ];

  return (
    <div className="relative min-h-screen bg-slate-50 text-gray-900 selection:bg-brand-500 selection:text-white dark:bg-gray-950 dark:text-white">
      <PageMeta
        title={`Travline — ${t.app.tagline}`}
        description={l.heroSubtitle}
      />

      {/* Decorative ambient background gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden">
        <div className="h-[500px] w-[800px] -translate-y-1/2 rounded-full bg-gradient-to-tr from-brand-500/20 via-sky-400/15 to-transparent blur-3xl dark:from-brand-600/25 dark:via-indigo-500/15" />
      </div>

      {/* ── Navigation bar ── */}
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/images/brand/travline-icon.svg"
              alt="Travline"
              className="size-9 rounded-xl shadow-xs"
            />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Travline
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Language switch button */}
            <button
              onClick={() => setLang(lang === "bs" ? "en" : "bs")}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {lang === "bs" ? "EN" : "BS"}
            </button>

            <Link
              to="/auth/signin"
              className="rounded-xl border border-gray-200/80 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-2xs transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {l.signIn}
            </Link>

            <Link
              to="/auth/signin"
              className="hidden rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-xs shadow-brand-500/30 transition-all hover:bg-brand-600 sm:inline-block"
            >
              {l.getStarted}
            </Link>

            <div className="pl-1">
              <ThemeTogglerTwo />
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-50/80 px-3.5 py-1.5 text-xs font-bold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <span className="size-1.5 rounded-full bg-brand-500 animate-pulse" />
            {l.badge}
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            <span className="block text-gray-900 dark:text-white">{l.heroTitle1}</span>
            <span className="mt-1 block bg-gradient-to-r from-brand-500 via-indigo-500 to-sky-500 bg-clip-text text-transparent">
              {l.heroTitle2}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">
            {l.heroSubtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/auth/signin"
              className="group inline-flex items-center gap-2.5 rounded-2xl bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition-all hover:bg-brand-600 hover:shadow-lg hover:shadow-brand-500/40 active:scale-[0.98]"
            >
              <span>{l.getStarted}</span>
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200/80 bg-white/90 px-6 py-3.5 text-sm font-bold text-gray-700 shadow-2xs transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {l.explorePlatform}
            </a>
          </div>

          {/* Quick Stats Strip */}
          <div className="mt-14 grid grid-cols-3 gap-4 border-y border-gray-200/80 py-6 dark:border-gray-800">
            <div>
              <div className="text-2xl font-extrabold tabular-nums text-gray-900 dark:text-white sm:text-3xl">
                100%
              </div>
              <div className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                {l.statsOrganizers}
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold tabular-nums text-brand-600 dark:text-brand-400 sm:text-3xl">
                Real-Time
              </div>
              <div className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                {l.statsReservations}
              </div>
            </div>
            <div>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-3xl">
                99.9%
              </div>
              <div className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                {l.statsUptime}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              {l.featuresTitle}
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
              {l.featuresSubtitle}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="group relative rounded-2xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/80 dark:hover:border-brand-500"
              >
                <div
                  className={`mb-5 inline-flex size-12 items-center justify-center rounded-2xl border bg-gradient-to-br ${f.color}`}
                >
                  <f.icon className="size-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-8 text-center text-white shadow-xl sm:p-14">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {l.ctaTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-brand-100 sm:text-lg">
            {l.ctaSubtitle}
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/auth/signin"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-bold text-brand-700 shadow-md transition-all hover:bg-brand-50 hover:shadow-lg active:scale-[0.98]"
            >
              <span>{l.ctaAction}</span>
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200/80 bg-white/50 py-8 text-center text-xs text-gray-500 dark:border-gray-800/80 dark:bg-gray-950 dark:text-gray-400">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/images/brand/travline-icon.svg"
              alt="Travline"
              className="size-5 rounded"
            />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Travline</span>
          </div>
          <p>{l.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
