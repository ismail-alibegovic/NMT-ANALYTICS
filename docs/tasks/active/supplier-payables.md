# M20.1 — Departure supplier obligations and payment ledger

**Status:** ACTIVE
**Priority:** P1
**Branch:** feature/supplier-payables
**Roadmap references:** M20 supplier payables, M24 acceptance
**Baseline:** 5a578ec876f15153ebe8a1263ee0e9863c719b14
**Authority:** User approved continuing implementation in the proposed supplier-finance-first order.

## 1. Goal
Managers can issue a supplier obligation from an existing departure cost item, set its due date, record partial/full payments and reverse erroneous payment records without deleting history. Customer money and supplier money remain separate.

## 2. Current problem
Cost items and profitability exist, but no authoritative supplier liability/settlement ledger exists. Cost estimates must not silently become debts or double-count paid supplier amounts as another expense.

## 3. Required discovery
Inspect profitability/cost CRUD, supplier organization relationships, money helpers, audit/RBAC, departure finance UI, BS/EN, migrations and test setup. Relevant baseline tests/builds must pass before implementation.

## 4. Scope
Explicit create from cost item with supplier, positive rounded total and date; immutable amount/currency/supplier/source snapshot; one active obligation per cost item. Append-only signed payment/reversal entries, request UUID/fingerprint idempotency and serialized balance checks. A zero-balance obligation can be cancelled (history retained) before correcting/reissuing its source cost. Manager-scoped finance-tab panel with due date, status, remaining balance, payment/reversal history and correction actions.

## 5. Out of scope
Actual bank transfers, payment gateways, accounting/tax rules, FX, multi-obligation allocation, invoice attachments, arbitrary manual obligations, Today reminders, global supplier finance dashboard, automatic payables from confirmations and broad profitability/UI refactors. Recorded payments are bookkeeping entries only.

## 6. Domain rules
Payable amount comes from persisted cost quantity × unit cost, rounded once to two decimals; source supplier/org/departure/currency are server-derived. No client amount override at issue. No overpayment, duplicate reversal or cross-currency settlement. Reversal equals the original payment, on the same obligation. Balances derive from signed immutable entries, not client/cache fields. Active obligations freeze financial source cost fields. Cancel only when signed balance is zero; cancelled obligations cannot receive new entries. Identical retries return the existing record; conflicting request IDs return 409. Customer payments and profitability formulas are unchanged.

## 7. API
Manager GET/POST /departures/:id/supplier-payables; POST /supplier-payables/:id/entries and /supplier-payables/:id/cancel. Validated UUID/date/cent precision, server org/actor, private invoker transaction RPCs justified by locking/idempotency/balance rules. Useful 400/404/409/422 responses; audit material writes once, no duplicate retry audits. Cost edit/delete conflicts return 409 before success.

## 8. Database
Append-only migration with org-safe FKs and indexed relations. RLS organization policies plus no anon/authenticated table privileges; only API service writes. All RPCs private, invoker, fixed empty search path. Header immutable except validated cancellation, ledger append-only. Lock payable before sum/entry writes and cost before issue. A private JSON aggregation reader returns complete history in one snapshot without embedded API row limits truncating money. Preserve historical source records via restrictive FKs. No historical backfill or real payment writes. Rollback retains schema/guards for any issued obligations; disable new entry points before reverting application code.

## 9. UI
Existing DepartureDetail finance tab only. New self-contained panel, loading/error/empty/retry states, explicit record-only explanation, confirmation forms, BS/EN parity, light/dark and 1440/390px. Keep request key/payload across ambiguous retries; never silently issue another payment on a network retry. Currency totals are separate, never summed across currencies.

## 10. Tenant/security
Foreign org/departure/cost/payment IDs rejected; manager read/write gate; no frontend database writes or credentials. Composite relationships and private functions tested. No real provider sends or bank operations.

## 11. Acceptance
Issue correct snapshot; record partial and full settlement; inspect immutable history; reverse/cancel/correct with history intact. Retry is once-only, concurrent overpayment cannot win twice, financial source edits blocked while active. Browser proves both languages/viewports. No customer finance/profitability regression.

## 12–13. Verification
API/admin npm ci, builds, tests and admin lint. Unit route/RBAC/idempotency/balance/error tests, UI state/translation tests, real PostgreSQL constraint/ledger/rollback/reversal tests wired to migration replay, Docker and isolated full Playwright acceptance including concurrency/tenant cases. Preview health before release; production structural verification/advisors only, no synthetic production financial data.

## 14–15. Completion record
Report exact files, migration added/applied, security, test/browser evidence, deferred scope, final SHA and PR. Fill acceptance/release evidence only when proven.
