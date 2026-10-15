# M19.3 — Atomic quotation creation and fixed booking context
**Status:** ACTIVE
**Baseline:** 19e8d35e374cbc1b603a244833ed4b2da14e4615
**Priority:** P0/P1
**Branch:** fix/atomic-quotation-snapshot
**Authority:** User requested sequential completion of Travline.

## Problem
Quotation creation ignores source/item/totals failures, so it can return 201 with an incomplete snapshot. Count+1 references collide under concurrent creation and can reuse deleted sequence numbers. Quote items survive itinerary edits, but source dates/traveler/contact fields remain live and cannot safely drive booking.

## Scope
One service-only SECURITY INVOKER RPC is explicitly justified: header, item copies, persisted pricing, source context and reference allocation must succeed or roll back together. One database transaction creates the header, copies validated source/manual items, computes totals from persisted numeric values and allocates an org/year reference counter. The authenticated API validates payload and actor/org, calls this transaction and maps expected errors; no false success on snapshot failures. Save immutable-at-creation booking_context containing itinerary/version identity, itinerary title/trip type/destination/date range/travelers/currency and inquiry contact context, scoped to the same org. Accepted guard from M19.2 also freezes this context. Display source context in BS/EN quotation detail for review. No historical context invented/backfilled.

## Invariants
API-first; agent role; explicit organization filters, actor/org validation, existing composite foreign keys/RLS. New reference counter table RLS closed to clients/service only. Quotation and item writes are denied to PUBLIC/anon/authenticated and remain available to the service API; existing tenant SELECT/RLS stays. No public RPC execution, definer, FX, real messaging or money writes. Header/source context/item errors roll back the reference counter and the whole quotation.

## Deferred
Actual quote-to-reservation conversion, standalone travel planning, mixed-currency draft item editing, historical quote remediation and general request idempotency.

## Acceptance
Concurrent distinct creates produce unique references with complete persisted snapshots; currency/source/supplier validation failure creates no quote and consumes no reference; source mutations cannot change saved context or accepted prices. RPC unavailable/failed never returns 201. No cross-org context or relations. Complete API/admin/migration/Docker CI, direct transaction SQL tests, isolated BS/EN browser scenarios and Vercel Preview before additive production migration/merge.
