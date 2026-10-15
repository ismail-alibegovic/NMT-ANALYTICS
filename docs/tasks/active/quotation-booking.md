# M19.4 — Accepted quotation to existing departure booking
**Status:** ACTIVE
**Priority:** P1
**Branch:** feature/quotation-booking
**Roadmap references:** M19 connected inquiry/quote/booking; M24 acceptance
**Baseline:** 3369d657cbf7bd5ff8b155817c5f24a4bbd51581
**Authority:** User explicitly requested sequential completion and continuation.

## 1. Goal
An agent can book an accepted itinerary quotation into one compatible existing departure without retyping its commercial terms. The resulting reservation and named travelers use the approved total/currency and retain the original quote context. Repeated/concurrent conversion creates one booking.

## 2. Current problem
Quotes have immutable context/prices, but no booking link or conversion UI/API. Normal sale creation is multi-step and can need recovery; a quote-specific transaction can avoid partial handoff.

## 3. Required discovery
Inspect quote/create/reservation/capacity routes, snapshot and edit UI, migrations/FKs, role/auth/audit, BS/EN, existing tests. Existing package.itinerary_id and reservation/passenger/customer models are reused.

## 4. Scope
Service-only SECURITY INVOKER RPC is justified: quote row serialization, capacity hold, customer resolution, reservation, approved snapshot and passenger insertion must commit/roll back together. Add nullable organization-safe unique quotation_id on reservations. Existing quote lookup precedes new creation and returns same reservation on identical retry; changed conversion inputs conflict. API options endpoint returns only compatible active departures. UI collects customer contact and one traveler name per saved traveler, shows fixed quote total, and links saved booking from quote and reservation.

## 5. Out of scope
Automatic package/departure provisioning, standalone/legacy quotes without saved trip context, partial quote bookings, re-pricing/amendments, automatic room/seat assignment, installments at conversion, supplier payables, FX, real communication and general sale recovery redesign. Ordinary operational reservation changes remain governed by existing flows; original quote context stays historical.

## 6. Domain rules
First conversion requires accepted quote with nonempty saved itinerary context and positive traveler count. Departure belongs to same org, same itinerary-backed package and quote currency; departure/return calendar dates match saved quote dates in the organization's configured timezone. Ignore mutable package price/services. Named passenger count must equal saved traveler count. Reuse existing reserve_capacity_atomic inside the transaction; failed downstream writes roll back holds. One quote has one booking even if cancelled; use cancellation rather than hard deletion. Preserve approved total/currency, quote link and quotation_snapshot against later edits; allow operational metadata/status changes. Quoted services are commercial snapshots; rooms/seats still require operational review.

## 7. API
Agent-authenticated POST /quotations/:id/booking; agent GET /quotations/:id/booking-options; quotation detail includes linked booking. Server org/actor only, validated UUID/contact/passenger list, stable request fingerprint. Useful 404/409/422 errors; material creation audited once. Reservation PATCH/DELETE must reject protected quote terms/deletion before any capacity changes.

## 8. Database
Append-only migration. Composite (quotation_id,org_id) FK and unique org/quote linkage. Private invoker functions with fixed search paths; no anon/auth RPC execution. New quote-linked reservation writes are denied to anon/auth to prevent API role bypass; normal records unaffected. Immutable commercial snapshot guard. No historical backfill. Rollback leaves additive schema; stop using new conversion endpoint before any function removal.

## 9. UI
QuotationDetail booking entry/form with loading/empty/error/saved states, one existing departure selector, fixed approved total, captured contact prefill and named travelers. Existing booking link takes precedence. Reservation backlink and protected price edit controls. BS/EN, 1440px desktop/390px mobile, existing light/dark styles.

## 10. Security
Explicit org filtering everywhere; no cross-tenant quote/departure/customer/booking resolution. Same-org actor validation. No secret exposure, no client amount override, no real provider sends.

## 11–13. Acceptance and verification
Baseline API/admin relevant suites; API input/RPC/error/role/org and edit-guard tests; SQL transaction rollback/price/uniqueness/privilege checks; real concurrent same-quote booking, different payload conflict, capacity contention, incompatible date/currency/org rejection, persisted prices despite package edits, and BS/EN browser conversion/backlinks. Complete npm ci/build/test, admin lint, migration replay, Docker, isolated E2E and Vercel Preview before production DDL and merge.

## 14–15. Completion
Report branch, exact files, migration applied status, security, actual test/browser results, deferred provisioning/operational work, final SHA/PR and production verification. Fill release evidence only after acceptance.
