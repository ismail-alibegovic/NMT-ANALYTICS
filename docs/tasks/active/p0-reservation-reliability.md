# P0 — Reservation read, filter and retry correctness

Status: ACTIVE. Branch: `fix/p0-reservation-reliability`. Base: verified main `de514c37bc9605dd41170fda2f944c0de18fb9d8`; #158/#159 consolidated and required CI green. No translation-only tasks in this batch.

Goal: reservations shown to an operator must match active filters and successful reads. Fix the confirmed list status/date/clear/invalidation defects, false-empty failure states, superseded requests, and misleading Detail child-read empties together as one workflow batch. Keep existing layout, API/org boundaries and user-entered data. Existing BS/EN strings remain; add only feedback required for these functional repairs.

List requirements: changing status/dates/search/assignment/departure/page must load the matching query; clear filters actually reloads; invalidation retains search. Reject stale successes/errors, show explicit failed-read/retry rather than no-reservations, and clear bulk selection when rows/query are refreshed so hidden stale IDs cannot be submitted. Language changes retain current query/selection without refetch.

Detail requirements: distinguish genuine not-found from transport failure, ignore superseded route reads, preserve each child section's unavailable/error state and allow explicit retry. Failed passenger/accommodation/schedule/contracts reads must not look like genuine empty results. Financial controls requiring the schedule and contract-generation controls requiring known history stay disabled until those reads succeed. Reset open mutation dialogs on route change. Existing role/recovery restrictions, canonical financial amounts and snapshot sourcing remain unchanged.

No API mutation or schema changes, production/customer writes, seeds or Zo runtime operations. The existing non-atomic core/accommodation save remains an explicit separate P0 write-integrity batch before P1; this read batch does not claim to fix it.

Acceptance: failing regression first for each confirmed defect; meaningful request parameters, empty-vs-error and stale response tests, role/payment gates, retry recovery, BS/EN functional feedback and actual browser filter/retry flow in light/dark/mobile/desktop. Full API/admin and required isolated CI before merge. Update the authoritative roadmap with actual results and deferred P0 work; no new PR until this batch is complete and reviewable.

Browser discovery within this batch: clearing filters and immediately entering search can restore an old date because shared query setters capture outdated URLSearchParams before navigation commits. A deterministic regression reproduces the stale date. Fix the shared hook with write-through pending query state synchronized to committed router location, preserving unrelated keys and external navigation. This is required for correct filters, not a cosmetic refactor.
