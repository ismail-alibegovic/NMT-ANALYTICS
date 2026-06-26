import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import { logger } from "../../utils/logger";
import { hasAccess } from "../../types/roles";

interface AuthGuardProps {
  children: React.ReactNode;
}

const routeRequirements: { prefix: string; minRole: Parameters<typeof hasAccess>[0] }[] = [
  { prefix: "/admin/audit-logs", minRole: "director" },
  { prefix: "/settings", minRole: "director" },
  { prefix: "/payments", minRole: "manager" },
  { prefix: "/payment-dashboard", minRole: "manager" },
  { prefix: "/transactions", minRole: "manager" },
  { prefix: "/reports", minRole: "manager" },
  { prefix: "/integrations", minRole: "manager" },
  { prefix: "/admin/documents", minRole: "manager" },
];

function getRequiredRole(pathname: string) {
  return routeRequirements.find(route => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))?.minRole;
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

  return <>{children}</>;
}
