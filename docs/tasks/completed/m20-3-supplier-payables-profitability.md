# M20.3 — Departure Profitability & Supplier Payables Integration

**Status:** ACTIVE
**Priority:** P1
**Branch:** `feature/supplier-payables-profitability`
**Roadmap references:** M20 (Supplier Payables), M14 (Finance & Profitability), M24 (Acceptance)

## 1. Goal

Connect departure supplier obligations and their payment ledger directly to the departure profitability endpoint and UI. Finance managers can inspect the complete financial picture for a departure in one place: customer receivables (revenue, collected, outstanding), supplier payables (estimated costs, obligations issued, amount paid, remaining debt), and realized net cash position (`collected - supplierPaid`) alongside planned gross profit.

## 2. Current problem

The departure profitability endpoint (`GET /departures/:departureId/profitability`) only computes planned costs from `departure_cost_items` and customer collections from `payments`. It has no knowledge of issued `supplier_payables` or `supplier_payable_entries`. The departure finance dashboard displays estimated costs and links to the payables panel, but provides no unified summary of:
1. Total obligations issued vs planned costs;
2. Total amount paid to suppliers through the ledger;
3. Remaining supplier debt (outstanding payables) for the departure;
4. Realized cash margin (`customer collected - supplier paid`).

## 3. Required discovery before editing

- API route `nmt-analytics-api/src/routes/departureProfitability.ts` and lib `nmt-analytics-api/src/lib/departureProfitability.ts`: inspect `loadProfitability` and `deriveDepartureFinance`.
- Table `supplier_payables` has `departure_id`, `org_id`, `amount`, `currency`, `cancelled_at`.
- Table `supplier_payable_entries` has `payable_id`, `org_id`, `amount`, `kind`.
- Existing tests in `nmt-analytics-api/src/tests/departureProfitability.test.ts` and `departureProfitabilityRoute.test.ts`.
- Admin types in `nmt-analytics-admin/src/api/departures.ts` (`DepartureProfitability`).
- Admin UI in `nmt-analytics-admin/src/pages/DepartureDetail.tsx` (Finance tab) and i18n files `en.ts` and `bs.ts`.

## 4. In scope

1. Extend API `deriveDepartureFinance` to accept optional `payables` and `payableEntries` scoped to the departure.
2. In `loadProfitability`, query `supplier_payables` and `supplier_payable_entries` for the departure within the authenticated `org_id`.
3. Compute currency-guarded metrics:
   - `supplierObligationsIssued`: sum of uncancelled payable amounts.
   - `supplierPaid`: sum of entry amounts for uncancelled payables (positive payments minus reversals).
   - `supplierOutstanding`: `supplierObligationsIssued - supplierPaid`.
   - `realizedCashProfit`: `collected - supplierPaid`.
   - Add warning `SUPPLIER_PAYABLE_CURRENCY_MISMATCH` if any active payable has a mismatched currency.
4. Update admin `DepartureProfitability` type and `DepartureDetail.tsx` Finance summary cards to display the supplier payables and realized cash status with clean visual hierarchy.
5. Provide comprehensive BS/EN translations for all new labels and tooltips.
6. Add unit and route tests in API and component tests in admin.

## 5. Out of scope

- Bank execution or gateway automation (payments remain record-only).
- Modifying the immutable ledger or obligation mutation semantics (already covered by M20.1).
- Modifying cross-departure overview RPC or filters (already covered by M20.2).
- Automatic Today readiness alerts for overdue payables (deferred to M18 / Paket 3).

## 6. Domain rules

- Cancelled obligations (`cancelled_at IS NOT NULL`) do not contribute to `supplierObligationsIssued` or `supplierOutstanding`.
- Only successful customer payments contribute to `collected`.
- Only uncancelled payable entries contribute to `supplierPaid`.
- All tenant queries are strictly scoped by `org_id`.
- Mismatched currencies do not silently blend; they produce a structured warning.

## 7. Verification

- API tests (`npm test` in `nmt-analytics-api`) passing all tests including new profitability cases.
- API build (`npm run build` in `nmt-analytics-api`) passing with clean TypeScript check.
- Admin lint, tests, and build (`npm run lint`, `npm test`, `npm run build` in `nmt-analytics-admin`) passing.
