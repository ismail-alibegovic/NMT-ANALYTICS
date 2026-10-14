# P0-01 — Close legacy financial writes

**Status:** DONE — included in PR #79, merge `a7f6c4b`, 2026-10-14
**Priority:** P0
**Branch:** `fix/p0-legacy-transaction-bypass`
**Baseline:** `7c1794f5f7a8cf218ff7b92104797ee693efae79`
**Scope authority:** user request and P0-01 in `Travline-roadmap/PILOT_AUDIT_REVALIDATED_2026-10-11.md`; M14 finance context.

## Problem and decision

`POST /transactions` inserts legacy payment/refund records and separately increments reservation paid_amount by unscoped ID, ignoring update errors. Transaction edits/deletes never reconcile it. Reservation PATCH also accepts paidAmount directly. Demo seed scripts write cached finance fields. The transactions table permits only payment/refund types; no admin component calls its mutation helpers. Supported collection, correction, void/refund and installments already use `/payments`.

Retire legacy transaction mutations rather than translate/replay ambiguous history into new payments. Preserve tenant-scoped historical reads. No historical records are deleted, converted, deduplicated or backfilled. A ledger-cache guard rejects inconsistent direct database writes, including old scripts. Seed workflows create payment rows.

## Acceptance criteria

1. Authenticated manager-or-higher transaction reads/mutations only, matching `/payments`; lower roles denied before database access.
2. POST accepts both legacy reservation ID spellings for ownership validation. Foreign/missing IDs return 404 with zero writes. Conflicting/invalid IDs return 400. Own or unlinked requests return 410 `LEGACY_TRANSACTIONS_READ_ONLY` with canonical endpoint guidance. PATCH/DELETE resolve transaction by ID + org and return 404 or 410. Lookup failures surface as errors, never success.
3. POST/PATCH reservations reject all camel/snake-case paid amount, balance and payment status inputs, before side effects; agent minimum for these booking mutations. Ordinary booking updates remain supported.
4. Database transactions history is read-only, including cascaded deletion and truncation. No new legacy records or history mutation can bypass the API retirement.
5. New reservations start unpaid; balance equals total. Cache writes must equal SUM(succeeded payments), max(total - sum, 0), and derived payment status. Sequential canonical inserts, corrections, status changes, moves and deletion continue to recalculate correctly. Legacy transactions never contribute or duplicate ledger totals.
6. Migration is append-only, makes no historical data updates, and is tested only locally. Existing inconsistencies require reviewed reconciliation; never blindly copy legacy amounts to payments.
7. Regression tests and full API tests/build pass; PostgreSQL replay and SQL regression checks pass. No production changes, merge, or deployment.

## Verification and boundaries

HTTP regressions use two-tenant mocks and real authorization middleware; PostgreSQL checks run on a disposable local database and are wired into migration replay. Admin has no visual changes; remove the unsupported input type and run its existing checks. Browser-to-production verification is excluded.

P0-04 concurrency/idempotency and P1-02 currency/tenant constraints at the canonical ledger boundary remain separate work. This task does not certify concurrent payment safety or repair existing drift. Excursion passenger paid_amount is a separate model, not a reservation balance. Archived migrations/scripts are retained; the new database guard rejects inconsistent writes from them.

Historical transaction retention intentionally blocks hard deletion of a reservation/organization with legacy history. Cancel the booking instead. Existing history-dependent reporting remains historical; financial reporting must use canonical payments. A deployment operator must inspect and reconcile old discrepancies against receipts/bank records before resuming collections. Do not roll back by reopening legacy writes; forward-fix under review.
