import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Initialise Sentry for the API process.
 *
 * Pulls DSN from the SENTRY_DSN environment variable (set in Settings → Advanced).
 * If DSN is absent, init is a no-op — the SDK does not capture or transmit
 * anything. This makes the integration safe to ship before a project DSN exists:
 * ops log normally, and we flip one env var to switch it on.
 *
 * Per-tenant context: we attach `org_id` and `user.id` to every captured event
 * so a single Sentry project can surface silent failures scoped to a tenant.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] SENTRY_DSN not set — error capture disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip Authorization headers defensively; Sentry would otherwise
      // surface the request body which can leak credentials via the
      // request handler scope below.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  console.log('[sentry] initialised for environment:', process.env.NODE_ENV || 'development');
}

/**
 * Express middleware that tags each Sentry event with the authenticated
 * user's id, role, and current tenant (org_id). Falls through silently
 * when there is no authenticated context (unauthenticated routes).
 *
 * Mount this AFTER authenticateToken / requireOrgContext so the request
 * scope is populated, and BEFORE route handlers run.
 */
export function sentryRequestContext(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as any).user;
  const orgId = (req as any).orgId;

  if (user?.id) {
    Sentry.setUser({ id: user.id, email: user.email });
  }
  if (orgId) {
    Sentry.setTag('tenant.org_id', orgId);
  }
  if (user?.role) {
    Sentry.setTag('user.role', user.role);
  }

  next();
}

/**
 * Express error handler. Must be registered as the last middleware in the
 * chain (after all routes) to capture unhandled rejections/throws as Sentry
 * events. Re-throws to the default Express error path so the JSON 500 still
 * reaches the client without Sentry swallowing it.
 */
export function sentryErrorHandler(err: any, _req: Request, _res: Response, next: NextFunction): void {
  Sentry.captureException(err);
  next(err);
}

export default Sentry;
