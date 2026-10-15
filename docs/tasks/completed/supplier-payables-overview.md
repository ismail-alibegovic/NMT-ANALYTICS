# M20.2 — Supplier payable overview

**Status:** ACTIVE
**Priority:** P1
**Branch:** feature/supplier-payables-overview
**Roadmap:** M20, M24
**Baseline:** 9575ce6f6bb03da2ee798f59d31be694a0001e6b
**Authority:** User approved continuing the announced supplier overview/due-obligation sequence.

## Goal and discovery
Finance managers can inspect issued obligations across departures, filter supplier and open/overdue/paid/cancelled states, and open the owning departure to settle. M20.1 ledger, finance hub, authorization, i18n and acceptance inspected. Baseline API 741/admin 322 tests and both builds pass. The previous local clone was stale; implementation uses an isolated archive of current GitHub main.

## Scope and domain
Read-only paginated overview, supplier filter, currency-separated outstanding/overdue/due-today totals over the entire filtered result, not just the current page. Balances use every signed ledger entry in one database snapshot. Cancelled obligations contribute no financial exposure. Overdue means remaining > 0 and due date before the agency calendar day; due today is separate. Calendar day uses organization timezone, default Europe/Sarajevo for missing/invalid configuration, and is shown explicitly. Deterministic due-date/id order, 25 rows per UI page, bounded API page size. Existing departure finance workflow owns mutations.

## API, database and security
Manager-only GET /supplier-payables with validated supplierId/status/page/pageSize. Organization comes only from authenticated context. Add a private SECURITY INVOKER read RPC with fixed empty search_path for consistent totals and pagination beyond PostgREST row limits. Append-only migration; no new tables, business writes, backfill, grants to clients or changed ledger guards. Composite tenant joins and explicit org predicates. Foreign supplier filter returns empty without revealing existence. No mutation audit needed. Rollback: remove the overview entrypoint; additive RPC may remain.

## UI
Existing Finance hub, manager-only panel. BS/EN, light/dark, 1440/390px; loading, empty, error and retry states. Ignore obsolete network responses on filter/page change and hide stale totals while loading or failed. Currency totals never combined. Link each row to departure finance. No broad redesign or provider messages.

## Out of scope
Today/HomeHub signals, automatic reminders, bank execution, FX, accounting, attachments, arbitrary bills, aging buckets, exports and changes to settlement semantics. These remain later tasks.

## Acceptance and verification
Tenant/role denial; filtered totals across pages; mixed currency; payment/reversal and cancelled history; past/today/future boundaries; malformed filters/pagination; zero rows; complete ledger >1000 entries; server snapshot response. API/admin npm ci/build/tests, admin lint, migration replay, Docker, BS desktop/EN mobile browser flow through real isolated API/DB. Preview health before merge; production structural verification and health only, no synthetic financial records. Completion evidence/files/SHA/PR recorded in PR body; archive M20.1 spec with PR88 release evidence.
