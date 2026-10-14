# M18.1 — Today supplier readiness

**Status:** ACTIVE
**Priority:** P1
**Branch:** fix/today-readiness
**Roadmap references:** M18 Today/readiness, M16 supplier confirmations
**Authority:** User requested sequential completion of Travline on 2026-10-14.

## 1. Goal
Show actual outstanding supplier confirmations for near departures in the Today queue, linking directly to the departure finance tab.

## 2. Current problem
Supplier confirmations exist but HomeHub never loads them. Existing readiness-summary has no supplier signal. Existing flight/document/rooming flows must remain unchanged in this slice.

## 3. Discovery
Inspected HomeHub, readiness-summary, supplierConfirmations, API client, role helpers, translations and tests. Supplier board counts unconfirmed/requested as outstanding and ignores confirmed/cancelled. Supplier board is manager-gated.

## 4. Scope
Extend existing org-scoped batch summary with manager-only outstanding counts and label/date metadata. Add one HomeHub batch read alongside existing loads; no per-departure supplier requests. Link alerts to ?tab=finance. Preserve failure visibility and BS/EN parity.

## 5. Deferred
Canonical rooming summary overhaul, other Today signals, supplier payments, quotation conversion and broad redesign.

## 6. Rules / API
Authenticated org-context reads only; query only current org and selected departure IDs. Lower roles do not query supplier cost records or receive supplier counts. No financial amounts or supplier identities in summary. Query failures return errors, never readiness success. Preserve existing confirmation semantics.

## 7. Database
No migration or mutation.

## 8. UX
Existing Today queue only, near-departure window retained, BS/EN copy, same responsive and dark styling. Failed summary uses existing queue-error state.

## 9. Acceptance
Manager sees outstanding count and finance link; confirmed/cancelled do not count; agent sees no supplier data; no alerts from other org/departures; failed query not silently treated as ready.

## 10. Verification
API tests for counts, role and org/ID filters, error handling; admin queue/link and error tests; isolated browser workflow in both languages and desktop/mobile; full CI API/admin test/build/lint, migration replay/Docker, Vercel Preview health before merge.
