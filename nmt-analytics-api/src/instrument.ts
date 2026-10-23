// Initialize the same environment boundary before reading monitoring settings.
import './environment';
import { sanitizeSentryEvent, isValidSentryDsn } from './lib/sentryPrivacy';
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

export const sentryEnabled = isValidSentryDsn(dsn);

if (sentryEnabled) {
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
    beforeSend: sanitizeSentryEvent,
  });
  console.log(
    '[sentry] initialised —',
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  );
} else {
  console.log('[sentry] SENTRY_DSN absent or invalid — error capture disabled.');
}

export default Sentry;

