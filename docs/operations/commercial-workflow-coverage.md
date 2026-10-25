# Commercial workflow acceptance — reused evidence

Baseline: main a62122637b56208964d211d8f7e54c2f0845925c (#166). Required isolated acceptance [40215344250](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/40215344250) passed on final head fc04c484261749abdb8d0d43d1c436249eeb8b16. This reconciles existing automated contracts; it is not another production audit or hosted certification. Paths below are relative to nmt-analytics-admin/e2e/. Preserve and rerun these tests when related code changes.

| Existing business boundary | Executed acceptance contracts | Remaining commercial evidence |
| --- | --- | --- |
| Customer → group/travelers → reservation | pilot-customer-form, pilot-browser-sale, pilot-phase2, pilot-recovery | Extend only confirmed gaps; full customer-data lifecycle and role/state inventory must be reconciled |
| Capacity and reservation transitions | pilot-phase2, pilot-finance-audit, pilot-quotation-booking, pilot-quotation-lock | Destination migration/catalog parity; no customer anomaly repair authorized |
| Internal money, installments, refunds and reports | pilot-finance-audit, pilot-payment-idempotency, pilot-phase2, pilot-supplier-payables | Real-format operational acceptance/currency/state coverage; gateway activation is unrelated and deferred |
| Flights, passengers, manifests and DMC services | pilot-complete-scenarios, pilot-flight-forms | Complete remaining hotel/inventory/transport administration interactions, not only initial rendering or API endpoint existence |
| Rooming and bus seating | pilot-phase2, pilot-finance-audit | Broader operator manipulation/reload matrix and unexercised state combinations |
| Inquiries/quotations and suppliers/subagents | pilot-inquiry-quotation, pilot-quotation-booking, pilot-supplier-forms, pilot-subagent-forms, pilot-supplier-payables | Role/state and revoked access remain cross-cutting gates |
| Documents | pilot-document-upload, pilot-browser-sale, pilot-complete-scenarios | Current batch adds editor failed-read/save and persistence/conflict acceptance; actual hosted object backup/recovery still absent |
| Roles, tenant boundaries and settings | pilot-security-audit, pilot-signup-integrity; authorization-security.sql in migration replay | Complete secure staff provisioning/revocation/recovery and operator entitlement lifecycle in P5 |
| Navigation and presentation | pilot-route-audit, pilot-director-route-audit, pilot-mobile-layout, finance-forms fixtures | Initial render does not prove a completed workflow; remaining P2/P3 inventory and accessibility gates stay open |

All listed scripts run in disposable synthetic acceptance environments. Disabled integrations must not break these core workflows; local Mailpit/Storage tests are isolated substitutes and do not prove activated production services. The provider-disabled and operational account-access limitations remain explicit. The document editor additions require their own final-head CI before their evidence becomes merged evidence.

Next P1 acceptance should target actual hotel/inventory/transport create → edit → reload workflows that currently have less browser coverage, after current document persistence repairs pass. Prioritize confirmed integrity errors over visual polish. P2 administration/settings, finance/documents, operations and shared/public batches follow the functional dependencies in the master roadmap.
