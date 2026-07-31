import * as Sentry from '@sentry/react';

/**
 * Whether Sentry has a DSN and was actually initialised. Read this instead of
 * probing the SDK — the SDK's no-op mode is silent and indistinguishable from
 * a working client, which makes "is telemetry live?" impossible to answer in
 * the UI or in a smoke test.
 */
let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Initialise Sentry for the admin SPA.
 *
 * DSN comes from VITE_SENTRY_DSN (bundled at build time) so secrets never
 * reach the browser. If absent, init is a no-op — the SDK does not capture
 * or transmit anything, and the bundle stays untouched in terms of network
 * traffic.
 *
 * Distinct from the API process's DSN: each surface (browser + server) has
 * its own Sentry project for clean separation of client vs. backend errors.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'development',
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) || 'travline-admin@dev',
    // Session replay and performance tracing are disabled in early stage
    // to keep bundle/telemetry costs minimal and avoid surfacing PII.
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Browser noise that is never actionable: extension bridges, aborted
    // navigations, and ResizeObserver churn would otherwise dominate the
    // issue feed and bury real tenant failures.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'runtime.lastError',
      'FrameDoesNotExistError',
      'Could not establish connection',
      'Receiving end does not exist',
      'AbortError',
      'Load failed',
    ],
    beforeSend(event) {
      // Defensive scrub: never let a bearer token or Supabase session ride
      // along in a captured request payload.
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
        delete event.request.headers.Cookie;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  enabled = true;
}

/**
 * Attach the signed-in identity + tenant to every subsequent event. Called
 * from AppContext once the user context resolves, so a single Sentry project
 * can be filtered per tenant (`tenant.org_id`) and per role.
 */
export function setSentryUser(ctx: {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  orgId?: string | null;
  orgName?: string | null;
} | null): void {
  if (!enabled) return;

  if (!ctx) {
    Sentry.setUser(null);
    Sentry.setTag('tenant.org_id', undefined);
    Sentry.setTag('tenant.org_name', undefined);
    Sentry.setTag('user.role', undefined);
    return;
  }

  Sentry.setUser(ctx.userId ? { id: ctx.userId, email: ctx.email || undefined } : null);
  if (ctx.orgId) Sentry.setTag('tenant.org_id', ctx.orgId);
  if (ctx.orgName) Sentry.setTag('tenant.org_name', ctx.orgName);
  if (ctx.role) Sentry.setTag('user.role', ctx.role);
}

/**
 * Record a non-fatal navigation/action breadcrumb. Breadcrumbs are what turn
 * "TypeError on /reservations" into "TypeError after the user opened the
 * NewSaleWizard and picked departure X".
 */
export function addSentryBreadcrumb(
  message: string,
  category = 'app',
  data?: Record<string, unknown>
): void {
  if (!enabled) return;
  Sentry.addBreadcrumb({ message, category, level: 'info', data });
}

/**
 * Manually capture a client-side error that did not propagate to a React
 * error boundary (e.g. async callback failures). Falls through silently
 * when Sentry is uninitalised.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, String(value));
      }
      Sentry.captureException(err);
    });
    return;
  }
  Sentry.captureException(err);
}

export default Sentry;
