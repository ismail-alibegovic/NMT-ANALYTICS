# M19.2 — Preserve accepted quotation commercial terms
**Status:** COMPLETED
**Priority:** P0
**Branch:** fix/accepted-quotation-lock
**Baseline:** fac23fa16c781494bae8d1f6afd5e66533f32b26
**Authority:** User requested sequential completion of Travline.

## Problem
Quotation item mutations and header PATCH allow accepted commercial terms to change, including resetting the status. API-only checks cannot prevent acceptance and item edits racing.

## Scope
Append-only database triggers serialize quotation item writes against acceptance and freeze accepted commercial fields and line items permanently, including accepted quotes subsequently rejected/expired. Allow internal-note corrections and rejected/expired lifecycle updates while preserving accepted_at. On first acceptance validate nonempty, single-currency persisted items and derive totals from those persisted numeric values. Preserve existing accepted totals without historical rewrites. API validates PATCH, returns meaningful conflict/invalid-price errors, and checks org-scoped locks before item writes. UI hides accepted item controls, fixes existing source read-only text and adds BS/EN accepted-price notice.

## Deferred
Atomic quotation creation/reference allocation, booking-context snapshot, mixed-currency draft editing, actual quote-to-reservation conversion, historic approved-price corrections and whole-organization erasure workflow. These need subsequent small specs; do not claim the quotation lifecycle complete.

## Invariants
API-first; authenticated agent mutations; org-scoped lookups and existing composite foreign keys/RLS preserved. An approval-lock flag preserves legacy accepted quotes without inventing an acceptance date; no new table, RPC, FX, production bookings, financial payments or real communication. Trigger functions SECURITY INVOKER, fixed empty search path, no PUBLIC/anon/auth direct execution.

## Acceptance
Draft item CRUD remains usable; accepted and ever-accepted quotes reject item add/update/delete and commercial-header/reset requests; internal notes remain editable; concurrent acceptance/item writes cannot change approved terms; empty/mixed-currency acceptance rejects with 422. Tenant/role rejection remains. API/admin baseline, focused regressions, complete CI, migration replay/Docker, BS/EN desktop/mobile isolated browser acceptance and Vercel Preview before migration/release.

## Migration
Additive triggers only. Only approval-lock metadata is backfilled; historical commercial fields and totals are untouched. Rollback is an append-only migration dropping the two named triggers/functions; API/UI guards remain. Organization deletion of accepted historical quotes is intentionally blocked pending a dedicated erasure workflow.

## Release evidence
PR #85 merged as 19e8d35e374cbc1b603a244833ed4b2da14e4615. Exact-head CI 38659326043 passed (API 693/admin 302); isolated acceptance 38659326004 passed 23/23 without skips. Preview dpl_HCNNtwhGC5oJj5687Lm2zhv7g72Y READY, health 200/database connected/auth bypass false. Migration 20261015001111 applied with repository-aligned history; both private invoker guards verified. Production dpl_4cwiYExkwLCsE2jAJLy5chgnnQ6u READY; public health 200/database connected/auth bypass false.
