# P0 — Release temporary sale capacity on failed creation and concurrent retries
**Status:** ACTIVE
**Priority:** P0
**Branch:** fix/sale-capacity-retry-cleanup
**Baseline:** fc4c336f40297dac5709f5b7223d4d2c05ccb9cb
**Roadmap references:** M24 hardening; prerequisite for M19 accepted quote booking
**Authority:** User requested sequential completion of Travline.

## Observed problem
The reservation insert-conflict idempotency branch returns before releasing the capacity hold acquired earlier in this request. Customer upsert failure also returns after acquiring a hold. Temporary cached occupancy can then exceed the reservation actually created and block remaining capacity. Reproduce the conflict path with deterministic API tests and isolated simultaneous requests.

## Scope
Track only this request's unattached capacity hold. Release it before all failed-insert/duplicate-return paths and customer upsert failures, and on thrown pre-insert errors. Once a reservation exists, its occupancy is owned by the existing workflow; preserve its existing later-stage cleanup behavior. Release at most once per request; never report retry success if cleanup failed.

## Deferred
Full atomic sale creation, crash-safe persistent hold leases and historical occupancy-floor reconciliation. Existing production booked floors are compatibility data; do not blindly rewrite them.

## Invariants
API-first, existing authenticated agent role and server org scoping. Release uses authenticated org, validated departure and the exact held party size. No financial writes, passenger duplication, cancelled-sale revival, schema change, UI redesign or reordering customer creation.

## Acceptance and tests
API tests for duplicate insert winner lookup, conflicting key, failed customer upsert, thrown insert and failed release. Real same-key concurrent sale yields one reservation; remaining departure capacity can still be booked. Different tenant cannot affect holds. Full API/admin CI/build/lint, migration/Docker and isolated acceptance/Preview before merge.
