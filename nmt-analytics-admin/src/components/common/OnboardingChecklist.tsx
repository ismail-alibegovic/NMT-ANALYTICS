import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { CheckCircleIcon } from "../../icons";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";

interface OnboardingTask {
  key: string;
  done: boolean;
  link: string;
}

export default function OnboardingChecklist() {
  const { t } = useT();
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/onboarding/status");
      const checklist: OnboardingTask[] = [
        { key: "setupProfile", done: data.profile_completed, link: "/settings" },
        { key: "logoUploaded", done: data.logo_uploaded, link: "/settings" },
        { key: "addFirstPackage", done: data.package_created, link: "/admin/packages" },
        { key: "scheduleDeparture", done: data.departure_created, link: "/admin/departures" },
        { key: "createReservation", done: data.reservation_created, link: "/reservations" },
        { key: "pdfTemplate", done: data.pdf_template_customized, link: "/settings/pdf-templates" },
      ];
      setTasks(checklist);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const stored = localStorage.getItem("travline_onboarding_dismissed");
    if (stored === "true") {
      setDismissed(true);
      setLoading(false);
      return;
    }
    fetchStatus();
  }, [fetchStatus]);

  const completedCount = tasks.filter((task) => task.done).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  const handleDismiss = () => {
    localStorage.setItem("travline_onboarding_dismissed", "true");
    setDismissed(true);
  };

  if (loading || dismissed || allDone) return null;

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-800 dark:bg-brand-900/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t.onboarding.title}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t.onboarding.subtitle}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mb-4 text-xs font-medium text-gray-500 dark:text-gray-400">
        {completedCount} / {totalCount} · {t.onboarding.stepsRemaining}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => {
          const label = (t.onboarding as Record<string, string>)[task.key] || task.key;
          return (
            <Link
              key={task.key}
              to={task.link}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
            >
              {task.done ? (
                <CheckCircleIcon className="size-5 shrink-0 text-success-500" />
              ) : (
                <div className="size-5 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <span className={`flex-1 text-sm ${task.done ? "text-gray-400 line-through dark:text-gray-500" : "font-medium text-gray-700 dark:text-gray-300"}`}>
                {label}
              </span>
              {!task.done && (
                <svg className="size-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
