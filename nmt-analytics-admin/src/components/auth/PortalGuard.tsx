import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useT } from '../../lib/i18n/context';

interface PortalGuardProps {
  children: React.ReactNode;
}

/**
 * PortalGuard — soft gate for the operator self-service portal.
 *
 * The portal is meant for tenant directors/managers who manage their own org.
 * If `userContext` resolves with no `org` attached (e.g. a stale session, or
 * a stray auth.users row), send them back to sign-in instead of rendering a
 * confusing empty portal. Auth and minimum-role are still enforced by AuthGuard
 * upstream (we only mount portal routes inside <AuthGuard/>).
 *
 * We deliberately do NOT add a second role gate here — the portal reuses the
 * org staff's own auth, so director/manager/agent/viewer may all view landing
 * pages; writable surfaces (PortalSettings branding editor) gate themselves.
 */
export function PortalGuard({ children }: PortalGuardProps) {
  const { t } = useT();
  const { userContext, loading, profileLoading } = useApp();
  const navigate = useNavigate();

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm">{t.portal.guard.loading}</p>
        </div>
      </div>
    );
  }

  if (!userContext || !userContext.org || userContext.org.id === 'error' || userContext.org.slug === 'unknown') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21.75 12A9.75 9.75 0 1 1 2.25 12a9.75 9.75 0 0 1 19.5 0Z" />
          </svg>
        </div>
        <p className="text-base text-gray-700 dark:text-gray-200">{t.portal.guard.noOrg}</p>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/auth/signin', { replace: true })}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            {t.portal.guard.toSignIn}
          </button>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t.portal.guard.backHome}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default PortalGuard;
