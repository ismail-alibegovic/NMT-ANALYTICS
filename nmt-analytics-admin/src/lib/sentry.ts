import * as Sentry from '@sentry/react';

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
    // Session replay and performance tracing are disabled in early stage
    // to keep bundle/telemetry costs minimal and avoid surfacing PII.
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

/**
 * Manually capture a client-side error that did not propagate to a React
 * error boundary (e.g. async callback failures). Falls through silently
 * when Sentry is uninitalised.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
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
