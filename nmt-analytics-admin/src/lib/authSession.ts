import { supabase } from './supabase';
import { logger } from '../utils/logger';

/**
 * Single authoritative owner of "the session is gone" handling.
 *
 * Previously three places independently reacted to an expired session — the
 * axios 401 interceptor, AppContext's fetch-context catch block, and the
 * `api-auth-error` window listener. Each called `supabase.auth.signOut()` and
 * the interceptor also performed `window.location.replace('/auth/signin')`.
 *
 * That produced a reload cycle:
 *   /auth/signin loads -> AppProvider fetches /me/context -> 401
 *   -> location.replace('/auth/signin') (a full reload of the page we are on)
 *   -> new JS module instance, in-memory guards reset -> repeat
 *
 * The cycle was self-sustaining because `supabase.auth.signOut()` is a
 * *network* operation: when POST /auth/v1/logout fails (offline, 5xx, or the
 * 429 you get after hammering it in a loop) supabase-js returns the error and
 * leaves the stale session in localStorage. The next document load therefore
 * saw the same stale session and repeated the whole sequence.
 *
 * The rules enforced here:
 *  1. Local storage teardown is synchronous and cannot fail. It never depends
 *     on a network round-trip, so a reload can never resurrect stale state.
 *  2. Never navigate to the page we are already on. On a public auth route we
 *     clear state and stay put.
 *  3. A sessionStorage-backed budget survives reloads, so even an unforeseen
 *     redirect source cannot produce an unbounded cycle.
 */

const PUBLIC_PATH_PREFIXES = [
  '/auth/',
  '/signin',
  '/signup',
  '/reset-password',
  '/waiver/',
  '/portal/subagent/',
  '/public/forms/',
];

const SIGN_IN_PATH = '/auth/signin';

/** sessionStorage key holding the cross-reload redirect budget. */
const REDIRECT_BUDGET_KEY = 'travline_auth_redirect_budget';
const REDIRECT_BUDGET_MAX = 2;
const REDIRECT_BUDGET_WINDOW_MS = 15_000;

/** Non-Supabase auth artefacts this app has written over its lifetime. */
const LEGACY_TOKEN_KEYS = [
  'nmt_auth_token',
  'nmt_token',
  'nmt_refresh_token',
  'nmt_user',
  'travline_auth_token',
];

/**
 * True when `pathname` is a route that must work while signed out. Protected
 * API calls must never be issued from these routes, and they must never be the
 * target of a "go to sign-in" redirect.
 */
export function isPublicAuthPath(pathname: string = window.location.pathname): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

/**
 * Remove every local auth artefact synchronously. No network, no promises,
 * nothing that can fail and leave a stale token behind.
 */
export function clearLocalAuthStorage(): void {
  try {
    for (const key of LEGACY_TOKEN_KEYS) {
      localStorage.removeItem(key);
    }

    // Supabase persists under `sb-<project-ref>-auth-token` (plus sibling keys
    // such as `-code-verifier`). Collect first, then delete: removing while
    // iterating shifts the index.
    const supabaseKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.includes('-auth-token')) {
        supabaseKeys.push(key);
      }
    }
    for (const key of supabaseKeys) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    logger.warn('[authSession] Failed to clear local auth storage', err);
  }
}

/**
 * Called after a real sign-in or a successful authenticated request. Releases
 * the redirect budget so a later genuine expiry can still redirect once.
 */
export function markSessionEstablished(): void {
  isHandlingExpiredSession = false;
  try {
    sessionStorage.removeItem(REDIRECT_BUDGET_KEY);
  } catch {
    /* sessionStorage unavailable — nothing to release */
  }
}

/**
 * Consume one unit of the cross-reload redirect budget.
 * Returns false once the budget for the current window is exhausted, which is
 * what makes a reload cycle terminate instead of running forever.
 */
function consumeRedirectBudget(): boolean {
  const now = Date.now();

  let count = 0;
  let windowStart = now;

  try {
    const raw = sessionStorage.getItem(REDIRECT_BUDGET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { n?: number; t?: number };
      if (typeof parsed.t === 'number' && now - parsed.t < REDIRECT_BUDGET_WINDOW_MS) {
        count = typeof parsed.n === 'number' ? parsed.n : 0;
        windowStart = parsed.t;
      }
    }
  } catch {
    /* unreadable budget — treat as a fresh window */
  }

  if (count >= REDIRECT_BUDGET_MAX) {
    logger.warn(
      `[authSession] Redirect budget exhausted (${count} in ${REDIRECT_BUDGET_WINDOW_MS}ms) — staying put`
    );
    return false;
  }

  try {
    sessionStorage.setItem(
      REDIRECT_BUDGET_KEY,
      JSON.stringify({ n: count + 1, t: windowStart })
    );
  } catch {
    /* sessionStorage unavailable — allow the redirect, budget is best-effort */
  }

  return true;
}

/**
 * In-memory latch. Deduplicates the burst of parallel 401s inside one SPA
 * lifetime. It is deliberately NOT the mechanism that stops a reload cycle —
 * `consumeRedirectBudget` is, because it survives reloads.
 */
let isHandlingExpiredSession = false;

/**
 * The single entry point for "this session is no longer usable".
 *
 * Idempotent within a page lifetime. Clears local state first, then tells
 * Supabase to revoke in the background, then navigates at most once — and
 * never to a page we are already on.
 */
export function handleExpiredSession(reason: string): void {
  if (isHandlingExpiredSession) {
    logger.log(`[authSession] Already handling expired session (${reason}) — ignoring`);
    return;
  }
  isHandlingExpiredSession = true;

  logger.warn(`[authSession] Session expired (${reason}) — clearing local auth state`);

  // 1. Deterministic local teardown. Must happen before anything async so a
  //    reload from any source cannot observe the stale token again.
  clearLocalAuthStorage();

  // 2. Best-effort remote revoke. Deliberately not awaited: its failure must
  //    never block or skip the steps below.
  void supabase.auth
    .signOut({ scope: 'local' })
    .catch((err) => logger.warn('[authSession] supabase signOut failed (ignored)', err));

  // 3. Navigate at most once, and never to the page we are already on.
  //    A signed-out visitor sitting on /auth/signin gets no toast and no
  //    navigation: there is nowhere to send them and nothing to warn about.
  if (isPublicAuthPath()) {
    logger.log('[authSession] Already on a public auth route — no navigation');
    return;
  }

  // 4. Let the UI react (toast, state reset) on authenticated routes only.
  window.dispatchEvent(
    new CustomEvent('api-auth-error', { detail: { message: 'Session expired', reason } })
  );

  if (!consumeRedirectBudget()) {
    return;
  }

  window.location.replace(SIGN_IN_PATH);
}
