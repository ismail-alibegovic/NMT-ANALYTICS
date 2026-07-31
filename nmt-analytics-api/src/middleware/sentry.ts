import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { sentryEnabled } from '../instrument';

/**
 * Express middleware that tags each Sentry event with the authenticated
 * user's id, role, and current tenant (org_id). Falls through silently
 * when there is no authenticated context (unauthenticated routes).
 *
 * Uses the request-scoped isolation scope rather than the global scope —
 * `Sentry.setTag` on the global scope leaks tenant identity across
 * concurrent requests in a single Node process, which would attribute one
 * tenant's error to another under load.
 *
 * Mount AFTER authenticateToken / requireOrgContext so the request scope is
 * populated, and BEFORE route handlers run.
 */
export function sentryRequestContext(req: Request, _res: Response, next: NextFunction): void {
  if (!sentryEnabled) return next();

  const user = (req as any).user;
  const orgId = (req as any).orgId;
  const requestId = (req as any).id || req.header('x-request-id');

  const scope = Sentry.getIsolationScope();

  if (user?.id) {
    // Email is intentionally omitted — sendDefaultPii is false and tenant
    // debugging only needs a stable id.
    scope.setUser({ id: user.id });
  }
  if (orgId) {
    scope.setTag('tenant.org_id', orgId);
  }
  if (user?.role) {
    scope.setTag('user.role', user.role);
  }
  if (requestId) {
    scope.setTag('request.id', String(requestId));
  }
  scope.setTag('http.route', `${req.method} ${req.path}`);

  next();
}

/**
 * Express error handler. Must be registered after all routes and before the
 * global JSON error handler.
 *
 * 4xx client errors (validation failures, 401/403/404) are expected traffic,
 * not defects — capturing them buries real incidents. Only unexpected
 * failures (5xx / unclassified) are sent.
 */
export function sentryErrorHandler(err: any, _req: Request, _res: Response, next: NextFunction): void {
  if (!sentryEnabled) return next(err);

  const status = Number(err?.status || err?.statusCode || 0);
  const isExpectedClientError =
    (status >= 400 && status < 500) ||
    err?.name === 'ZodError' ||
    err?.code === 'VALIDATION_ERROR';

  if (!isExpectedClientError) {
    Sentry.captureException(err);
  }

  next(err);
}

/**
 * Capture a handled failure that never reaches the error middleware — e.g. a
 * background job, a fire-and-forget email send, or a caught-and-logged
 * Supabase error that silently degrades a response.
 */
export function captureHandled(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) return;

  if (!context) {
    Sentry.captureException(err);
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setTag(key, String(value));
    }
    Sentry.captureException(err);
  });
}

export default Sentry;
