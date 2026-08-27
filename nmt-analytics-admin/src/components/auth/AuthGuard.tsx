import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { logger } from "../../utils/logger";
import { hasAccess } from "../../types/roles";
import type { UserRole } from "../../types/roles";

interface AuthGuardProps {
  children: React.ReactNode;
}

// ── Module-keyed routes ──────────────────────────────────────────────
// Maps premium route prefixes → the backend module_key they require
// (see api/src/lib/planModules.ts). When the org's plan does not grant
// the module, /me/context returns an empty entry for it, so the route
// is blocked at the URL level too (the backend requireModule() also
// returns 402/403, but this catches direct navigation client-side).
const routeModuleRequirements: { prefix: string; module: string }[] = [
  { prefix: "/reports", module: "analytics" },
  { prefix: "/integrations", module: "integrations" },
  { prefix: "/admin/documents", module: "documents" },
  { prefix: "/payments", module: "payments" },
  { prefix: "/payment-dashboard", module: "payments" },
  { prefix: "/transactions", module: "transactions" },
];

// ── Role-keyed routes ───────────────────────────────────────────────
const routeRequirements: { prefix: string; minRole: UserRole }[] = [
  { prefix: "/admin/audit-logs", minRole: "director" },
  { prefix: "/settings", minRole: "director" },
  { prefix: "/payments", minRole: "manager" },
  { prefix: "/payment-dashboard", minRole: "manager" },
  { prefix: "/transactions", minRole: "manager" },
  { prefix: "/reports", minRole: "manager" },
  { prefix: "/integrations", minRole: "manager" },
  { prefix: "/admin/documents", minRole: "manager" },
  { prefix: "/communication", minRole: "agent" },
];

function getRequiredRole(pathname: string) {
  return routeRequirements.find(route => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))?.minRole;
}

function getRequiredModule(pathname: string) {
  return routeModuleRequirements.find(route => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))?.module;
}

function hasModuleGranted(modules: string[] | undefined, moduleKey: string): boolean {
  if (modules && modules.includes(moduleKey)) return true;
  // Dev fail-open matches AppSidebar + ModuleGuard behavior: when no modules
  // have been seeded yet, local dev still renders every route.
  if (import.meta.env.DEV && (!modules || modules.length === 0)) return true;
  return false;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { userContext, loading, profileLoading } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !profileLoading && !userContext) {
      logger.log('[AuthGuard] No userContext - redirecting to signin');
      navigate("/auth/signin", { replace: true });
      return;
    }

    if (!loading && !profileLoading && userContext) {
      const requiredRole = getRequiredRole(location.pathname);
      if (requiredRole && !hasAccess(requiredRole, userContext.role)) {
        logger.warn(`[AuthGuard] Blocked ${userContext.role} from ${location.pathname}`);
        navigate("/", { replace: true });
        return;
      }

      const requiredModule = getRequiredModule(location.pathname);
      if (requiredModule && !hasModuleGranted(userContext.modules, requiredModule)) {
        logger.warn(`[AuthGuard] Module "${requiredModule}" not granted — blocked ${location.pathname}`);
        navigate("/", { replace: true });
      }
    }
  }, [loading, profileLoading, userContext, navigate, location.pathname]);

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-brand-500" />
          <p className="text-gray-600 dark:text-gray-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!userContext) return null;

  const requiredRole = getRequiredRole(location.pathname);
  if (requiredRole && !hasAccess(requiredRole, userContext.role)) return null;

  const requiredModule = getRequiredModule(location.pathname);
  if (requiredModule && !hasModuleGranted(userContext.modules, requiredModule)) {
    logger.warn(`[AuthGuard] Module "${requiredModule}" not granted — not rendering ${location.pathname}`);
    return null;
  }

  return <>{children}</>;
}
