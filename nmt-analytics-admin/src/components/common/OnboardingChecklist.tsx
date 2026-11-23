import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";
import { useApp } from "../../context/AppContext";

interface ApiOnboardingStep {
  key: string;
  required?: boolean;
  completed: boolean;
}

interface OnboardingStatusResponse {
  steps?: ApiOnboardingStep[];
  completed?: number;
  total?: number;
  percentage?: number;
  isComplete?: boolean;
  skipped?: boolean;
}

interface OnboardingTask {
  key: string;
  done: boolean;
  link: string;
  labelKey: string;
}

const STEP_META: Record<string, { link: string; labelKey: string }> = {
  agency_name: { link: "/settings", labelKey: "setupProfile" },
  currency: { link: "/settings", labelKey: "setCurrency" },
  logo: { link: "/settings", labelKey: "logoUploaded" },
  first_package: { link: "/packages", labelKey: "addFirstPackage" },
  first_departure: { link: "/departures", labelKey: "scheduleDeparture" },
  first_reservation: { link: "/reservations", labelKey: "createReservation" },
  pdf_template: { link: "/settings/pdf-templates", labelKey: "pdfTemplate" },
  branding_colors: { link: "/settings", labelKey: "brandingColors" },
  team_member: { link: "/settings#team", labelKey: "addTeamMember" },
};

export default function OnboardingChecklist() {
  const { t } = useT();
  const { userContext } = useApp();
  const canViewOnboarding =
    userContext?.role === "director" || userContext?.role === "super_admin";

  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(canViewOnboarding);
  const [loadFailed, setLoadFailed] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const dismissLockRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (!canViewOnboarding) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    setSkipFailed(false);
    try {
      const { data } = await api.get<OnboardingStatusResponse>("/onboarding/status");
      if (data?.skipped) {
        setDismissed(true);
        setTasks([]);
        return;
      }
      const apiSteps = Array.isArray(data?.steps) ? data.steps : [];
      const mapped: OnboardingTask[] = apiSteps.map((step) => {
        const meta = STEP_META[step.key] || { link: "/settings", labelKey: step.key };
        return {
          key: step.key,
          done: Boolean(step.completed),
          link: meta.link,
          labelKey: meta.labelKey,
        };
      });
      setTasks(mapped);
    } catch {
      setTasks([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canViewOnboarding]);

  useEffect(() => {
    if (!canViewOnboarding) {
      setLoading(false);
      return;
    }
    void fetchStatus();
  }, [canViewOnboarding, fetchStatus]);

  if (!canViewOnboarding || loading || dismissed) return null;

  if (loadFailed) {
    return (
      <div
        role="alert"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
      >
        <span>{t.onboarding.loadFailed}</span>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          {t.onboarding.retry}
        </button>
      </div>
    );
  }

  const completedCount = tasks.filter((task) => task.done).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  if (totalCount === 0 || allDone) return null;

  const handleDismiss = async () => {
    if (dismissLockRef.current) return;
    dismissLockRef.current = true;
    setDismissing(true);
    setSkipFailed(false);
    try {
      await api.post("/onboarding/skip");
      try {
        localStorage.setItem("travline_onboarding_dismissed", "true");
      } catch {
        // Persistence in DB succeeded; ignore storage errors.
      }
      setDismissed(true);
    } catch {
      setSkipFailed(true);
    } finally {
      dismissLockRef.current = false;
      setDismissing(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-800 dark:bg-brand-900/20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t.onboarding.title}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t.onboarding.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleDismiss()}
          disabled={dismissing}
          aria-label={t.onboarding.dismiss}
          className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>

      {skipFailed && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        >
          {t.onboarding.skipFailed}
        </div>
      )}

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
          const label = (t.onboarding as Record<string, string>)[task.labelKey] || task.key;
          return (
            <Link
              key={task.key}
              to={task.link}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
            >
              {task.done ? (
                <svg
                  className="size-5 shrink-0 text-success-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.2 2.2 4.8-5.2" />
                </svg>
              ) : (
                <div className="size-5 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <span
                className={`flex-1 text-sm ${
                  task.done
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "font-medium text-gray-700 dark:text-gray-300"
                }`}
              >
                {label}
              </span>
              {!task.done && (
                <svg
                  className="size-4 shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
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
