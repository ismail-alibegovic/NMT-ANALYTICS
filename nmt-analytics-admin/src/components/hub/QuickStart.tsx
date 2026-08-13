import { Link } from "react-router";
import { ArrowRightIcon, BoxIconLine, CalenderIcon, ShootingStarIcon } from "../../icons";
import { useT } from "../../lib/i18n/context";

export default function QuickStart() {
  const { t } = useT();
  const h = t.hub;

  const steps = [
    {
      icon: BoxIconLine,
      title: h.qsStep1Title,
      desc: h.qsStep1Desc,
      cta: h.qsStep1Cta,
      to: "/packages",
      accent: "bg-brand-500",
    },
    {
      icon: CalenderIcon,
      title: h.qsStep2Title,
      desc: h.qsStep2Desc,
      cta: h.qsStep2Cta,
      to: "/departures",
      accent: "bg-emerald-500",
    },
    {
      icon: ShootingStarIcon,
      title: h.qsStep3Title,
      desc: h.qsStep3Desc,
      cta: h.qsStep3Cta,
      to: "/reservations?new=1",
      accent: "bg-amber-500",
    },
  ];

  return (
    <div className="mx-auto flex h-[calc(100dvh-130px)] w-full max-w-[720px] flex-col items-center justify-center px-4">
      <div className="mb-2 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-xl bg-brand-500 text-2xl font-bold text-white">
          T
        </span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white">
        {h.quickStartTitle}
      </h1>
      <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
        {h.quickStartSubtitle}
      </p>

      <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Link
            key={i}
            to={step.to}
            className="group relative flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 text-center transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
          >
            <span className="absolute -top-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {i + 1}
            </span>
            <span
              className={`mt-2 flex size-11 items-center justify-center rounded-lg ${step.accent} text-white`}
            >
              <step.icon className="size-5" />
            </span>
            <span className="mt-4 text-sm font-semibold text-gray-800 dark:text-white">
              {step.title}
            </span>
            <span className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {step.desc}
            </span>
            <span className="mt-4 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity group-hover:opacity-90"
              style={{ backgroundColor: step.accent.startsWith("bg-brand") ? "#3b82f6" : step.accent.startsWith("bg-emerald") ? "#10b981" : "#f59e0b" }}
            >
              <span>{step.cta}</span>
              <ArrowRightIcon className="size-3" />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400 dark:text-gray-600">
        {h.subtitle}
      </p>
    </div>
  );
}
