import { Link } from "react-router";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { logger } from "../../utils/logger";
import { LockIcon } from "../../icons";

/**
 * ModuleGuard — frontend entitlement gate for premium modules.
 *
 * Mirrors the backend `requireModule()` middleware: an item renders only if
 * the user's enabled module set (returned by `GET /me/context` as
 * `modules`) contains the `moduleKey`.
 */
interface ModuleGuardProps {
  moduleKey: string;
  children: React.ReactNode;
  /** Rendered instead of the default restricted state when the module is absent. Optional. */
  fallback?: React.ReactNode;
}

export function ModuleGuard({ moduleKey, children, fallback }: ModuleGuardProps) {
  const { userContext, loading, profileLoading } = useApp();
  const { t } = useT();

  // Wait for authoritative context before mounting protected children.
  if (loading || profileLoading) {
    return null;
  }

  const enabled = userContext?.modules ?? [];

  // DEV fallback: no modules resolved → treat as entitled (matches
  // sidebar `canSeeItem` precedent).
  const devEmptyFallback =
    import.meta.env.DEV && (!enabled || enabled.length === 0);

  if (enabled.includes(moduleKey) || devEmptyFallback) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  logger.warn(
    `[ModuleGuard] Module "${moduleKey}" not enabled for this user.`
  );

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-800/40 dark:bg-white/[0.03]">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <LockIcon className="size-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t.common.moduleRestrictedTitle}
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t.common.moduleRestrictedDesc}
        </p>
        <div className="mt-6">
          <Link
            to="/home"
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            {t.common.backToHome}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ModuleGuard;
