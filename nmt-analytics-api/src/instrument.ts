// dotenv is loaded here rather than in index.ts because this module reads
// SENTRY_DSN at import time and must run before express is loaded.
import 'dotenv/config';
import * as Sentry from '@sentry/node';

/**
 * Sentry initialisation. MUST be imported before express and before any
 * application module — the SDK patches http/express at require time, and
 * instrumentation applied after those modules load silently does nothing.
 *
 * `src/index.ts` imports this file on line 1 for exactly that reason.
 *
 * When SENTRY_DSN is unset, init is skipped entirely: no network calls, no
 * patching, no overhead. `sentryEnabled` lets the rest of the codebase skip
 * scope work in that state instead of paying for no-op SDK calls on every
 * request.
 */
const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Bots and scanners generate a constant trickle of malformed-request noise
    // against a public endpoint. None of it is actionable.
    ignoreErrors: [
      'ECONNRESET',
      'EPIPE',
      'request aborted',
      'Request aborted',
    ],
    beforeSend(event) {
      // Credentials must never leave the process. Sentry attaches request
      // headers by default via the express integration.
      const headers = event.request?.headers;
      if (headers) {
        delete headers.authorization;
        delete headers.Authorization;
        delete headers.cookie;
        delete headers.Cookie;
        delete headers['x-supabase-auth'];
      }
      // Request bodies on this API routinely contain customer PII (passport
      // numbers, addresses, payment amounts). Drop them wholesale.
      if (event.request) {
        delete event.request.data;
      }
      return event;
    },
  });
  console.log(
    '[sentry] initialised —',
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  );
} else {
  console.log('[sentry] SENTRY_DSN not set — error capture disabled.');
}

export default Sentry;
