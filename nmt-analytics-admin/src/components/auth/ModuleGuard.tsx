import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { logger } from "../../utils/logger";

/**
 * ModuleGuard — frontend entitlement gate for premium modules.
 *
 * Mirrors the backend `requireModule()` middleware: an item renders only if
 * the user's enabled module set (returned by `GET /me/context` as
 * `modules`) contains the `moduleKey`.
 *
 * Design notes:
 * - Trial-plan tenants must not see premium routes (analytics, payments,
 *   integrations, documents) or premium operations (subagents, hotels,
 *   excursions, commission rules) — the sidebar `canSeeItem` already
 *   filters by `nav.module`; this component gates the *route element*
 *   itself so direct navigation to a gated URL doesn't leak the page.
 * - The backend `requireModule` is the security boundary; `ModuleGuard`
 *   is a UX/defense-in-depth layer. If a user without `analytics` hits
 *   `/reports` directly, ModuleGuard redirects to `/` instead of
 *   rendering a 402-bearing page shell.
 * - DEV fallback: in dev builds, when `modules` is empty (e.g. cold-start
 *   race with `/me/context`), we render the children to avoid spuriously
 *   hiding premium surfaces during local iteration. Mirrors the sidebar's
 *   same-rooted `canSeeItem` dev fallback.
 */
interface ModuleGuardProps {
  moduleKey: string;
  children: React.ReactNode;
  /** Rendered instead of redirecting when the module is absent. Optional. */
  fallback?: React.ReactNode;
}

export function ModuleGuard({ moduleKey, children, fallback }: ModuleGuardProps) {
  const { userContext, loading, profileLoading } = useApp();
  const navigate = useNavigate();

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
    `[ModuleGuard] Module "${moduleKey}" not enabled for this user — redirecting to "/".`
  );
  // Defer navigate out of render to keep React happy.
  queueMicrotask(() => navigate("/", { replace: true }));
  return null;
}

export default ModuleGuard;
